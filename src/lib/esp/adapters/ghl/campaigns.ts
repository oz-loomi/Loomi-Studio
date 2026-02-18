import { GHL_BASE, API_VERSION } from './constants';
import { getWebhookStatsForProviderAccount, type CampaignWebhookStats } from './webhook-stats';

// ── Types ──

export interface GhlCampaign {
  id: string;
  campaignId?: string;
  scheduleId?: string;
  name: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  scheduledAt?: string;
  sentAt?: string;
  sentCount?: number;
  deliveredCount?: number;
  openedCount?: number;
  clickedCount?: number;
  repliedCount?: number;
  bouncedCount?: number;
  failedCount?: number;
  unsubscribedCount?: number;
  openRate?: number;
  clickRate?: number;
  replyRate?: number;
  locationId: string;
  accountKey?: string;
  dealer?: string;
  bulkRequestId?: string;
  parentId?: string;
}

export interface GhlWorkflow {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  locationId: string;
  accountKey?: string;
  dealer?: string;
}

export interface GhlCampaignAnalytics {
  sentCount?: number;
  deliveredCount?: number;
  openedCount?: number;
  clickedCount?: number;
  repliedCount?: number;
  bouncedCount?: number;
  failedCount?: number;
  unsubscribedCount?: number;
  openRate?: number;
  clickRate?: number;
  replyRate?: number;
  source?: string;
}

// ── Cache ──

const campaignCache = new Map<string, { campaigns: GhlCampaign[]; fetchedAt: number }>();
const workflowCache = new Map<string, { workflows: GhlWorkflow[]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PAGE_SIZE = 100;
const MAX_PAGES = 30;
const MAX_SCAN_DEPTH = 6;
const GHL_BACKEND_BASE = 'https://backend.leadconnectorhq.com';

export function invalidateCampaignCache(locationId?: string): void {
  if (locationId) {
    campaignCache.delete(locationId);
    return;
  }
  campaignCache.clear();
}

type JsonRecord = Record<string, unknown>;
const NUMERIC_STRING_RE = /^[-+]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?(?:\s*%)?$/;
const NUMERIC_WITH_LABEL_RE =
  /^([-+]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?)(?:\s+[a-z][a-z\s/_-]*)$/i;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function parseNumericString(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  let numericPart = trimmed;
  if (!NUMERIC_STRING_RE.test(trimmed)) {
    const labeled = trimmed.match(NUMERIC_WITH_LABEL_RE);
    if (!labeled) return undefined;
    numericPart = labeled[1];
  }
  const normalized = numericPart.replace(/,/g, '').replace(/%$/, '').trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function pickArray(...values: unknown[]): JsonRecord[] {
  for (const value of values) {
    if (Array.isArray(value)) return value as JsonRecord[];
  }
  return [];
}

function firstString(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    const asString = String(value).trim();
    if (asString) return asString;
  }
  return undefined;
}

/**
 * Like `firstString`, but intended for date fields.
 * If the raw value is a number (Unix timestamp in ms or seconds), convert it to an ISO string.
 */
function firstDateString(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      // Heuristic: timestamps in seconds are < 1e11, in milliseconds are >= 1e11
      const ms = value < 1e11 ? value * 1000 : value;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return undefined;
}

function firstNumber(record: JsonRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = parseNumericString(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function normalizeMetricKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseNumberLike(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseNumericString(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function firstNumberDeep(
  value: unknown,
  keys: string[],
  maxDepth = 6,
): number | undefined {
  const targetKeys = new Set(keys.map(normalizeMetricKey));

  function extractNumericFromMatchedValue(node: unknown, depth: number): number | undefined {
    if (depth > maxDepth || node === null || node === undefined) return undefined;

    const direct = parseNumberLike(node);
    if (direct !== undefined) return direct;

    if (Array.isArray(node)) {
      for (const item of node) {
        const found = extractNumericFromMatchedValue(item, depth + 1);
        if (found !== undefined) return found;
      }
      return undefined;
    }

    const obj = asRecord(node);
    if (!obj) return undefined;
    for (const nested of Object.values(obj)) {
      const found = extractNumericFromMatchedValue(nested, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  function walk(node: unknown, depth: number): number | undefined {
    if (depth > maxDepth || node === null || node === undefined) return undefined;

    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item, depth + 1);
        if (found !== undefined) return found;
      }
      return undefined;
    }

    const obj = asRecord(node);
    if (!obj) return undefined;

    for (const [k, v] of Object.entries(obj)) {
      if (targetKeys.has(normalizeMetricKey(k))) {
        const parsed = extractNumericFromMatchedValue(v, depth + 1);
        if (parsed !== undefined) return parsed;
      }
    }

    for (const nested of Object.values(obj)) {
      const found = walk(nested, depth + 1);
      if (found !== undefined) return found;
    }

    return undefined;
  }

  return walk(value, 0);
}

function hasAnyCampaignAnalytics(analytics: GhlCampaignAnalytics): boolean {
  return [
    analytics.sentCount,
    analytics.deliveredCount,
    analytics.openedCount,
    analytics.clickedCount,
    analytics.repliedCount,
    analytics.bouncedCount,
    analytics.failedCount,
    analytics.unsubscribedCount,
    analytics.openRate,
    analytics.clickRate,
    analytics.replyRate,
  ].some((v) => v !== undefined && v !== null && Number.isFinite(v));
}

function scoreCampaignAnalytics(analytics: GhlCampaignAnalytics): number {
  const values: Array<number | undefined> = [
    analytics.sentCount,
    analytics.deliveredCount,
    analytics.openedCount,
    analytics.clickedCount,
    analytics.repliedCount,
    analytics.bouncedCount,
    analytics.failedCount,
    analytics.unsubscribedCount,
    analytics.openRate,
    analytics.clickRate,
    analytics.replyRate,
  ];
  return values.reduce<number>((total, value) => (
    value !== undefined && value !== null && Number.isFinite(value)
      ? total + 1
      : total
  ), 0);
}

function analyticsVolumeScore(analytics: GhlCampaignAnalytics): number {
  const counts: Array<number | undefined> = [
    analytics.sentCount,
    analytics.deliveredCount,
    analytics.openedCount,
    analytics.clickedCount,
    analytics.repliedCount,
    analytics.bouncedCount,
    analytics.failedCount,
    analytics.unsubscribedCount,
  ];
  return counts.reduce<number>((total, value) => (
    value !== undefined && value !== null && Number.isFinite(value)
      ? total + Math.max(0, value)
      : total
  ), 0);
}

function compareCampaignAnalyticsQuality(
  a: GhlCampaignAnalytics,
  b: GhlCampaignAnalytics,
): number {
  const metricDelta = scoreCampaignAnalytics(a) - scoreCampaignAnalytics(b);
  if (metricDelta !== 0) return metricDelta;

  const volumeDelta = analyticsVolumeScore(a) - analyticsVolumeScore(b);
  if (volumeDelta !== 0) return volumeDelta;

  const priorityA = (a.deliveredCount ?? a.sentCount ?? 0) + (a.openedCount ?? 0) + (a.clickedCount ?? 0);
  const priorityB = (b.deliveredCount ?? b.sentCount ?? 0) + (b.openedCount ?? 0) + (b.clickedCount ?? 0);
  return priorityA - priorityB;
}

function aggregateCampaignAnalytics(list: GhlCampaignAnalytics[]): GhlCampaignAnalytics {
  const aggregated: GhlCampaignAnalytics = {};
  for (const item of list) {
    if (item.sentCount !== undefined) aggregated.sentCount = (aggregated.sentCount ?? 0) + item.sentCount;
    if (item.deliveredCount !== undefined) aggregated.deliveredCount = (aggregated.deliveredCount ?? 0) + item.deliveredCount;
    if (item.openedCount !== undefined) aggregated.openedCount = (aggregated.openedCount ?? 0) + item.openedCount;
    if (item.clickedCount !== undefined) aggregated.clickedCount = (aggregated.clickedCount ?? 0) + item.clickedCount;
    if (item.repliedCount !== undefined) aggregated.repliedCount = (aggregated.repliedCount ?? 0) + item.repliedCount;
    if (item.bouncedCount !== undefined) aggregated.bouncedCount = (aggregated.bouncedCount ?? 0) + item.bouncedCount;
    if (item.failedCount !== undefined) aggregated.failedCount = (aggregated.failedCount ?? 0) + item.failedCount;
    if (item.unsubscribedCount !== undefined) {
      aggregated.unsubscribedCount = (aggregated.unsubscribedCount ?? 0) + item.unsubscribedCount;
    }
  }
  return aggregated;
}

function toUnitRate(value: number | undefined): number | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) return undefined;
  if (value <= 1) return value;
  return value / 100;
}

function finalizeCampaignAnalytics(raw: GhlCampaignAnalytics): GhlCampaignAnalytics {
  const analytics: GhlCampaignAnalytics = { ...raw };

  const sent = analytics.sentCount;

  if (analytics.deliveredCount === undefined && sent !== undefined) {
    // Some GHL payloads treat skipped/bounced as separate dimensions and still report
    // delivered as the full sent count. When delivered is absent, prefer sent as fallback.
    analytics.deliveredCount = sent;
  }

  const deliveredBase = analytics.deliveredCount ?? analytics.sentCount;
  if (deliveredBase !== undefined && deliveredBase > 0) {
    if (analytics.openRate === undefined && analytics.openedCount !== undefined) {
      analytics.openRate = analytics.openedCount / deliveredBase;
    }
    if (analytics.clickRate === undefined && analytics.clickedCount !== undefined) {
      analytics.clickRate = analytics.clickedCount / deliveredBase;
    }
    if (analytics.replyRate === undefined && analytics.repliedCount !== undefined) {
      analytics.replyRate = analytics.repliedCount / deliveredBase;
    }

    const openUnitRate = toUnitRate(analytics.openRate);
    if (analytics.openedCount === undefined && openUnitRate !== undefined) {
      analytics.openedCount = Math.round(deliveredBase * openUnitRate);
    }
    const clickUnitRate = toUnitRate(analytics.clickRate);
    if (analytics.clickedCount === undefined && clickUnitRate !== undefined) {
      analytics.clickedCount = Math.round(deliveredBase * clickUnitRate);
    }
    const replyUnitRate = toUnitRate(analytics.replyRate);
    if (analytics.repliedCount === undefined && replyUnitRate !== undefined) {
      analytics.repliedCount = Math.round(deliveredBase * replyUnitRate);
    }
  }

  return analytics;
}

type CampaignMetricKey =
  | 'sentCount'
  | 'deliveredCount'
  | 'openedCount'
  | 'clickedCount'
  | 'repliedCount'
  | 'bouncedCount'
  | 'failedCount'
  | 'unsubscribedCount';

function mapBucketLabelToMetricKey(label: string): CampaignMetricKey | null {
  const normalized = normalizeMetricKey(label);
  if (!normalized) return null;
  if (normalized.includes('unsubscribe') || normalized.includes('optout')) return 'unsubscribedCount';
  if (normalized.includes('bounce')) return 'bouncedCount';
  if (normalized.includes('skip')) return 'failedCount';
  if (normalized.includes('fail') || normalized.includes('error')) return 'failedCount';
  if (normalized.includes('repl')) return 'repliedCount';
  if (normalized.includes('click')) return 'clickedCount';
  if (normalized.includes('open')) return 'openedCount';
  if (normalized.includes('read')) return 'openedCount';
  if (normalized.includes('deliver')) return 'deliveredCount';
  if (normalized.includes('accept')) return 'deliveredCount';
  if (normalized.includes('success')) return 'sentCount';
  if (normalized.includes('sent') || normalized.includes('processed')) return 'sentCount';
  return null;
}

function extractBucketMetrics(payload: JsonRecord): Partial<Record<CampaignMetricKey, number>> {
  const out: Partial<Record<CampaignMetricKey, number>> = {};

  function maybeSet(key: CampaignMetricKey, value: number | undefined) {
    if (value === undefined || Number.isNaN(value)) return;
    // Keep the largest observed value in case payload includes both totals and breakdowns.
    if (out[key] === undefined || value > (out[key] ?? 0)) out[key] = value;
  }

  function walk(node: unknown, depth: number): void {
    if (depth > 7 || node === null || node === undefined) return;

    if (Array.isArray(node)) {
      for (const item of node) {
        const record = asRecord(item);
        if (record) {
          const label =
            firstString(record, ['status', 'type', 'event', 'name', 'label', 'metric', 'key']) ||
            '';
          const value = firstNumber(record, ['count', 'total', 'value', 'qty', 'number', 'amount']);
          const metricKey = label ? mapBucketLabelToMetricKey(label) : null;
          if (metricKey && value !== undefined) {
            maybeSet(metricKey, value);
          }
        }
        walk(item, depth + 1);
      }
      return;
    }

    const obj = asRecord(node);
    if (!obj) return;

    // Handle map-like metrics objects, e.g. { opened: 10, clicked: 3 }.
    for (const [k, v] of Object.entries(obj)) {
      const metricKey = mapBucketLabelToMetricKey(k);
      if (!metricKey) continue;
      const value = parseNumberLike(v);
      maybeSet(metricKey, value);
    }

    for (const nested of Object.values(obj)) {
      walk(nested, depth + 1);
    }
  }

  walk(payload, 0);
  return out;
}

function extractCampaignAnalyticsFromPayload(payload: JsonRecord): GhlCampaignAnalytics {
  const read = (keys: string[]) => firstNumberDeep(payload, keys);
  const bucket = extractBucketMetrics(payload);
  const analytics: GhlCampaignAnalytics = {
    sentCount: read([
      'sentCount',
      'sent',
      'totalSent',
      'emailsSent',
      'recipientsSent',
      'sentTotal',
      'totalRecipients',
      'recipientCount',
      'audienceSize',
      'processedCount',
      'successCount',
      'success',
      'successful',
      'totalSuccessful',
      'processed',
      'processedTotal',
      'recipientsProcessed',
      'emailsProcessed',
    ]),
    deliveredCount: read([
      'deliveredCount',
      'delivered',
      'totalDelivered',
      'emailsDelivered',
      'deliveredTotal',
      'deliveryCount',
      'successfulDeliveries',
      'successfullyDelivered',
      'accepted',
      'acceptedCount',
      'totalAccepted',
      'deliveredSuccessful',
    ]),
    openedCount: read([
      'openedCount',
      'opened',
      'openCount',
      'opens',
      'totalOpened',
      'totalOpen',
      'uniqueOpen',
      'uniqueOpened',
      'uniqueOpens',
      'openedUnique',
      'read',
      'reads',
      'readCount',
      'totalRead',
      'uniqueRead',
      'uniqueReads',
    ]),
    clickedCount: read([
      'clickedCount',
      'clicked',
      'clickCount',
      'clicks',
      'totalClicked',
      'totalClick',
      'uniqueClick',
      'uniqueClicked',
      'uniqueClicks',
      'clickedUnique',
      'linkClickCount',
      'linkClicks',
      'totalLinkClicks',
      'uniqueLinkClicks',
    ]),
    repliedCount: read([
      'repliedCount',
      'replies',
      'replyCount',
      'totalReplied',
      'replyTotal',
      'responses',
      'responsesCount',
      'responseCount',
    ]),
    bouncedCount: read([
      'bouncedCount',
      'bounced',
      'bounceCount',
      'totalBounced',
      'bounceTotal',
      'hardBounceCount',
      'softBounceCount',
      'hardBounced',
      'softBounced',
    ]),
    failedCount: read([
      'failedCount',
      'failed',
      'failureCount',
      'totalFailed',
      'failedTotal',
      'errors',
      'errorCount',
      'dropped',
      'droppedCount',
      'rejected',
      'rejectedCount',
      'skipped',
      'skippedCount',
      'spam',
      'spamCount',
    ]),
    unsubscribedCount: read([
      'unsubscribedCount',
      'unsubscribed',
      'unsubscribeCount',
      'totalUnsubscribed',
      'optOutCount',
      'optouts',
      'optOut',
      'optedOut',
      'optedOutCount',
      'unsubscribes',
    ]),
    openRate: read(['openRate', 'openedRate', 'uniqueOpenRate', 'openPercentage', 'openedPercentage']),
    clickRate: read([
      'clickRate',
      'clickedRate',
      'uniqueClickRate',
      'clickThroughRate',
      'ctr',
      'clickPercentage',
      'clickedPercentage',
    ]),
    replyRate: read(['replyRate', 'repliedRate', 'replyPercentage', 'repliedPercentage']),
  };
  analytics.sentCount = analytics.sentCount ?? bucket.sentCount;
  analytics.deliveredCount = analytics.deliveredCount ?? bucket.deliveredCount;
  analytics.openedCount = analytics.openedCount ?? bucket.openedCount;
  analytics.clickedCount = analytics.clickedCount ?? bucket.clickedCount;
  analytics.repliedCount = analytics.repliedCount ?? bucket.repliedCount;
  analytics.bouncedCount = analytics.bouncedCount ?? bucket.bouncedCount;
  analytics.failedCount = analytics.failedCount ?? bucket.failedCount;
  analytics.unsubscribedCount = analytics.unsubscribedCount ?? bucket.unsubscribedCount;
  return analytics;
}

function extractCampaignAnalyticsForIdentifiers(
  payload: JsonRecord,
  identifiers: { scheduleId?: string; campaignId?: string; recordId?: string },
): GhlCampaignAnalytics {
  const scheduleId = normalizeId(identifiers.scheduleId);
  const campaignId = normalizeId(identifiers.campaignId);
  const recordId = normalizeId(identifiers.recordId);
  if (!scheduleId && !campaignId && !recordId) {
    return extractCampaignAnalyticsFromPayload(payload);
  }

  const idSet = new Set([scheduleId, campaignId, recordId].filter(Boolean));
  const candidates: GhlCampaignAnalytics[] = [];
  const matchedRowAnalytics: GhlCampaignAnalytics[] = [];
  const seenMatchedRows = new Set<string>();

  const payloadAnalytics = extractCampaignAnalyticsFromPayload(payload);
  if (hasAnyCampaignAnalytics(payloadAnalytics)) {
    candidates.push(payloadAnalytics);
  }

  const rows = extractCampaignRows(payload);
  for (const row of rows) {
    const rowIds = [
      firstString(row, ['scheduleId', 'schedule_id', 'emailScheduleId', 'id', '_id']),
      firstString(row, ['campaignId', 'campaign_id', 'emailId', 'email_id']),
    ].map(normalizeId);

    if (rowIds.some((id) => id && idSet.has(id))) {
      const dedupeKey = rowIds.filter(Boolean).join('|') || JSON.stringify(row).slice(0, 300);
      if (seenMatchedRows.has(dedupeKey)) continue;
      seenMatchedRows.add(dedupeKey);
      const rowAnalytics = extractCampaignAnalyticsFromPayload(row);
      if (hasAnyCampaignAnalytics(rowAnalytics)) {
        matchedRowAnalytics.push(rowAnalytics);
        candidates.push(rowAnalytics);
      }
    }
  }

  if (matchedRowAnalytics.length > 1) {
    candidates.push(aggregateCampaignAnalytics(matchedRowAnalytics));
  }

  function collectIdentifierBoundObjects(node: unknown, depth: number): void {
    if (depth > 7 || node === null || node === undefined) return;

    if (Array.isArray(node)) {
      for (const item of node) collectIdentifierBoundObjects(item, depth + 1);
      return;
    }

    const obj = asRecord(node);
    if (!obj) return;

    for (const [key, value] of Object.entries(obj)) {
      const normalizedKey = normalizeId(key);
      if (normalizedKey && idSet.has(normalizedKey)) {
        const recordValue = asRecord(value);
        if (recordValue) {
          const analytics = extractCampaignAnalyticsFromPayload(recordValue);
          if (hasAnyCampaignAnalytics(analytics)) candidates.push(analytics);
        }
      }
    }

    const selfIds = [
      firstString(obj, ['id', '_id', 'scheduleId', 'schedule_id', 'emailScheduleId', 'campaignId', 'campaign_id', 'emailId', 'email_id']),
    ].map(normalizeId);
    if (selfIds.some((id) => id && idSet.has(id))) {
      const analytics = extractCampaignAnalyticsFromPayload(obj);
      if (hasAnyCampaignAnalytics(analytics)) candidates.push(analytics);
    }

    for (const nested of Object.values(obj)) {
      collectIdentifierBoundObjects(nested, depth + 1);
    }
  }

  collectIdentifierBoundObjects(payload, 0);

  if (candidates.length === 0) return payloadAnalytics;

  let best = candidates[0];
  for (const candidate of candidates.slice(1)) {
    if (compareCampaignAnalyticsQuality(candidate, best) > 0) {
      best = candidate;
    }
  }

  // Merge payload-level and best identifier-bound analytics to fill missing fields.
  return {
    ...payloadAnalytics,
    ...best,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readNumberFromTextByAliases(text: string, aliases: string[]): number | undefined {
  for (const alias of aliases) {
    const escaped = escapeRegex(alias);
    const patterns = [
      new RegExp(`["']${escaped}["']\\s*[:=]\\s*["']?([+-]?(?:\\d+|\\d{1,3}(?:,\\d{3})+)(?:\\.\\d+)?%?)`, 'i'),
      new RegExp(`\\b${escaped}\\b\\s*[:=]\\s*([+-]?(?:\\d+|\\d{1,3}(?:,\\d{3})+)(?:\\.\\d+)?%?)`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match?.[1]) continue;
      const parsed = parseNumericString(match[1]);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

function readNumberFromTextByLabels(text: string, labels: string[]): number | undefined {
  for (const label of labels) {
    const escaped = escapeRegex(label);
    const patterns = [
      new RegExp(`\\b${escaped}\\b[^\\d%]{0,40}([+-]?(?:\\d+|\\d{1,3}(?:,\\d{3})+)(?:\\.\\d+)?%?)`, 'i'),
      new RegExp(`\\b${escaped}\\b[^\\d%]{0,80}\\(([+-]?(?:\\d+|\\d{1,3}(?:,\\d{3})+)(?:\\.\\d+)?%?)\\)`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match?.[1]) continue;
      const parsed = parseNumericString(match[1]);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

function extractCampaignAnalyticsFromText(text: string): GhlCampaignAnalytics {
  if (!text.trim()) return {};
  const analytics: GhlCampaignAnalytics = {
    sentCount: readNumberFromTextByAliases(text, [
      'sentCount',
      'totalSent',
      'emailsSent',
      'processedCount',
      'successCount',
    ]),
    deliveredCount: readNumberFromTextByAliases(text, [
      'deliveredCount',
      'totalDelivered',
      'emailsDelivered',
      'deliveryCount',
      'acceptedCount',
    ]),
    openedCount: readNumberFromTextByAliases(text, [
      'openedCount',
      'openCount',
      'totalOpened',
      'uniqueOpen',
      'readCount',
    ]),
    clickedCount: readNumberFromTextByAliases(text, [
      'clickedCount',
      'clickCount',
      'totalClicked',
      'uniqueClick',
      'linkClickCount',
    ]),
    repliedCount: readNumberFromTextByAliases(text, [
      'repliedCount',
      'replyCount',
      'totalReplied',
      'responsesCount',
    ]),
    bouncedCount: readNumberFromTextByAliases(text, [
      'bouncedCount',
      'bounceCount',
      'totalBounced',
      'hardBounceCount',
      'softBounceCount',
    ]),
    failedCount: readNumberFromTextByAliases(text, [
      'failedCount',
      'failureCount',
      'totalFailed',
      'errorCount',
      'droppedCount',
      'rejectedCount',
      'skippedCount',
      'spamCount',
    ]),
    unsubscribedCount: readNumberFromTextByAliases(text, [
      'unsubscribedCount',
      'unsubscribeCount',
      'totalUnsubscribed',
      'optOutCount',
      'optedOutCount',
    ]),
    openRate: readNumberFromTextByAliases(text, ['openRate', 'openedRate', 'uniqueOpenRate', 'openPercentage']),
    clickRate: readNumberFromTextByAliases(text, ['clickRate', 'clickedRate', 'uniqueClickRate', 'clickThroughRate', 'ctr', 'clickPercentage']),
    replyRate: readNumberFromTextByAliases(text, ['replyRate', 'repliedRate', 'replyPercentage']),
  };

  analytics.openedCount = analytics.openedCount ?? readNumberFromTextByLabels(text, ['opened', 'opens', 'unique opens']);
  analytics.clickedCount = analytics.clickedCount ?? readNumberFromTextByLabels(text, ['clicked', 'clicks', 'unique clicks']);
  analytics.repliedCount = analytics.repliedCount ?? readNumberFromTextByLabels(text, ['replied', 'replies', 'responses']);
  analytics.unsubscribedCount = analytics.unsubscribedCount ?? readNumberFromTextByLabels(text, ['unsubscribed', 'opt outs', 'opt-outs']);
  analytics.bouncedCount = analytics.bouncedCount ?? readNumberFromTextByLabels(text, ['bounced', 'bounces']);
  analytics.openRate = analytics.openRate ?? readNumberFromTextByLabels(text, ['open rate']);
  analytics.clickRate = analytics.clickRate ?? readNumberFromTextByLabels(text, ['click rate', 'ctr']);
  analytics.replyRate = analytics.replyRate ?? readNumberFromTextByLabels(text, ['reply rate']);

  return analytics;
}

function scoreCampaignRow(row: JsonRecord): number {
  let score = 0;
  if (firstString(row, ['id', '_id', 'campaignId', 'campaign_id', 'emailId', 'scheduleId'])) score += 2;
  if (firstString(row, ['name', 'title', 'campaignName', 'campaign_name', 'subject', 'emailTitle'])) score += 2;
  if (firstString(row, ['status', 'state', 'campaignStatus', 'campaign_status', 'scheduleStatus'])) score += 1;
  if (
    firstString(
      row,
      [
        'createdAt',
        'created_at',
        'dateCreated',
        'updatedAt',
        'updated_at',
        'scheduledAt',
        'scheduled_at',
        'sentAt',
        'sendAt',
        'scheduledFor',
      ],
    )
  ) {
    score += 1;
  }
  return score;
}

function scoreWorkflowRow(row: JsonRecord): number {
  let score = 0;
  if (firstString(row, ['id', '_id', 'workflowId', 'workflow_id'])) score += 2;
  if (firstString(row, ['name', 'title', 'workflowName', 'workflow_name'])) score += 2;
  if (firstString(row, ['status', 'state'])) score += 1;
  if (firstString(row, ['createdAt', 'created_at', 'dateCreated', 'updatedAt', 'updated_at', 'dateUpdated'])) score += 1;
  return score;
}

function findBestEntityArray(
  payload: JsonRecord,
  rowScore: (row: JsonRecord) => number,
): JsonRecord[] {
  const arrays: JsonRecord[][] = [];

  function walk(value: unknown, depth: number): void {
    if (depth > MAX_SCAN_DEPTH || value === null || value === undefined) return;

    if (Array.isArray(value)) {
      const records = value.filter((item) => !!asRecord(item)) as JsonRecord[];
      if (records.length > 0) arrays.push(records);
      for (const item of value) walk(item, depth + 1);
      return;
    }

    const obj = asRecord(value);
    if (!obj) return;
    for (const nested of Object.values(obj)) {
      walk(nested, depth + 1);
    }
  }

  walk(payload, 0);

  let best: JsonRecord[] = [];
  let bestScore = -1;

  for (const rows of arrays) {
    const sample = rows.slice(0, Math.min(rows.length, 20));
    const sampleScores = sample.map(rowScore);
    const matched = sampleScores.filter((s) => s > 0).length;
    if (matched === 0) continue;

    const avgScore = sampleScores.reduce((a, b) => a + b, 0) / sampleScores.length;
    const confidence = matched / sampleScores.length;
    const totalScore = confidence * 100 + avgScore * 10 + rows.length;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      best = rows;
    }
  }

  return best;
}

function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function summarizeErrorBody(body: string): string {
  if (!body) return '';
  const trimmed = body.trim();
  if (!trimmed) return '';

  try {
    const parsed = JSON.parse(trimmed) as JsonRecord;
    const message = firstString(parsed, ['message', 'error', 'msg', 'detail']);
    if (message) return message;
  } catch {
    // Not JSON, fall back to raw text snippet.
  }

  return trimmed.slice(0, 180).replace(/\s+/g, ' ');
}

function buildWorkflowEndpointCandidates(locationId: string): string[] {
  const encodedLocationId = encodeURIComponent(locationId);
  const base = `${GHL_BASE}/workflows`;
  const query = `locationId=${encodedLocationId}`;
  const pagedQuery = `locationId=${encodedLocationId}&limit=${PAGE_SIZE}`;
  return [
    // Location-scoped variants
    `${base}/?${pagedQuery}`,
    `${base}?${pagedQuery}`,
    `${base}/?${query}`,
    `${base}?${query}`,
    // Plain list variants (official scope table documents GET /workflows/)
    `${base}/?limit=${PAGE_SIZE}`,
    `${base}?limit=${PAGE_SIZE}`,
    `${base}/`,
    `${base}`,
    // Search-style fallbacks
    `${base}/search?${pagedQuery}`,
    `${base}/search/?${pagedQuery}`,
    `${base}/search?${query}`,
    `${base}/search/?${query}`,
    `${base}/search?limit=${PAGE_SIZE}`,
    `${base}/search/?limit=${PAGE_SIZE}`,
    `${base}/search`,
    `${base}/search/`,
  ];
}

function buildCampaignFallbackEndpointCandidates(locationId: string): string[] {
  const encodedLocationId = encodeURIComponent(locationId);
  const base = `${GHL_BASE}/campaigns`;
  const query = `locationId=${encodedLocationId}&limit=${PAGE_SIZE}&status=all`;
  return [
    `${base}/?${query}`,
    `${base}?${query}`,
    `${base}/search?${query}`,
    `${base}/search/?${query}`,
  ];
}

function buildEmailScheduleEndpointCandidates(locationId: string): string[] {
  const encodedLocationId = encodeURIComponent(locationId);
  const base = `${GHL_BASE}/emails/schedule`;
  return [
    `${base}?locationId=${encodedLocationId}&limit=${PAGE_SIZE}&includeStats=true`,
    `${base}/?locationId=${encodedLocationId}&limit=${PAGE_SIZE}&includeStats=true`,
    `${base}?locationId=${encodedLocationId}&limit=${PAGE_SIZE}&includeAnalytics=true`,
    `${base}/?locationId=${encodedLocationId}&limit=${PAGE_SIZE}&includeAnalytics=true`,
    `${base}?locationId=${encodedLocationId}&limit=${PAGE_SIZE}&includeStats=true&includeAnalytics=true`,
    `${base}/?locationId=${encodedLocationId}&limit=${PAGE_SIZE}&includeStats=true&includeAnalytics=true`,
    `${base}?locationId=${encodedLocationId}&includeStats=true`,
    `${base}/?locationId=${encodedLocationId}&includeStats=true`,
    `${base}?locationId=${encodedLocationId}&includeAnalytics=true`,
    `${base}/?locationId=${encodedLocationId}&includeAnalytics=true`,
    `${base}?locationId=${encodedLocationId}&limit=${PAGE_SIZE}`,
    `${base}/?locationId=${encodedLocationId}&limit=${PAGE_SIZE}`,
    `${base}?locationId=${encodedLocationId}`,
    `${base}/?locationId=${encodedLocationId}`,
    `${base}`,
    `${base}/`,
  ];
}

interface EndpointAttempt {
  label: string;
  candidates: string[];
}

function buildCampaignEndpointAttempts(locationId: string): EndpointAttempt[] {
  return [
    { label: 'emails/schedule', candidates: buildEmailScheduleEndpointCandidates(locationId) },
    { label: 'campaigns', candidates: buildCampaignFallbackEndpointCandidates(locationId) },
  ];
}

function extractNextPageUrl(payload: JsonRecord): string | null {
  const meta = asRecord(payload.meta);
  const pagination = asRecord(payload.pagination);
  const links = asRecord(payload.links);

  const candidates: unknown[] = [
    payload.nextPageUrl,
    payload.nextPage,
    meta?.nextPageUrl,
    meta?.nextPage,
    pagination?.nextPageUrl,
    pagination?.nextPage,
    links?.next,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function toAbsoluteUrl(nextUrl: string): string {
  if (nextUrl.startsWith('http://') || nextUrl.startsWith('https://')) return nextUrl;
  if (nextUrl.startsWith('/')) return `${GHL_BASE}${nextUrl}`;
  return `${GHL_BASE}/${nextUrl.replace(/^\/+/, '')}`;
}

function extractCampaignRows(payload: JsonRecord): JsonRecord[] {
  const data = asRecord(payload.data);
  const direct = pickArray(
    payload.campaigns,
    payload.schedules,
    payload.emailSchedules,
    payload.emails,
    data?.campaigns,
    data?.schedules,
    data?.emailSchedules,
    data?.emails,
    payload.items,
    data?.items,
    payload.results,
    payload.data,
  );
  if (direct.length > 0) return direct;
  return findBestEntityArray(payload, scoreCampaignRow);
}

function extractWorkflowRows(payload: JsonRecord): JsonRecord[] {
  const data = asRecord(payload.data);
  const direct = pickArray(
    payload.workflows,
    data?.workflows,
    payload.items,
    data?.items,
    payload.results,
    payload.data,
  );
  if (direct.length > 0) return direct;
  return findBestEntityArray(payload, scoreWorkflowRow);
}

async function fetchPaginatedResource({
  token,
  resourceLabel,
  extractRows,
  initialCandidates,
}: {
  token: string;
  resourceLabel: string;
  extractRows: (payload: JsonRecord) => JsonRecord[];
  initialCandidates: string[];
}): Promise<JsonRecord[]> {
  const rows: JsonRecord[] = [];
  const seenUrls = new Set<string>();
  let nextUrl: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const candidates = nextUrl
      ? [toAbsoluteUrl(nextUrl)]
      : initialCandidates;

    let payload: JsonRecord | null = null;
    let lastError: Error | null = null;
    let attemptedRequest = false;

    for (const url of candidates) {
      if (seenUrls.has(url)) continue;
      attemptedRequest = true;
      seenUrls.add(url);

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Version: API_VERSION,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        const detail = summarizeErrorBody(bodyText);
        const suffix = detail ? `: ${detail}` : '';
        lastError = new Error(`GHL ${resourceLabel} API error (${res.status})${suffix}`);
        continue;
      }

      const data = await res.json();
      payload = asRecord(data) ?? {};
      break;
    }

    if (!payload) {
      if (!attemptedRequest) break;
      throw lastError ?? new Error(`Failed to fetch GHL ${resourceLabel}`);
    }

    const pageRows = extractRows(payload);
    rows.push(...pageRows);

    nextUrl = extractNextPageUrl(payload);
    if (!nextUrl || pageRows.length === 0) break;
  }

  return rows;
}

function normalizeId(value?: string): string {
  return (value || '').trim().toLowerCase();
}

function analyticsFromCampaign(campaign: GhlCampaign, source: string): GhlCampaignAnalytics {
  return {
    sentCount: campaign.sentCount,
    deliveredCount: campaign.deliveredCount,
    openedCount: campaign.openedCount,
    clickedCount: campaign.clickedCount,
    repliedCount: campaign.repliedCount,
    bouncedCount: campaign.bouncedCount,
    failedCount: campaign.failedCount,
    unsubscribedCount: campaign.unsubscribedCount,
    openRate: campaign.openRate,
    clickRate: campaign.clickRate,
    replyRate: campaign.replyRate,
    source,
  };
}

async function fetchCampaignAnalyticsFromCampaignList(
  token: string,
  locationId: string,
  identifiers: { scheduleId?: string; campaignId?: string; recordId?: string },
  source: string,
): Promise<GhlCampaignAnalytics | null> {
  const scheduleId = normalizeId(identifiers.scheduleId);
  const campaignId = normalizeId(identifiers.campaignId);
  const recordId = normalizeId(identifiers.recordId);
  if (!scheduleId && !campaignId && !recordId) return null;

  try {
    const campaigns = await fetchCampaigns(token, locationId, { forceRefresh: true });
    const match = campaigns.find((campaign) => {
      const ids = [campaign.scheduleId, campaign.campaignId, campaign.id].map(normalizeId);
      if (scheduleId && ids.includes(scheduleId)) return true;
      if (campaignId && ids.includes(campaignId)) return true;
      if (recordId && ids.includes(recordId)) return true;
      return false;
    });
    if (!match) return null;
    return analyticsFromCampaign(match, source);
  } catch {
    return null;
  }
}

// ── Fetch Campaigns ──

export async function fetchCampaigns(
  token: string,
  locationId: string,
  options?: { forceRefresh?: boolean },
): Promise<GhlCampaign[]> {
  const cached = campaignCache.get(locationId);
  const forceRefresh = options?.forceRefresh === true;
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.campaigns;
  }

  const attempts = buildCampaignEndpointAttempts(locationId);
  const errors: string[] = [];
  let raw: JsonRecord[] | null = null;
  let bestEmptyResult: JsonRecord[] | null = null;

  for (const attempt of attempts) {
    try {
      const rows = await fetchPaginatedResource({
        token,
        resourceLabel: attempt.label,
        extractRows: extractCampaignRows,
        initialCandidates: attempt.candidates,
      });

      if (rows.length > 0) {
        raw = rows;
        break;
      }

      if (!bestEmptyResult) bestEmptyResult = rows;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (!raw) {
    if (bestEmptyResult) {
      raw = bestEmptyResult;
    } else {
      const hint = 'If this is an OAuth-connected account, re-authorize with "emails/schedule.readonly".';
      const detail = errors.length > 0 ? errors[errors.length - 1] : 'Failed to fetch campaigns';
      throw new Error(`${detail} ${hint}`);
    }
  }

  const campaigns: GhlCampaign[] = raw.map((c) => {
    const campaignObj = asRecord(c.campaign);
    const emailObj = asRecord(c.email);
    const scheduleObj = asRecord(c.schedule);
    const statsObj = asRecord(c.stats);
    const metricsObj = asRecord(c.metrics);
    const analyticsObj = asRecord(c.analytics);
    const reportObj = asRecord(c.report);
    const summaryObj = asRecord(c.summary);

    const campaignId =
      firstString(c, ['campaignId', 'campaign_id', 'emailId', 'email_id']) ||
      firstString(campaignObj ?? {}, ['id', '_id']) ||
      firstString(emailObj ?? {}, ['id', '_id']);

    const scheduleId =
      firstString(c, ['scheduleId', 'schedule_id', 'emailScheduleId', 'email_schedule_id']) ||
      firstString(scheduleObj ?? {}, ['id', '_id']) ||
      firstString(c, ['id', '_id']);

    const canonicalId =
      firstString(c, ['id', '_id']) ||
      campaignId ||
      scheduleId ||
      '';

    const metricSources = [
      c,
      campaignObj,
      emailObj,
      scheduleObj,
      statsObj,
      metricsObj,
      analyticsObj,
      summaryObj,
      reportObj,
    ].filter((source): source is JsonRecord => Boolean(source));

    const metric = (keys: string[]): number | undefined => {
      for (const source of metricSources) {
        const value = firstNumber(source, keys);
        if (value !== undefined) return value;
        const deep = firstNumberDeep(source, keys);
        if (deep !== undefined) return deep;
      }
      return undefined;
    };

    const extracted = extractCampaignAnalyticsFromPayload(c);

    return {
      id: canonicalId,
      campaignId,
      scheduleId,
      name: firstString(c, ['name', 'title', 'campaignName', 'campaign_name', 'subject', 'emailTitle']) || '',
      status: firstString(c, ['status', 'state', 'campaignStatus', 'campaign_status', 'scheduleStatus']) || 'unknown',
      createdAt: firstDateString(c, ['createdAt', 'created_at', 'dateCreated', 'date_created', 'dateAdded', 'publishAt', 'publishedAt', 'createdOn']),
      updatedAt: firstDateString(c, ['updatedAt', 'updated_at', 'dateUpdated', 'date_updated', 'lastUpdatedAt', 'updatedOn']),
      scheduledAt: firstDateString(c, ['scheduledAt', 'scheduled_at', 'scheduleAt', 'dateScheduled', 'scheduledFor', 'sendAt', 'nextProcessingOn', 'nextExecution']),
      sentAt: firstDateString(c, ['sentAt', 'sent_at', 'dateSent', 'completedAt', 'completed_at', 'sentOn']),
      sentCount: metric(['sentCount', 'sent', 'totalSent', 'emailsSent', 'processedCount', 'success']) ?? extracted.sentCount,
      deliveredCount: metric(['deliveredCount', 'delivered', 'totalDelivered', 'emailsDelivered', 'accepted']) ?? extracted.deliveredCount,
      openedCount: metric(['openedCount', 'opened', 'openCount', 'opens', 'totalOpened', 'readCount']) ?? extracted.openedCount,
      clickedCount: metric(['clickedCount', 'clicked', 'clickCount', 'clicks', 'totalClicked', 'linkClickCount']) ?? extracted.clickedCount,
      repliedCount: metric(['repliedCount', 'replies', 'replyCount', 'totalReplied', 'responsesCount']) ?? extracted.repliedCount,
      bouncedCount: metric(['bouncedCount', 'bounced', 'bounceCount', 'totalBounced', 'hardBounceCount', 'softBounceCount']) ?? extracted.bouncedCount,
      failedCount: metric(['failedCount', 'failed', 'failureCount', 'totalFailed', 'errorCount', 'droppedCount']) ?? extracted.failedCount,
      unsubscribedCount: metric(['unsubscribedCount', 'unsubscribed', 'unsubscribeCount', 'totalUnsubscribed', 'optOutCount']) ?? extracted.unsubscribedCount,
      openRate: metric(['openRate', 'openedRate', 'openPercentage', 'openedPercentage']) ?? extracted.openRate,
      clickRate: metric(['clickRate', 'clickedRate', 'clickPercentage', 'clickedPercentage']) ?? extracted.clickRate,
      replyRate: metric(['replyRate', 'repliedRate', 'replyPercentage', 'repliedPercentage']) ?? extracted.replyRate,
      locationId,
      bulkRequestId: firstString(c, ['bulkRequestId', 'bulkReqId']),
      parentId: firstString(c, ['parentId', 'parent_id', 'folderId', 'folder_id']),
    };
  });

  const deduped = dedupeByKey(campaigns, (c) =>
    `${c.scheduleId || c.id || 'no-id'}|${c.campaignId || 'no-campaign'}|${c.name.toLowerCase()}|${c.status.toLowerCase()}|${c.createdAt || c.updatedAt || c.sentAt || ''}`,
  );

  // Merge webhook-derived stats (sentAt, delivery counts, etc.)
  try {
    const webhookStats = await getWebhookStatsForProviderAccount('ghl', locationId);
    if (webhookStats.size > 0) {
      const mergeCount = (existing: number | undefined, incoming: number): number | undefined => {
        if (!Number.isFinite(incoming) || incoming <= 0) return existing;
        if (existing === undefined || !Number.isFinite(existing)) return incoming;
        return Math.max(existing, incoming);
      };

      for (const campaign of deduped) {
        const matchIds = [campaign.scheduleId, campaign.campaignId, campaign.id].filter(Boolean) as string[];
        let stats: CampaignWebhookStats | undefined;
        for (const id of matchIds) {
          stats = webhookStats.get(id);
          if (stats) break;
        }
        if (!stats) continue;

        if (stats.firstDeliveredAt) {
          if (!campaign.sentAt) {
            campaign.sentAt = stats.firstDeliveredAt.toISOString();
          } else {
            const currentSentTs = new Date(campaign.sentAt).getTime();
            const incomingSentTs = stats.firstDeliveredAt.getTime();
            if (Number.isNaN(currentSentTs) || incomingSentTs < currentSentTs) {
              campaign.sentAt = stats.firstDeliveredAt.toISOString();
            }
          }
        }
        campaign.deliveredCount = mergeCount(campaign.deliveredCount, stats.deliveredCount);
        campaign.openedCount = mergeCount(campaign.openedCount, stats.openedCount);
        campaign.clickedCount = mergeCount(campaign.clickedCount, stats.clickedCount);
        campaign.bouncedCount = mergeCount(campaign.bouncedCount, stats.bouncedCount);
        campaign.unsubscribedCount = mergeCount(campaign.unsubscribedCount, stats.unsubscribedCount);
      }
    }
  } catch (err) {
    console.error('[campaigns] Failed to merge webhook stats:', err);
  }

  campaignCache.set(locationId, { campaigns: deduped, fetchedAt: Date.now() });
  return deduped;
}

function buildCampaignAnalyticsEndpointCandidates(
  locationId: string,
  scheduleId?: string,
  campaignId?: string,
  recordId?: string,
): Array<{ label: string; url: string }> {
  const candidates: Array<{ label: string; url: string }> = [];
  const encodedLocationId = encodeURIComponent(locationId);
  const scheduleLookupId = scheduleId || recordId;

  if (scheduleLookupId) {
    const encodedScheduleId = encodeURIComponent(scheduleLookupId);
    candidates.push(
      { label: 'emails/schedule?includeStats', url: `${GHL_BASE}/emails/schedule?locationId=${encodedLocationId}&scheduleId=${encodedScheduleId}&limit=${PAGE_SIZE}&includeStats=true` },
      { label: 'emails/schedule?includeAnalytics', url: `${GHL_BASE}/emails/schedule?locationId=${encodedLocationId}&scheduleId=${encodedScheduleId}&limit=${PAGE_SIZE}&includeAnalytics=true` },
      { label: 'emails/schedule list includeStats', url: `${GHL_BASE}/emails/schedule?locationId=${encodedLocationId}&limit=${PAGE_SIZE}&includeStats=true` },
      { label: 'emails/schedule list includeAnalytics', url: `${GHL_BASE}/emails/schedule?locationId=${encodedLocationId}&limit=${PAGE_SIZE}&includeAnalytics=true` },
      { label: 'emails/schedule/{id}', url: `${GHL_BASE}/emails/schedule/${encodedScheduleId}?locationId=${encodedLocationId}` },
      { label: 'emails/schedule/{id}?includeStats', url: `${GHL_BASE}/emails/schedule/${encodedScheduleId}?locationId=${encodedLocationId}&includeStats=true` },
      { label: 'emails/schedule/{id}?includeAnalytics', url: `${GHL_BASE}/emails/schedule/${encodedScheduleId}?locationId=${encodedLocationId}&includeAnalytics=true` },
      { label: 'emails/schedule/{id}/stats', url: `${GHL_BASE}/emails/schedule/${encodedScheduleId}/stats?locationId=${encodedLocationId}` },
      { label: 'emails/schedule/{id}/analytics', url: `${GHL_BASE}/emails/schedule/${encodedScheduleId}/analytics?locationId=${encodedLocationId}` },
      { label: 'emails/schedule/{id}/report', url: `${GHL_BASE}/emails/schedule/${encodedScheduleId}/report?locationId=${encodedLocationId}` },
      { label: 'emails/schedule/stats', url: `${GHL_BASE}/emails/schedule/stats?locationId=${encodedLocationId}&scheduleId=${encodedScheduleId}` },
      { label: 'emails/schedule/report', url: `${GHL_BASE}/emails/schedule/report?locationId=${encodedLocationId}&scheduleId=${encodedScheduleId}` },
      { label: 'backend emails/schedule/report', url: `${GHL_BACKEND_BASE}/emails/schedule/report/${encodedLocationId}/${encodedScheduleId}` },
      { label: 'backend emails/schedule/analytics', url: `${GHL_BACKEND_BASE}/emails/schedule/analytics/${encodedLocationId}/${encodedScheduleId}` },
      { label: 'backend emails/schedule/stats', url: `${GHL_BACKEND_BASE}/emails/schedule/stats/${encodedLocationId}/${encodedScheduleId}` },
    );
  }

  if (campaignId) {
    const encodedCampaignId = encodeURIComponent(campaignId);
    candidates.push(
      { label: 'emails/campaigns/{id}', url: `${GHL_BASE}/emails/campaigns/${encodedCampaignId}?locationId=${encodedLocationId}` },
      { label: 'emails/campaigns/{id}/stats', url: `${GHL_BASE}/emails/campaigns/${encodedCampaignId}/stats?locationId=${encodedLocationId}` },
      { label: 'emails/campaigns/{id}/analytics', url: `${GHL_BASE}/emails/campaigns/${encodedCampaignId}/analytics?locationId=${encodedLocationId}` },
      { label: 'emails/campaigns/{id}/report', url: `${GHL_BASE}/emails/campaigns/${encodedCampaignId}/report?locationId=${encodedLocationId}` },
      { label: 'emails/campaigns/stats', url: `${GHL_BASE}/emails/campaigns/stats?locationId=${encodedLocationId}&campaignId=${encodedCampaignId}` },
      { label: 'campaigns/{id}/stats', url: `${GHL_BASE}/campaigns/${encodedCampaignId}/stats?locationId=${encodedLocationId}` },
    );
  }

  return candidates;
}

async function fetchCampaignAnalyticsWithToken(
  token: string,
  candidates: Array<{ label: string; url: string }>,
  identifiers: { scheduleId?: string; campaignId?: string; recordId?: string },
): Promise<{ analytics: GhlCampaignAnalytics | null; best: GhlCampaignAnalytics | null; authErrors: Error[] }> {
  const authErrors: Error[] = [];
  let bestAny: GhlCampaignAnalytics | null = null;
  let bestWithMetrics: GhlCampaignAnalytics | null = null;

  for (const candidate of candidates) {
    const res = await fetch(candidate.url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Version: API_VERSION,
        Accept: 'application/json,*/*',
      },
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      const detail = summarizeErrorBody(bodyText);
      const suffix = detail ? `: ${detail}` : '';
      const err = new Error(`GHL campaign analytics API error (${res.status})${suffix}`);
      const detailLower = detail.toLowerCase();
      const isIamUnsupported =
        detailLower.includes('not yet supported by the iam service') ||
        detailLower.includes('update your iam config');
      if (res.status === 401 || res.status === 403) {
        if (!isIamUnsupported) {
          authErrors.push(err);
        }
      }
      continue;
    }

    const bodyText = await res.text().catch(() => '');
    let payload: JsonRecord = {};
    if (bodyText.trim()) {
      try {
        const data = JSON.parse(bodyText);
        payload = asRecord(data) ?? {};
      } catch {
        payload = { raw: bodyText };
      }
    }

    const fromPayload = extractCampaignAnalyticsForIdentifiers(payload, identifiers);
    const fromText = extractCampaignAnalyticsFromText(bodyText);
    const extracted: GhlCampaignAnalytics = {
      ...fromText,
      ...fromPayload,
    };
    const normalized = finalizeCampaignAnalytics(extracted);
    const withSource = { ...normalized, source: candidate.label };

    if (!bestAny || compareCampaignAnalyticsQuality(withSource, bestAny) > 0) {
      bestAny = withSource;
    }
    if (hasAnyCampaignAnalytics(normalized) && (!bestWithMetrics || compareCampaignAnalyticsQuality(withSource, bestWithMetrics) > 0)) {
      bestWithMetrics = withSource;
    }
  }

  return { analytics: bestWithMetrics, best: bestWithMetrics ?? bestAny, authErrors };
}

export async function fetchCampaignAnalytics(
  token: string,
  locationId: string,
  identifiers: { scheduleId?: string; campaignId?: string; recordId?: string },
): Promise<GhlCampaignAnalytics> {
  const scheduleId = identifiers.scheduleId?.trim();
  const campaignId = identifiers.campaignId?.trim();
  const recordId = identifiers.recordId?.trim();

  if (!scheduleId && !campaignId && !recordId) {
    throw new Error('scheduleId, campaignId, or recordId is required');
  }

  const candidates = buildCampaignAnalyticsEndpointCandidates(locationId, scheduleId, campaignId, recordId);
  const primary = await fetchCampaignAnalyticsWithToken(token, candidates, { scheduleId, campaignId, recordId });
  if (primary.analytics) return primary.analytics;

  let best = primary.best;
  const authErrors: Error[] = [...primary.authErrors];

  const primaryCampaignListFallback = await fetchCampaignAnalyticsFromCampaignList(
    token,
    locationId,
    { scheduleId, campaignId, recordId },
    'campaign-list',
  );
  if (primaryCampaignListFallback && hasAnyCampaignAnalytics(primaryCampaignListFallback)) {
    return primaryCampaignListFallback;
  }
  if (!best && primaryCampaignListFallback) best = primaryCampaignListFallback;

  const agencyToken = process.env.GHL_AGENCY_TOKEN?.trim();
  if (agencyToken && agencyToken !== token) {
    const agency = await fetchCampaignAnalyticsWithToken(agencyToken, candidates, { scheduleId, campaignId, recordId });
    if (agency.analytics) return agency.analytics;
    if (!best && agency.best) best = agency.best;
    authErrors.push(...agency.authErrors);

    const agencyCampaignListFallback = await fetchCampaignAnalyticsFromCampaignList(
      agencyToken,
      locationId,
      { scheduleId, campaignId, recordId },
      'campaign-list (agency)',
    );
    if (agencyCampaignListFallback && hasAnyCampaignAnalytics(agencyCampaignListFallback)) {
      return agencyCampaignListFallback;
    }
    if (!best && agencyCampaignListFallback) best = agencyCampaignListFallback;
  }

  if (best) return best;
  if (authErrors.length > 0) throw authErrors[authErrors.length - 1];
  return {};
}

// ── Fetch Workflows ──

export async function fetchWorkflows(
  token: string,
  locationId: string,
): Promise<GhlWorkflow[]> {
  const cached = workflowCache.get(locationId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.workflows;
  }

  const attempts = buildWorkflowEndpointCandidates(locationId);
  const errors: string[] = [];
  let raw: JsonRecord[] | null = null;
  let bestEmptyResult: JsonRecord[] | null = null;

  for (const candidate of attempts) {
    try {
      const rows = await fetchPaginatedResource({
        token,
        resourceLabel: 'workflows',
        extractRows: extractWorkflowRows,
        initialCandidates: [candidate],
      });

      if (rows.length > 0) {
        raw = rows;
        break;
      }

      if (!bestEmptyResult) bestEmptyResult = rows;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (!raw) {
    if (bestEmptyResult) {
      raw = bestEmptyResult;
    } else {
      const hint = 'If this is an OAuth-connected account, re-authorize with "workflows.readonly".';
      const detail = errors.length > 0 ? errors[errors.length - 1] : 'Failed to fetch workflows';
      throw new Error(`${detail} ${hint}`);
    }
  }

  const workflows: GhlWorkflow[] = raw.map((w) => ({
    id: firstString(w, ['id', '_id', 'workflowId', 'workflow_id']) || '',
    name: firstString(w, ['name', 'title', 'workflowName', 'workflow_name']) || '',
    status: firstString(w, ['status', 'state']) || 'unknown',
    createdAt: firstString(w, ['createdAt', 'created_at', 'dateCreated', 'date_created']) || '',
    updatedAt: firstString(w, ['updatedAt', 'updated_at', 'dateUpdated', 'date_updated']) || '',
    locationId,
  }))
    .filter((w) => w.id || w.name);

  const deduped = dedupeByKey(workflows, (w) =>
    `${w.id || 'no-id'}|${w.name.toLowerCase()}|${w.status.toLowerCase()}|${w.updatedAt || w.createdAt || ''}`,
  );

  workflowCache.set(locationId, { workflows: deduped, fetchedAt: Date.now() });
  return deduped;
}

export async function fetchCampaignPreviewHtml(
  token: string,
  locationId: string,
  scheduleId: string,
): Promise<{ previewUrl: string; html: string }> {
  const sanitizedScheduleId = scheduleId.trim();
  if (!sanitizedScheduleId) {
    throw new Error('scheduleId is required');
  }

  const candidates = [
    `${GHL_BACKEND_BASE}/emails/schedule/preview/${encodeURIComponent(locationId)}/${encodeURIComponent(sanitizedScheduleId)}`,
    `${GHL_BASE}/emails/schedule/preview/${encodeURIComponent(locationId)}/${encodeURIComponent(sanitizedScheduleId)}`,
  ];

  let lastError: Error | null = null;
  for (const previewUrl of candidates) {
    const res = await fetch(previewUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Version: API_VERSION,
        Accept: 'text/html,application/json,*/*',
      },
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      const detail = summarizeErrorBody(bodyText);
      const suffix = detail ? `: ${detail}` : '';
      lastError = new Error(`GHL campaign preview API error (${res.status})${suffix}`);
      continue;
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await res.json().catch(() => null);
      const record = asRecord(payload) ?? {};
      const data = asRecord(record.data) ?? {};
      const html =
        firstString(record, ['html', 'previewHtml', 'preview']) ||
        firstString(data, ['html', 'previewHtml', 'preview']) ||
        '';
      if (!html) {
        throw new Error('Campaign preview response did not include HTML');
      }
      return { previewUrl, html };
    }

    const html = await res.text();
    if (!html.trim()) {
      throw new Error('Campaign preview response was empty');
    }
    return { previewUrl, html };
  }

  throw lastError ?? new Error('Failed to fetch campaign preview');
}

export interface ScheduleEmailCampaignInput {
  token: string;
  locationId: string;
  name: string;
  subject: string;
  previewText?: string;
  html: string;
  sendAt: string;
  contactIds: string[];
}

export interface ScheduledEmailCampaignResult {
  id: string;
  scheduleId: string;
  campaignId: string;
  status: string;
  endpoint: string;
  response: Record<string, unknown> | null;
}

function extractNestedRecordCandidates(
  value: unknown,
  depth = 0,
  maxDepth = 5,
): JsonRecord[] {
  if (depth > maxDepth) return [];
  const root = asRecord(value);
  if (!root) return [];

  const out: JsonRecord[] = [root];
  for (const nested of Object.values(root)) {
    if (Array.isArray(nested)) {
      for (const item of nested) {
        out.push(...extractNestedRecordCandidates(item, depth + 1, maxDepth));
      }
      continue;
    }
    out.push(...extractNestedRecordCandidates(nested, depth + 1, maxDepth));
  }
  return out;
}

function parseScheduleResult(
  endpoint: string,
  payload: unknown,
): ScheduledEmailCampaignResult {
  const records = extractNestedRecordCandidates(payload);
  const idKeys = ['scheduleId', 'emailScheduleId', 'campaignId', 'id', '_id'];
  const statusKeys = ['status', 'state', 'campaignStatus', 'scheduleStatus'];

  let id = '';
  let scheduleId = '';
  let campaignId = '';
  let status = '';

  for (const record of records) {
    if (!id) id = firstString(record, idKeys) || '';
    if (!scheduleId) {
      scheduleId =
        firstString(record, ['scheduleId', 'emailScheduleId']) ||
        firstString(record, ['id', '_id']) ||
        '';
    }
    if (!campaignId) {
      campaignId =
        firstString(record, ['campaignId', 'emailId', 'id']) ||
        '';
    }
    if (!status) status = firstString(record, statusKeys) || '';
    if (id && scheduleId && campaignId && status) break;
  }

  const resolvedId = id || scheduleId || campaignId;
  return {
    id: resolvedId,
    scheduleId: scheduleId || resolvedId,
    campaignId: campaignId || resolvedId,
    status: status || 'scheduled',
    endpoint,
    response: asRecord(payload),
  };
}

function buildScheduleRequestPayloads(input: ScheduleEmailCampaignInput): JsonRecord[] {
  const dedupedContacts = [...new Set(input.contactIds.map((id) => id.trim()).filter(Boolean))];
  const baseEmail = {
    subject: input.subject,
    previewText: input.previewText || '',
    html: input.html,
    body: input.html,
    message: input.html,
  };

  return [
    {
      locationId: input.locationId,
      name: input.name,
      subject: input.subject,
      previewText: input.previewText || '',
      html: input.html,
      sendAt: input.sendAt,
      contactIds: dedupedContacts,
    },
    {
      locationId: input.locationId,
      campaignName: input.name,
      title: input.name,
      scheduledAt: input.sendAt,
      sendAt: input.sendAt,
      email: baseEmail,
      contactIds: dedupedContacts,
    },
    {
      locationId: input.locationId,
      schedule: {
        name: input.name,
        subject: input.subject,
        previewText: input.previewText || '',
        html: input.html,
        sendAt: input.sendAt,
      },
      recipients: dedupedContacts,
      contactIds: dedupedContacts,
    },
    {
      locationId: input.locationId,
      campaign: {
        name: input.name,
        ...baseEmail,
        sendAt: input.sendAt,
      },
      audience: {
        contactIds: dedupedContacts,
      },
      contactIds: dedupedContacts,
    },
  ];
}

function buildSchedulePostEndpointCandidates(locationId: string): string[] {
  const encodedLocationId = encodeURIComponent(locationId);
  const base = `${GHL_BASE}/emails/schedule`;
  return [
    `${base}`,
    `${base}/`,
    `${base}?locationId=${encodedLocationId}`,
    `${base}/?locationId=${encodedLocationId}`,
    `${GHL_BASE}/campaigns`,
    `${GHL_BASE}/campaigns?locationId=${encodedLocationId}`,
  ];
}

export async function scheduleEmailCampaign(
  input: ScheduleEmailCampaignInput,
): Promise<ScheduledEmailCampaignResult> {
  const name = input.name.trim();
  const subject = input.subject.trim();
  const html = input.html.trim();
  const sendAt = input.sendAt.trim();
  const contactIds = [...new Set(input.contactIds.map((id) => id.trim()).filter(Boolean))];

  if (!name) throw new Error('Campaign name is required');
  if (!subject) throw new Error('Campaign subject is required');
  if (!html) throw new Error('Campaign HTML is required');
  if (!sendAt) throw new Error('sendAt is required');
  if (contactIds.length === 0) throw new Error('At least one contactId is required');

  const payloads = buildScheduleRequestPayloads({
    ...input,
    name,
    subject,
    html,
    sendAt,
    contactIds,
  });
  const endpoints = buildSchedulePostEndpointCandidates(input.locationId);
  const errors: string[] = [];

  for (const endpoint of endpoints) {
    for (const payload of payloads) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.token}`,
          Version: API_VERSION,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text().catch(() => '');
      if (!res.ok) {
        const detail = summarizeErrorBody(text);
        errors.push(`${endpoint}: ${res.status}${detail ? ` ${detail}` : ''}`);
        continue;
      }

      let parsed: unknown = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = {};
      }

      const result = parseScheduleResult(endpoint, parsed);
      if (!result.id) {
        return {
          ...result,
          id: `scheduled-${Date.now()}`,
        };
      }
      return result;
    }
  }

  const detail = errors.slice(-3).join(' | ');
  throw new Error(
    `Unable to schedule email campaign in GoHighLevel.${detail ? ` ${detail}` : ''} Reconnect the account with write scopes and try again.`,
  );
}
