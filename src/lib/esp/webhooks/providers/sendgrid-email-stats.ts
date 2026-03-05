import { NextRequest, NextResponse } from 'next/server';
import type { EmailStatsWebhookHandler } from '@/lib/esp/webhooks/types';
import { requestHeaders, verifyProviderWebhookSignature } from '@/lib/esp/webhooks/verification';
import {
  incrementEmailStatsCounter,
  type EmailStatsColumn,
} from '@/lib/esp/webhooks/email-stats-store';
import { invalidateCampaignCache } from '@/lib/esp/adapters/sendgrid/campaigns';

// ── SendGrid Event Webhook Payload Types ──

/**
 * SendGrid Event Webhook sends an array of event objects.
 * Each event includes custom_args we inject at send time (loomi_campaign_id, loomi_account_key).
 */
interface SendGridEvent {
  email?: string;
  timestamp?: number;
  event?: string;
  sg_message_id?: string;
  /** Custom args injected at send time for Loomi correlation */
  loomi_campaign_id?: string;
  loomi_account_key?: string;
  /** Fallback: some events nest these differently */
  [key: string]: unknown;
}

type ParsedSendGridEvent = {
  accountId: string;
  campaignId: string;
  event: string;
  column: EmailStatsColumn;
  timestamp: Date;
};

// ── Event Mapping ──

function eventToColumn(event: string): EmailStatsColumn | null {
  const normalized = event.toLowerCase().trim();
  switch (normalized) {
    case 'delivered':
      return 'deliveredCount';
    case 'open':
      return 'openedCount';
    case 'click':
      return 'clickedCount';
    case 'bounce':
    case 'dropped':
    case 'deferred':
      return 'bouncedCount';
    case 'spamreport':
    case 'spam_report':
      return 'complainedCount';
    case 'unsubscribe':
    case 'group_unsubscribe':
      return 'unsubscribedCount';
    default:
      return null;
  }
}

function parseEventTime(value: unknown): Date {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    // SendGrid timestamps are Unix seconds
    const ms = value < 1e11 ? value * 1000 : value;
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) return date;
  }

  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      const ms = asNumber < 1e11 ? asNumber * 1000 : asNumber;
      const date = new Date(ms);
      if (!Number.isNaN(date.getTime())) return date;
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

// ── Event Parsing ──

function parseSendGridEvents(payload: unknown): ParsedSendGridEvent[] {
  // SendGrid sends an array of event objects
  const events = Array.isArray(payload) ? payload : [payload];
  const parsed: ParsedSendGridEvent[] = [];

  for (const raw of events) {
    if (!raw || typeof raw !== 'object') continue;
    const event = raw as SendGridEvent;

    const eventName = typeof event.event === 'string' ? event.event : '';
    const column = eventToColumn(eventName);
    if (!column) continue;

    // Require our custom_args for campaign correlation
    const campaignId = typeof event.loomi_campaign_id === 'string'
      ? event.loomi_campaign_id.trim()
      : '';
    if (!campaignId) continue;

    const accountId = typeof event.loomi_account_key === 'string'
      ? event.loomi_account_key.trim()
      : '';
    if (!accountId) continue;

    const timestamp = parseEventTime(event.timestamp);

    parsed.push({
      accountId,
      campaignId,
      event: eventName,
      column,
      timestamp,
    });
  }

  return parsed;
}

// ── Webhook Handler ──

async function handleSendGridEmailStatsWebhook(req: NextRequest) {
  const rawBody = await req.text();
  const headers = requestHeaders(req);

  console.log('[webhook:sendgrid] Incoming Event Webhook', {
    contentLength: rawBody.length,
    hasSignature: !!headers['x-twilio-email-event-webhook-signature'],
    hasTimestamp: !!headers['x-twilio-email-event-webhook-timestamp'],
  });

  const verification = verifyProviderWebhookSignature({
    provider: 'sendgrid',
    rawBody,
    headers,
    signatureHeaderCandidates: ['x-twilio-email-event-webhook-signature'],
  });

  if (!verification.ok) {
    console.warn('[webhook:sendgrid] Signature verification failed', {
      hasSignature: !!verification.signature,
      hasPublicKey: !!process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY,
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error('[webhook:sendgrid] Failed to parse JSON body');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const events = parseSendGridEvents(payload);
  if (events.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'no-mappable-email-stats-events' });
  }

  let updated = 0;
  let failed = 0;
  const accountIdsToInvalidate = new Set<string>();

  for (const entry of events) {
    const { accountId, campaignId, column, timestamp } = entry;
    try {
      await incrementEmailStatsCounter({
        provider: 'sendgrid',
        accountId,
        campaignId,
        column,
        eventTime: timestamp,
      });
      accountIdsToInvalidate.add(accountId);
      updated += 1;
    } catch (err) {
      failed += 1;
      console.error(`[webhook:sendgrid] Stats upsert failed for sendgrid/${accountId}/${campaignId}:`, err);
    }
  }

  for (const accountId of accountIdsToInvalidate) {
    invalidateCampaignCache(accountId);
  }

  console.log('[webhook:sendgrid] Processed events', {
    total: events.length,
    updated,
    failed,
  });

  return NextResponse.json({
    ok: true,
    updated,
    failed,
    processedEvents: events.length,
  });
}

export const sendgridEmailStatsWebhookHandler: EmailStatsWebhookHandler = {
  get: ({ provider, endpoint }) => NextResponse.json({
    ok: true,
    provider,
    endpoint,
    expects: 'POST SendGrid Event Webhook payloads (array of event objects)',
  }),
  post: (req) => handleSendGridEmailStatsWebhook(req),
};
