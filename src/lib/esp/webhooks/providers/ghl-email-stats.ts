import { NextRequest, NextResponse } from 'next/server';
import { invalidateCampaignCache } from '@/lib/esp/adapters/ghl/campaigns';
import {
  eventToColumn,
  extractCampaignIds,
  type LCEmailStatsPayload,
} from '@/lib/esp/adapters/ghl/webhook';
import type { EmailStatsWebhookHandler } from '@/lib/esp/webhooks/types';
import { requestHeaders, verifyProviderWebhookSignature } from '@/lib/esp/webhooks/verification';
import { incrementEmailStatsCounter } from '@/lib/esp/webhooks/email-stats-store';

function parseEventTime(value: unknown): Date {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const ms = value < 1e11 ? value * 1000 : value;
    const numericDate = new Date(ms);
    if (!Number.isNaN(numericDate.getTime())) return numericDate;
  }

  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      const ms = asNumber < 1e11 ? asNumber * 1000 : asNumber;
      const numericDate = new Date(ms);
      if (!Number.isNaN(numericDate.getTime())) return numericDate;
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

async function handleGhlEmailStatsWebhook(req: NextRequest) {
  const rawBody = await req.text();
  const headers = requestHeaders(req);

  // Log incoming webhook for diagnostics (truncate body to avoid flooding logs)
  console.log('[webhook:ghl] Incoming LCEmailStats webhook', {
    contentLength: rawBody.length,
    hasSignature: !!headers['x-wh-signature'],
  });

  const verification = verifyProviderWebhookSignature({
    provider: 'ghl',
    rawBody,
    headers,
  });

  if (!verification.ok) {
    console.warn('[webhook:ghl] Signature verification failed', {
      hasSignature: !!verification.signature,
      hasPublicKey: !!process.env.GHL_WEBHOOK_PUBLIC_KEY,
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: LCEmailStatsPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error('[webhook:ghl] Failed to parse JSON body');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Log parsed payload structure for diagnostics
  console.log('[webhook:ghl] Parsed payload', {
    type: payload.type,
    locationId: payload.locationId,
    event: payload.webhookPayload?.event,
    hasCampaigns: !!payload.webhookPayload?.campaigns?.length,
    campaigns: payload.webhookPayload?.campaigns,
    hasTags: !!payload.webhookPayload?.tags?.length,
    tags: payload.webhookPayload?.tags,
    topLevelCampaignId: payload.campaignId,
    topLevelEmailId: payload.emailId,
    topLevelScheduleId: payload.scheduleId,
    wpCampaignId: payload.webhookPayload?.campaignId,
    wpEmailId: payload.webhookPayload?.emailId,
    wpScheduleId: payload.webhookPayload?.scheduleId,
  });

  if (payload.type !== 'LCEmailStats' || !payload.locationId || !payload.webhookPayload) {
    console.warn('[webhook:ghl] Unsupported or malformed payload', {
      type: payload.type,
      hasLocationId: !!payload.locationId,
      hasWebhookPayload: !!payload.webhookPayload,
    });
    return NextResponse.json({ error: 'Unsupported webhook type' }, { status: 400 });
  }

  const event = String(payload.webhookPayload.event || '').trim();
  const column = eventToColumn(event);
  if (!column) {
    console.log(`[webhook:ghl] Skipping unsupported event: "${event}"`);
    return NextResponse.json({ ok: true, skipped: true, reason: 'unsupported-event', event });
  }

  const campaignIds = extractCampaignIds(payload);
  if (campaignIds.length === 0) {
    // Log the full webhookPayload keys so we can see what fields GHL actually sends
    console.warn('[webhook:ghl] No resolvable campaign IDs', {
      locationId: payload.locationId,
      event,
      webhookEventId: payload.webhookPayload.id || null,
      webhookPayloadKeys: Object.keys(payload.webhookPayload),
      payloadKeys: Object.keys(payload),
    });
    return NextResponse.json({ ok: true, skipped: true, reason: 'no-campaign-id', event });
  }

  console.log(`[webhook:ghl] Processing ${event} → ${column} for campaigns: [${campaignIds.join(', ')}]`);

  const eventTime = parseEventTime(payload.webhookPayload.timestamp);
  const accountId = payload.locationId;
  let updated = 0;
  let failed = 0;

  for (const campaignId of campaignIds) {
    try {
      await incrementEmailStatsCounter({
        provider: 'ghl',
        accountId,
        campaignId,
        column,
        eventTime,
      });
      updated += 1;
    } catch (err) {
      failed += 1;
      console.error(`[webhook:ghl] Upsert failed for ${accountId}/${campaignId}:`, err);
    }
  }

  if (updated > 0) {
    invalidateCampaignCache(accountId);
  }

  console.log(`[webhook:ghl] Done: ${event} → updated=${updated}, failed=${failed}`);

  return NextResponse.json({
    ok: true,
    event,
    column,
    matchedCampaignIds: campaignIds.length,
    updated,
    failed,
  });
}

export const ghlEmailStatsWebhookHandler: EmailStatsWebhookHandler = {
  get: ({ provider, endpoint }) => NextResponse.json({
    ok: true,
    provider,
    endpoint,
    expects: 'POST provider email stats payload',
  }),
  post: (req) => handleGhlEmailStatsWebhook(req),
};
