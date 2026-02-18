import nodemailer from 'nodemailer';
import { prisma } from '@/lib/prisma';
import { withConcurrencyLimit } from '@/lib/esp/utils';

type EmailCampaignStatus =
  | 'queued'
  | 'scheduled'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'canceled';

const PROCESSABLE_STATUSES: EmailCampaignStatus[] = ['queued', 'scheduled', 'processing'];
const TERMINAL_STATUSES: EmailCampaignStatus[] = ['completed', 'partial', 'failed', 'canceled'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export interface EmailRecipientInput {
  contactId: string;
  accountKey: string;
  email?: string;
  fullName?: string;
}

export interface CreateEmailCampaignInput {
  name?: string;
  subject: string;
  previewText?: string;
  htmlContent: string;
  textContent?: string;
  sourceType?: string;
  recipients: EmailRecipientInput[];
  scheduledFor?: string | null;
  createdByUserId?: string;
  createdByRole?: string;
  sourceAudienceId?: string | null;
  sourceFilter?: string | null;
  metadata?: string | null;
}

export interface EmailCampaignSummary {
  id: string;
  name: string;
  subject: string;
  previewText: string;
  sourceType: string;
  status: EmailCampaignStatus;
  scheduledFor: string;
  startedAt: string;
  completedAt: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  accountKeys: string[];
  createdAt: string;
  updatedAt: string;
  error: string;
}

function parseAccountKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((entry) => String(entry).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeRecipient(input: EmailRecipientInput): EmailRecipientInput | null {
  const contactId = String(input.contactId || '').trim();
  const accountKey = String(input.accountKey || '').trim();
  const email = String(input.email || '').trim().toLowerCase();

  if (!contactId || !accountKey) return null;
  if (!email || !EMAIL_REGEX.test(email)) {
    return {
      contactId,
      accountKey,
      email: '',
      fullName: String(input.fullName || '').trim(),
    };
  }

  return {
    contactId,
    accountKey,
    email,
    fullName: String(input.fullName || '').trim(),
  };
}

function dedupeRecipients(recipients: EmailRecipientInput[]): EmailRecipientInput[] {
  const map = new Map<string, EmailRecipientInput>();
  for (const recipient of recipients) {
    const normalized = normalizeRecipient(recipient);
    if (!normalized) continue;
    const key = `${normalized.accountKey}::${normalized.contactId}`;
    if (!map.has(key)) map.set(key, normalized);
  }
  return [...map.values()];
}

function normalizeSourceType(value: string | null | undefined): string {
  const sourceType = String(value || '').trim().toLowerCase();
  if (sourceType === 'drag-drop' || sourceType === 'html' || sourceType === 'template-library') {
    return sourceType;
  }
  return 'template-library';
}

function sanitizeSubject(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function sanitizeHtml(value: string): string {
  return value.trim();
}

function sanitizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function withPreviewText(htmlContent: string, previewText: string): string {
  const text = previewText.trim();
  if (!text) return htmlContent;

  const hiddenPreview = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${text}</div>`;
  if (/<body[^>]*>/i.test(htmlContent)) {
    return htmlContent.replace(/<body[^>]*>/i, (match) => `${match}${hiddenPreview}`);
  }
  return `${hiddenPreview}${htmlContent}`;
}

function buildCampaignMetadata(input: CreateEmailCampaignInput): string | null {
  const payload = {
    sourceType: normalizeSourceType(input.sourceType),
    sourceMetadata: input.metadata || '',
  };
  return JSON.stringify(payload);
}

function parseCampaignMetadata(raw: string | null | undefined): {
  sourceType: string;
} {
  if (!raw) {
    return { sourceType: 'template-library' };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      sourceType: normalizeSourceType(String(parsed.sourceType || '')),
    };
  } catch {
    return { sourceType: 'template-library' };
  }
}

function toSummary(row: {
  id: string;
  name: string | null;
  subject: string;
  previewText: string | null;
  sourceType: string;
  status: string;
  scheduledFor: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  accountKeys: string;
  createdAt: Date;
  updatedAt: Date;
  error: string | null;
}): EmailCampaignSummary {
  return {
    id: row.id,
    name: row.name || '',
    subject: row.subject,
    previewText: row.previewText || '',
    sourceType: row.sourceType || 'template-library',
    status: row.status as EmailCampaignStatus,
    scheduledFor: row.scheduledFor?.toISOString() || '',
    startedAt: row.startedAt?.toISOString() || '',
    completedAt: row.completedAt?.toISOString() || '',
    totalRecipients: row.totalRecipients,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
    accountKeys: parseAccountKeys(row.accountKeys),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    error: row.error || '',
  };
}

function getTransportConfig(): {
  from: string;
  transporter: nodemailer.Transporter;
} {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || '587');
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
    throw new Error(
      'Email sending is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and optionally SMTP_FROM.',
    );
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number.isFinite(smtpPort) ? smtpPort : 587,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  return {
    from: smtpFrom,
    transporter,
  };
}

export async function createEmailCampaign(input: CreateEmailCampaignInput): Promise<EmailCampaignSummary> {
  const subject = sanitizeSubject(input.subject || '');
  const htmlContent = sanitizeHtml(input.htmlContent || '');
  const textContent = sanitizeText(input.textContent || '');
  const previewText = String(input.previewText || '').trim();
  const sourceType = normalizeSourceType(input.sourceType);

  if (!subject) throw new Error('Email subject is required');
  if (!htmlContent) throw new Error('Email HTML content is required');

  const recipients = dedupeRecipients(input.recipients || []);
  if (recipients.length === 0) throw new Error('At least one recipient is required');

  const sendableRecipients = recipients.filter((recipient) => Boolean(recipient.email));
  if (sendableRecipients.length === 0) throw new Error('No recipients with valid email addresses were provided');

  const scheduledDate = parseDate(input.scheduledFor || undefined);
  const now = Date.now();
  const status: EmailCampaignStatus =
    scheduledDate && scheduledDate.getTime() > now
      ? 'scheduled'
      : 'queued';
  const accountKeys = [...new Set(recipients.map((recipient) => recipient.accountKey))];

  const created = await prisma.$transaction(async (tx) => {
    const campaign = await tx.emailCampaign.create({
      data: {
        name: input.name?.trim() || null,
        subject,
        previewText: previewText || null,
        htmlContent,
        textContent: textContent || null,
        sourceType,
        status,
        scheduledFor: scheduledDate,
        createdByUserId: input.createdByUserId || null,
        createdByRole: input.createdByRole || null,
        sourceAudienceId: input.sourceAudienceId || null,
        sourceFilter: input.sourceFilter || null,
        accountKeys: JSON.stringify(accountKeys),
        totalRecipients: recipients.length,
        metadata: buildCampaignMetadata(input),
      },
    });

    await tx.emailCampaignRecipient.createMany({
      data: recipients.map((recipient) => ({
        campaignId: campaign.id,
        contactId: recipient.contactId,
        accountKey: recipient.accountKey,
        email: recipient.email || null,
        fullName: recipient.fullName || null,
        status: recipient.email ? 'pending' : 'failed',
        error: recipient.email ? null : 'Recipient email is missing or invalid',
      })),
    });

    return campaign;
  });

  return toSummary(created);
}

export async function getEmailCampaign(campaignId: string): Promise<EmailCampaignSummary | null> {
  const row = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
  });
  return row ? toSummary(row) : null;
}

export async function listEmailCampaigns(options?: {
  limit?: number;
  accountKeys?: string[];
}): Promise<EmailCampaignSummary[]> {
  const limit = Math.max(1, Math.min(100, options?.limit ?? 25));
  const rows = await prisma.emailCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit * 4,
  });

  const allowedAccountKeys = options?.accountKeys && options.accountKeys.length > 0
    ? new Set(options.accountKeys)
    : null;

  return rows
    .filter((row) => {
      if (!allowedAccountKeys) return true;
      const keys = parseAccountKeys(row.accountKeys);
      return keys.some((key) => allowedAccountKeys.has(key));
    })
    .slice(0, limit)
    .map(toSummary);
}

async function summarizeCampaign(campaignId: string) {
  const recipients = await prisma.emailCampaignRecipient.findMany({
    where: { campaignId },
    select: { status: true, error: true },
  });

  let pending = 0;
  let sent = 0;
  let failed = 0;
  let firstError = '';

  for (const row of recipients) {
    if (row.status === 'sent') sent += 1;
    else if (row.status === 'failed') {
      failed += 1;
      if (!firstError && row.error) firstError = row.error;
    } else pending += 1;
  }

  return {
    total: recipients.length,
    pending,
    sent,
    failed,
    firstError,
  };
}

export async function processEmailCampaign(
  campaignId: string,
  options?: { concurrency?: number },
): Promise<EmailCampaignSummary> {
  const concurrency = Math.max(1, Math.min(8, options?.concurrency ?? 3));
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    include: {
      recipients: {
        where: { status: 'pending' },
        select: { id: true, email: true, fullName: true },
      },
    },
  });

  if (!campaign) throw new Error('Email campaign not found');
  if (TERMINAL_STATUSES.includes(campaign.status as EmailCampaignStatus)) {
    return toSummary(campaign);
  }

  if (campaign.recipients.length === 0) {
    const counts = await summarizeCampaign(campaign.id);
    const status: EmailCampaignStatus =
      counts.sent > 0 && counts.failed > 0
        ? 'partial'
        : counts.sent > 0
          ? 'completed'
          : counts.failed > 0
            ? 'failed'
            : 'queued';
    const updated = await prisma.emailCampaign.update({
      where: { id: campaign.id },
      data: {
        status,
        totalRecipients: counts.total,
        sentCount: counts.sent,
        failedCount: counts.failed,
        completedAt: status === 'queued' ? null : new Date(),
        error: counts.firstError || null,
      },
    });
    return toSummary(updated);
  }

  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: {
      status: 'processing',
      startedAt: campaign.startedAt || new Date(),
      completedAt: null,
      error: null,
    },
  });

  const { transporter, from } = getTransportConfig();
  const metadata = parseCampaignMetadata(campaign.metadata);
  const html = withPreviewText(campaign.htmlContent, campaign.previewText || '');
  const text = campaign.textContent?.trim() || stripHtml(campaign.htmlContent);

  const tasks = campaign.recipients.map((recipient) => async () => {
    if (!recipient.email || !EMAIL_REGEX.test(recipient.email)) {
      await prisma.emailCampaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: 'failed',
          error: 'Recipient email is missing or invalid',
        },
      });
      return;
    }

    try {
      const info = await transporter.sendMail({
        from,
        to: recipient.email,
        subject: campaign.subject,
        html,
        text,
      });

      await prisma.emailCampaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: 'sent',
          messageId: info.messageId || null,
          sentAt: new Date(),
          error: null,
        },
      });
    } catch (err) {
      await prisma.emailCampaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Failed to send email',
        },
      });
    }
  });

  await withConcurrencyLimit(tasks, concurrency);

  const counts = await summarizeCampaign(campaign.id);
  const nextStatus: EmailCampaignStatus =
    counts.pending > 0
      ? 'processing'
      : counts.sent > 0 && counts.failed > 0
        ? 'partial'
        : counts.sent > 0
          ? 'completed'
          : counts.failed > 0
            ? 'failed'
            : 'queued';

  const updated = await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: {
      sourceType: metadata.sourceType,
      status: nextStatus,
      totalRecipients: counts.total,
      sentCount: counts.sent,
      failedCount: counts.failed,
      completedAt: nextStatus === 'processing' || nextStatus === 'queued' ? null : new Date(),
      error: counts.firstError || null,
    },
  });

  return toSummary(updated);
}

export async function processDueEmailCampaigns(options?: {
  limit?: number;
  accountKeys?: string[];
  concurrency?: number;
}): Promise<EmailCampaignSummary[]> {
  const limit = Math.max(1, Math.min(20, options?.limit ?? 5));
  const now = new Date();

  const rows = await prisma.emailCampaign.findMany({
    where: {
      status: { in: PROCESSABLE_STATUSES },
      OR: [
        { scheduledFor: null },
        { scheduledFor: { lte: now } },
      ],
    },
    orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
    take: limit * 4,
  });

  const allowedAccountKeys = options?.accountKeys && options.accountKeys.length > 0
    ? new Set(options.accountKeys)
    : null;

  const queue = rows
    .filter((row) => {
      if (!allowedAccountKeys) return true;
      const keys = parseAccountKeys(row.accountKeys);
      return keys.some((key) => allowedAccountKeys.has(key));
    })
    .slice(0, limit);

  const summaries: EmailCampaignSummary[] = [];
  for (const row of queue) {
    const summary = await processEmailCampaign(row.id, { concurrency: options?.concurrency });
    summaries.push(summary);
  }

  return summaries;
}
