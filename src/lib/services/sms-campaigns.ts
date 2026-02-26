import { prisma } from '@/lib/prisma';
import '@/lib/esp/init';
import { getAdapterForAccount } from '@/lib/esp/registry';
import { withConcurrencyLimit } from '@/lib/esp/utils';
import type { OutboundMessageChannel, MessagesAdapter } from '@/lib/esp/types';
import { providerUnsupportedMessage } from '@/lib/esp/provider-display';

type SmsCampaignStatus =
  | 'queued'
  | 'scheduled'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'canceled';

export interface SmsRecipientInput {
  contactId: string;
  accountKey: string;
  phone?: string;
  fullName?: string;
}

export interface CreateSmsCampaignInput {
  name?: string;
  message: string;
  channel?: OutboundMessageChannel;
  mediaUrls?: string[];
  recipients: SmsRecipientInput[];
  scheduledFor?: string | null;
  createdByUserId?: string;
  createdByRole?: string;
  sourceAudienceId?: string | null;
  sourceFilter?: string | null;
  metadata?: string | null;
}

export interface SmsCampaignSummary {
  id: string;
  name: string;
  message: string;
  status: SmsCampaignStatus;
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

const PROCESSABLE_STATUSES: SmsCampaignStatus[] = ['queued', 'scheduled', 'processing'];
const TERMINAL_STATUSES: SmsCampaignStatus[] = ['completed', 'partial', 'failed', 'canceled'];

type ResolvedMessagingRuntime =
  | {
      adapter: MessagesAdapter;
      provider: string;
      token: string;
      locationId: string;
    }
  | {
      error: string;
    };

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

function normalizeRecipient(input: SmsRecipientInput): SmsRecipientInput | null {
  const contactId = String(input.contactId || '').trim();
  const accountKey = String(input.accountKey || '').trim();
  if (!contactId || !accountKey) return null;

  return {
    contactId,
    accountKey,
    phone: input.phone ? String(input.phone).trim() : '',
    fullName: input.fullName ? String(input.fullName).trim() : '',
  };
}

function dedupeRecipients(recipients: SmsRecipientInput[]): SmsRecipientInput[] {
  const map = new Map<string, SmsRecipientInput>();
  for (const recipient of recipients) {
    const normalized = normalizeRecipient(recipient);
    if (!normalized) continue;
    const key = `${normalized.accountKey}::${normalized.contactId}`;
    if (!map.has(key)) map.set(key, normalized);
  }
  return [...map.values()];
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function sanitizeMessage(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function normalizeChannel(value: unknown): OutboundMessageChannel {
  const text = String(value || '').trim().toUpperCase();
  return text === 'MMS' ? 'MMS' : 'SMS';
}

function normalizeMediaUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const urls = raw
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .filter((url) => /^https?:\/\/\S+$/i.test(url));
  return [...new Set(urls)];
}

function buildCampaignMetadata(input: CreateSmsCampaignInput): string | null {
  const payload = {
    channel: normalizeChannel(input.channel),
    mediaUrls: normalizeMediaUrls(input.mediaUrls),
    sourceMetadata: input.metadata || '',
  };
  return JSON.stringify(payload);
}

function parseCampaignMetadata(raw: string | null | undefined): {
  channel: OutboundMessageChannel;
  mediaUrls: string[];
} {
  if (!raw) {
    return { channel: 'SMS', mediaUrls: [] };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      channel: normalizeChannel(parsed.channel),
      mediaUrls: normalizeMediaUrls(parsed.mediaUrls),
    };
  } catch {
    return { channel: 'SMS', mediaUrls: [] };
  }
}

function toSummary(row: {
  id: string;
  name: string | null;
  message: string;
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
}): SmsCampaignSummary {
  return {
    id: row.id,
    name: row.name || '',
    message: row.message,
    status: row.status as SmsCampaignStatus,
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

const smsCampaignSummarySelect = {
  id: true,
  name: true,
  message: true,
  status: true,
  scheduledFor: true,
  startedAt: true,
  completedAt: true,
  totalRecipients: true,
  sentCount: true,
  failedCount: true,
  accountKeys: true,
  createdAt: true,
  updatedAt: true,
  error: true,
} as const;

export async function createSmsCampaign(input: CreateSmsCampaignInput): Promise<SmsCampaignSummary> {
  const message = sanitizeMessage(input.message || '');
  const channel = normalizeChannel(input.channel);
  const mediaUrls = normalizeMediaUrls(input.mediaUrls);
  if (!message && mediaUrls.length === 0) throw new Error('Message or media URLs are required');
  if (message.length > 640) throw new Error(`${channel} must be 640 characters or fewer`);

  const recipients = dedupeRecipients(input.recipients || []);
  if (recipients.length === 0) throw new Error('At least one recipient is required');

  const scheduledDate = parseDate(input.scheduledFor || undefined);
  const now = Date.now();
  const status: SmsCampaignStatus =
    scheduledDate && scheduledDate.getTime() > now
      ? 'scheduled'
      : 'queued';
  const accountKeys = [...new Set(recipients.map((recipient) => recipient.accountKey))];

  const created = await prisma.$transaction(async (tx) => {
    const campaign = await tx.smsCampaign.create({
      data: {
        name: input.name?.trim() || null,
        message,
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

    await tx.smsCampaignRecipient.createMany({
      data: recipients.map((recipient) => ({
        campaignId: campaign.id,
        contactId: recipient.contactId,
        accountKey: recipient.accountKey,
        phone: recipient.phone || null,
        fullName: recipient.fullName || null,
      })),
    });

    return campaign;
  });

  return toSummary(created);
}

export async function getSmsCampaign(campaignId: string): Promise<SmsCampaignSummary | null> {
  const row = await prisma.smsCampaign.findUnique({
    where: { id: campaignId },
    select: smsCampaignSummarySelect,
  });
  return row ? toSummary(row) : null;
}

export async function listSmsCampaigns(options?: {
  limit?: number;
  accountKeys?: string[];
}): Promise<SmsCampaignSummary[]> {
  const limit = Math.max(1, Math.min(100, options?.limit ?? 25));
  const rows = await prisma.smsCampaign.findMany({
    select: smsCampaignSummarySelect,
    orderBy: { createdAt: 'desc' },
    take: limit * 4,
  });

  const allowedAccountKeys = options?.accountKeys && options.accountKeys.length > 0
    ? new Set(options.accountKeys)
    : null;

  const summaries = rows
    .filter((row) => {
      if (!allowedAccountKeys) return true;
      const keys = parseAccountKeys(row.accountKeys);
      return keys.some((key) => allowedAccountKeys.has(key));
    })
    .slice(0, limit)
    .map(toSummary);

  return summaries;
}

async function summarizeCampaign(campaignId: string) {
  const recipients = await prisma.smsCampaignRecipient.findMany({
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

export async function processSmsCampaign(
  campaignId: string,
  options?: { concurrency?: number },
): Promise<SmsCampaignSummary> {
  const concurrency = Math.max(1, Math.min(8, options?.concurrency ?? 4));
  const campaign = await prisma.smsCampaign.findUnique({
    where: { id: campaignId },
    include: {
      recipients: {
        where: { status: 'pending' },
        select: { id: true, contactId: true, accountKey: true },
      },
    },
  });

  if (!campaign) throw new Error('SMS campaign not found');
  if (TERMINAL_STATUSES.includes(campaign.status as SmsCampaignStatus)) {
    return toSummary(campaign);
  }
  if (campaign.recipients.length === 0) {
    const counts = await summarizeCampaign(campaign.id);
    const status: SmsCampaignStatus =
      counts.sent > 0 && counts.failed > 0
        ? 'partial'
        : counts.sent > 0
          ? 'completed'
          : counts.failed > 0
            ? 'failed'
            : 'queued';
    const updated = await prisma.smsCampaign.update({
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

  await prisma.smsCampaign.update({
    where: { id: campaign.id },
    data: {
      status: 'processing',
      startedAt: campaign.startedAt || new Date(),
      completedAt: null,
      error: null,
    },
  });

  const campaignMessageOptions = parseCampaignMetadata(campaign.metadata);
  const runtimeByAccount = new Map<string, ResolvedMessagingRuntime>();

  async function resolveMessagingRuntime(accountKey: string): Promise<ResolvedMessagingRuntime> {
    const cached = runtimeByAccount.get(accountKey);
    if (cached) return cached;

    try {
      const adapter = await getAdapterForAccount(accountKey);
      if (!adapter.contacts) {
        const unsupported = {
          error: providerUnsupportedMessage(adapter.provider, 'contacts'),
        } satisfies ResolvedMessagingRuntime;
        runtimeByAccount.set(accountKey, unsupported);
        return unsupported;
      }
      if (!adapter.messages) {
        const unsupported = {
          error: providerUnsupportedMessage(adapter.provider, 'direct messaging'),
        } satisfies ResolvedMessagingRuntime;
        runtimeByAccount.set(accountKey, unsupported);
        return unsupported;
      }

      const credentials = await adapter.contacts.resolveCredentials(accountKey);
      if (!credentials) {
        const disconnected = {
          error: `ESP not connected for recipient account (${adapter.provider})`,
        } satisfies ResolvedMessagingRuntime;
        runtimeByAccount.set(accountKey, disconnected);
        return disconnected;
      }

      const resolved = {
        adapter: adapter.messages,
        provider: adapter.provider,
        token: credentials.token,
        locationId: credentials.locationId,
      } satisfies ResolvedMessagingRuntime;
      runtimeByAccount.set(accountKey, resolved);
      return resolved;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resolve messaging provider';
      const failed = { error: message } satisfies ResolvedMessagingRuntime;
      runtimeByAccount.set(accountKey, failed);
      return failed;
    }
  }

  const tasks = campaign.recipients.map((recipient) => async () => {
    const { id, contactId, accountKey } = recipient;

    const runtime = await resolveMessagingRuntime(accountKey);
    if ('error' in runtime) {
      await prisma.smsCampaignRecipient.update({
        where: { id },
        data: {
          status: 'failed',
          error: runtime.error,
        },
      });
      return;
    }

    try {
      const sent = await runtime.adapter.sendMessageToContact({
        token: runtime.token,
        locationId: runtime.locationId,
        contactId,
        message: campaign.message,
        channel: campaignMessageOptions.channel,
        mediaUrls: campaignMessageOptions.mediaUrls,
      });

      await prisma.smsCampaignRecipient.update({
        where: { id },
        data: {
          status: 'sent',
          messageId: sent.id || null,
          conversationId: sent.conversationId || null,
          sentAt: new Date(),
          error: null,
        },
      });
    } catch (err) {
      await prisma.smsCampaignRecipient.update({
        where: { id },
        data: {
          status: 'failed',
          error: err instanceof Error ? err.message : `Failed to send message (${runtime.provider})`,
        },
      });
    }
  });

  await withConcurrencyLimit(tasks, concurrency);

  const counts = await summarizeCampaign(campaign.id);
  const nextStatus: SmsCampaignStatus =
    counts.pending > 0
      ? 'processing'
      : counts.sent > 0 && counts.failed > 0
        ? 'partial'
        : counts.sent > 0
          ? 'completed'
          : counts.failed > 0
            ? 'failed'
            : 'queued';

  const updated = await prisma.smsCampaign.update({
    where: { id: campaign.id },
    data: {
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

export async function processDueSmsCampaigns(options?: {
  limit?: number;
  accountKeys?: string[];
  concurrency?: number;
}): Promise<SmsCampaignSummary[]> {
  const limit = Math.max(1, Math.min(20, options?.limit ?? 5));
  const now = new Date();

  const rows = await prisma.smsCampaign.findMany({
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

  const summaries: SmsCampaignSummary[] = [];
  for (const row of queue) {
    const summary = await processSmsCampaign(row.id, { concurrency: options?.concurrency });
    summaries.push(summary);
  }

  return summaries;
}
