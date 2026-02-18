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
  const verification = verifyProviderWebhookSignature({
    provider: 'ghl',
    rawBody,
    headers,
  });

  if (!verification.ok) {
    console.warn('[webhook] Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: LCEmailStatsPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (payload.type !== 'LCEmailStats' || !payload.locationId || !payload.webhookPayload) {
    return NextResponse.json({ error: 'Unsupported webhook type' }, { status: 400 });
  }

  const event = String(payload.webhookPayload.event || '').trim();
  const column = eventToColumn(event);
  if (!column) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'unsupported-event', event });
  }

  const campaignIds = extractCampaignIds(payload);
  if (campaignIds.length === 0) {
    console.warn('[webhook] LCEmailStats event received with no resolvable campaign ids', {
      locationId: payload.locationId,
      event,
      webhookEventId: payload.webhookPayload.id || null,
    });
    return NextResponse.json({ ok: true, skipped: true, reason: 'no-campaign-id', event });
  }

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
      console.error(`[webhook] Upsert failed for ghl/${accountId}/${campaignId}:`, err);
    }
  }

  if (updated > 0) {
    invalidateCampaignCache(accountId);
  }

  return NextResponse.json({
    ok: true,
    event,
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
