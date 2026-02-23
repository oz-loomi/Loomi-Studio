import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import {
  createSmsCampaign,
  listSmsCampaigns,
  processSmsCampaign,
  type SmsRecipientInput,
} from '@/lib/services/sms-campaigns';
import type { OutboundMessageChannel } from '@/lib/esp/types';

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeRecipients(raw: unknown): SmsRecipientInput[] {
  if (!Array.isArray(raw)) return [];
  const recipients: SmsRecipientInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const contactId = String(row.contactId || '').trim();
    const accountKey = String(row.accountKey || '').trim();
    if (!contactId || !accountKey) continue;

    recipients.push({
      contactId,
      accountKey,
      phone: String(row.phone || '').trim(),
      fullName: String(row.fullName || '').trim(),
    });
  }
  return recipients;
}

function normalizeChannel(value: unknown): OutboundMessageChannel {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return text === 'MMS' ? 'MMS' : 'SMS';
}

function normalizeMediaUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .filter((url) => /^https?:\/\/\S+$/i.test(url));
  return [...new Set(urls)];
}

/**
 * GET /api/esp/messages/bulk
 *
 * Lists recent bulk outbound message campaigns.
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireRole('developer', 'super_admin', 'admin', 'client');
  if (error) return error;

  const limitRaw = Number(req.nextUrl.searchParams.get('limit') || '20');
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 20;
  const accountKeys = session!.user.role === 'client'
    ? (session!.user.accountKeys ?? [])
    : undefined;

  const campaigns = await listSmsCampaigns({ limit, accountKeys });
  return NextResponse.json({ campaigns });
}

/**
 * POST /api/esp/messages/bulk
 *
 * Creates a bulk outbound message campaign and optionally processes it immediately.
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireRole('developer', 'super_admin', 'admin', 'client');
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const message = typeof body?.message === 'string' ? body.message : '';
  const channel = normalizeChannel(body?.channel);
  const mediaUrls = normalizeMediaUrls(body?.mediaUrls);
  const scheduledForRaw = body?.scheduledFor;
  const scheduledFor = parseDate(scheduledForRaw);
  const recipients = normalizeRecipients(body?.recipients);
  const processNow = typeof body?.processNow === 'boolean'
    ? body.processNow
    : !(scheduledFor && scheduledFor.getTime() > Date.now());

  if (!message.trim() && mediaUrls.length === 0) {
    return NextResponse.json({ error: 'message or mediaUrls is required' }, { status: 400 });
  }
  if (recipients.length === 0) {
    return NextResponse.json({ error: 'At least one recipient is required' }, { status: 400 });
  }
  if (recipients.length > 500) {
    return NextResponse.json({ error: 'Recipient limit is 500 per bulk send' }, { status: 400 });
  }

  if (session!.user.role === 'client') {
    const allowed = new Set(session!.user.accountKeys ?? []);
    const forbiddenRecipient = recipients.find((recipient) => !allowed.has(recipient.accountKey));
    if (forbiddenRecipient) {
      return NextResponse.json({ error: 'Forbidden recipient account selection' }, { status: 403 });
    }
  }

  try {
    const created = await createSmsCampaign({
      name: typeof body?.name === 'string' ? body.name : '',
      message,
      channel,
      mediaUrls,
      recipients,
      scheduledFor: scheduledFor?.toISOString() || null,
      createdByUserId: session!.user.id,
      createdByRole: session!.user.role,
      sourceAudienceId: typeof body?.audienceId === 'string' ? body.audienceId : null,
      sourceFilter: typeof body?.sourceFilter === 'string' ? body.sourceFilter : null,
      metadata: typeof body?.metadata === 'string' ? body.metadata : null,
    });

    if (!processNow) {
      return NextResponse.json({ campaign: created, processed: false }, { status: 201 });
    }

    const processed = await processSmsCampaign(created.id, { concurrency: 4 });
    return NextResponse.json({ campaign: processed, processed: true }, { status: 201 });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : 'Failed to create bulk message campaign';
    const status = messageText.toLowerCase().includes('required') ? 400 : 500;
    return NextResponse.json({ error: messageText }, { status });
  }
}
