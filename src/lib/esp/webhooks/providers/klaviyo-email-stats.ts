import { NextRequest, NextResponse } from 'next/server';
import { invalidateCampaignCache } from '@/lib/esp/adapters/klaviyo/campaigns';
import type { EmailStatsWebhookHandler } from '@/lib/esp/webhooks/types';
import { requestHeaders, verifyProviderWebhookSignature } from '@/lib/esp/webhooks/verification';
import {
  incrementEmailStatsCounter,
  type EmailStatsColumn,
} from '@/lib/esp/webhooks/email-stats-store';

type ParsedKlaviyoEvent = {
  accountId: string;
  campaignId: string;
  event: string;
  column: EmailStatsColumn;
  timestamp: Date;
};

function asRecord(value: unknown): Record<string, unknown> {
  return (value && typeof value === 'object' && !Array.isArray(value))
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

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

function readByPath(source: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cursor: unknown = source;
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function firstStringByPaths(sources: Record<string, unknown>[], paths: string[]): string {
  for (const source of sources) {
    for (const path of paths) {
      const value = readByPath(source, path);
      const text = normalizeText(value);
      if (text) return text;
    }
  }
  return '';
}

function allStringsByPaths(sources: Record<string, unknown>[], paths: string[]): string[] {
  const values = new Set<string>();
  for (const source of sources) {
    for (const path of paths) {
      const raw = readByPath(source, path);
      if (typeof raw === 'string' && raw.trim()) {
        values.add(raw.trim());
        continue;
      }
      if (Array.isArray(raw)) {
        for (const item of raw) {
          const text = normalizeText(item);
          if (text) values.add(text);
        }
      }
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const idText = normalizeText((raw as Record<string, unknown>).id);
        if (idText) values.add(idText);
      }
    }
  }
  return [...values];
}

function eventToColumn(event: string): EmailStatsColumn | null {
  const normalized = event.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.includes('unsubscribe')) return 'unsubscribedCount';
  if (normalized.includes('complain') || normalized.includes('spam')) return 'complainedCount';
  if (normalized.includes('bounce')) return 'bouncedCount';
  if (normalized.includes('click')) return 'clickedCount';
  if (normalized.includes('open')) return 'openedCount';
  if (normalized.includes('deliver')) return 'deliveredCount';
  return null;
}

function extractRootEvents(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload);
  if (Array.isArray(root.data)) {
    return root.data.map(asRecord);
  }
  if (root.data && typeof root.data === 'object') {
    return [asRecord(root.data)];
  }
  if (Array.isArray(root.events)) {
    return root.events.map(asRecord);
  }
  return [root];
}

function parseKlaviyoEvents(payload: unknown): ParsedKlaviyoEvent[] {
  const root = asRecord(payload);
  const rootSources = [root, asRecord(root.attributes), asRecord(root.meta)];
  const rootAccountId = firstStringByPaths(rootSources, [
    'account_id',
    'accountId',
    'organization_id',
    'organizationId',
    'company_id',
    'companyId',
    'relationships.account.data.id',
    'account.id',
  ]);

  const parsed: ParsedKlaviyoEvent[] = [];
  const rootEvents = extractRootEvents(payload);

  for (const eventRoot of rootEvents) {
    const attrs = asRecord(eventRoot.attributes);
    const eventProps = asRecord(attrs.event_properties);
    const properties = asRecord(attrs.properties);
    const metric = asRecord(eventRoot.metric);
    const sources = [eventRoot, attrs, eventProps, properties, metric];

    const eventName = firstStringByPaths(sources, [
      'event',
      'event_name',
      'eventName',
      'metric.name',
      'name',
      'attributes.name',
    ]);
    const column = eventToColumn(eventName);
    if (!column) continue;

    const accountId = firstStringByPaths(sources, [
      'account_id',
      'accountId',
      'organization_id',
      'organizationId',
      'company_id',
      'companyId',
      'relationships.account.data.id',
      'account.id',
    ]) || rootAccountId;
    if (!accountId) continue;

    const campaignIds = allStringsByPaths(sources, [
      'campaign_id',
      'campaignId',
      'campaign.id',
      'campaign_ids',
      'campaignIds',
      'message.campaign_id',
      'message.campaignId',
      'event_properties.campaign_id',
      'event_properties.campaignId',
      'properties.campaign_id',
      'properties.campaignId',
      'relationships.campaign.data.id',
      'data.relationships.campaign.data.id',
    ]);
    if (campaignIds.length === 0) continue;

    const timestamp = parseEventTime(firstStringByPaths(sources, [
      'timestamp',
      'datetime',
      'occurred_at',
      'occurredAt',
      'created',
      'created_at',
      'attributes.timestamp',
    ]));

    for (const campaignId of campaignIds) {
      parsed.push({
        accountId,
        campaignId,
        event: eventName || 'unknown',
        column,
        timestamp,
      });
    }
  }

  return parsed;
}

async function handleKlaviyoEmailStatsWebhook(req: NextRequest) {
  const rawBody = await req.text();
  const headers = requestHeaders(req);
  const verification = verifyProviderWebhookSignature({
    provider: 'klaviyo',
    rawBody,
    headers,
  });

  if (!verification.ok) {
    console.warn('[webhook] Invalid Klaviyo signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const events = parseKlaviyoEvents(payload);
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
        provider: 'klaviyo',
        accountId,
        campaignId,
        column,
        eventTime: timestamp,
      });
      accountIdsToInvalidate.add(accountId);
      updated += 1;
    } catch (err) {
      failed += 1;
      console.error(`[webhook] Klaviyo stats upsert failed for klaviyo/${accountId}/${campaignId}:`, err);
    }
  }

  for (const accountId of accountIdsToInvalidate) {
    invalidateCampaignCache(accountId);
  }

  return NextResponse.json({
    ok: true,
    updated,
    failed,
    processedEvents: events.length,
  });
}

export const klaviyoEmailStatsWebhookHandler: EmailStatsWebhookHandler = {
  get: ({ provider, endpoint }) => NextResponse.json({
    ok: true,
    provider,
    endpoint,
    expects: 'POST Klaviyo email event payloads',
  }),
  post: (req) => handleKlaviyoEmailStatsWebhook(req),
};
