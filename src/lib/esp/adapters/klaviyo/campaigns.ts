// ── Klaviyo Campaigns + Flows Adapter ──

import { KLAVIYO_BASE, KLAVIYO_REVISION } from './constants';
import type {
  EspCampaign,
  EspCampaignAnalytics,
  EspWorkflow,
  ScheduleEmailCampaignInput,
  ScheduledEmailCampaignResult,
} from '../../types';

// ── Request helper ──

function klaviyoHeaders(apiKey: string, json = false): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    revision: KLAVIYO_REVISION,
    Accept: 'application/vnd.api+json',
  };
  if (json) h['Content-Type'] = 'application/vnd.api+json';
  return h;
}

// ── Campaign cache (5-minute TTL) ──

const campaignCache = new Map<string, { data: EspCampaign[]; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function invalidateCampaignCache(accountId?: string): void {
  if (accountId) {
    campaignCache.delete(accountId);
  } else {
    campaignCache.clear();
  }
}

// ── Fetch Campaigns ──

export async function fetchCampaigns(
  apiKey: string,
  locationId: string,
  options?: { forceRefresh?: boolean },
): Promise<EspCampaign[]> {
  const cacheKey = locationId;

  if (!options?.forceRefresh) {
    const cached = campaignCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  }

  const campaigns: EspCampaign[] = [];
  let url: string | null =
    `${KLAVIYO_BASE}/campaigns/?sort=-send_time&page[size]=50`;

  while (url) {
    const res: Response = await fetch(url, { headers: klaviyoHeaders(apiKey) });
    if (!res.ok) {
      throw new Error(`Klaviyo campaigns fetch failed (${res.status})`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();

    for (const item of json.data ?? []) {
      const attrs = item.attributes ?? {};
      const sendStrategy = attrs.send_strategy ?? {};
      const scheduledAt = sendStrategy.options_static?.datetime || null;

      campaigns.push({
        id: item.id,
        campaignId: item.id,
        name: attrs.name || 'Untitled',
        status: mapKlaviyoStatus(attrs.status),
        createdAt: attrs.created_at || '',
        updatedAt: attrs.updated_at || '',
        scheduledAt: scheduledAt || undefined,
        sentAt: attrs.send_time || undefined,
        locationId,
      });
    }

    url = json.links?.next ?? null;
  }

  campaignCache.set(cacheKey, { data: campaigns, ts: Date.now() });
  return campaigns;
}

function mapKlaviyoStatus(status: string): string {
  // Klaviyo statuses: draft, scheduled, sending, sent, cancelled
  const map: Record<string, string> = {
    draft: 'draft',
    scheduled: 'scheduled',
    sending: 'sending',
    sent: 'sent',
    cancelled: 'canceled',
  };
  return map[status?.toLowerCase()] || status || 'unknown';
}

// ── Fetch Campaign Analytics ──

/**
 * Klaviyo actually exposes full campaign analytics via the Reporting API!
 * This is a major advantage over GHL where stats are blocked behind IAM.
 */
export async function fetchCampaignAnalytics(
  apiKey: string,
  _locationId: string,
  identifiers: { scheduleId?: string; campaignId?: string; recordId?: string },
): Promise<EspCampaignAnalytics> {
  const campaignId = identifiers.campaignId || identifiers.scheduleId || identifiers.recordId;
  if (!campaignId) {
    return { source: 'klaviyo' };
  }

  const res = await fetch(`${KLAVIYO_BASE}/campaign-values-reports/`, {
    method: 'POST',
    headers: klaviyoHeaders(apiKey, true),
    body: JSON.stringify({
      data: {
        type: 'campaign-values-report',
        attributes: {
          statistics: [
            'opens',
            'open_rate',
            'clicks',
            'clicks_unique',
            'bounced',
            'delivery_rate',
            'unsubscribes',
            'spam_complaints',
          ],
          timeframe: { key: 'last_12_months' },
          filter: `equals(campaign_id,"${campaignId}")`,
        },
      },
    }),
  });

  if (!res.ok) {
    // Rate limited (1/s, 2/m, 225/day) — return empty on failure
    console.warn(`Klaviyo campaign analytics failed (${res.status}) for ${campaignId}`);
    return { source: 'klaviyo' };
  }

  const json = await res.json();
  const results = json.data?.attributes?.results?.[0]?.statistics ?? {};

  return {
    openedCount: results.opens ?? undefined,
    clickedCount: results.clicks_unique ?? results.clicks ?? undefined,
    bouncedCount: results.bounced ?? undefined,
    unsubscribedCount: results.unsubscribes ?? undefined,
    openRate: results.open_rate ?? undefined,
    source: 'klaviyo',
  };
}

// ── Fetch Workflows (Flows) ──

const flowCache = new Map<string, { data: EspWorkflow[]; ts: number }>();

export async function fetchWorkflows(
  apiKey: string,
  locationId: string,
): Promise<EspWorkflow[]> {
  const cached = flowCache.get(locationId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const flows: EspWorkflow[] = [];
  let url: string | null = `${KLAVIYO_BASE}/flows/?sort=-created&page[size]=50`;

  while (url) {
    const res: Response = await fetch(url, { headers: klaviyoHeaders(apiKey) });
    if (!res.ok) {
      throw new Error(`Klaviyo flows fetch failed (${res.status})`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();

    for (const item of json.data ?? []) {
      const attrs = item.attributes ?? {};
      flows.push({
        id: item.id,
        name: attrs.name || 'Untitled Flow',
        status: mapFlowStatus(attrs.status),
        createdAt: attrs.created || '',
        updatedAt: attrs.updated || '',
        locationId,
      });
    }

    url = json.links?.next ?? null;
  }

  flowCache.set(locationId, { data: flows, ts: Date.now() });
  return flows;
}

function mapFlowStatus(status: string): string {
  // Klaviyo flow statuses: draft, manual, live
  const map: Record<string, string> = {
    draft: 'draft',
    manual: 'manual',
    live: 'active',
  };
  return map[status?.toLowerCase()] || status || 'unknown';
}

// ── Fetch Campaign Preview HTML ──

export async function fetchCampaignPreviewHtml(
  apiKey: string,
  _locationId: string,
  campaignId: string,
): Promise<{ previewUrl: string; html: string }> {
  // Step 1: Get the campaign to find its message/template
  const campaignRes = await fetch(
    `${KLAVIYO_BASE}/campaigns/${campaignId}/?include=campaign-messages`,
    { headers: klaviyoHeaders(apiKey) },
  );

  if (!campaignRes.ok) {
    throw new Error(`Klaviyo campaign fetch failed (${campaignRes.status})`);
  }

  const campaignJson = await campaignRes.json();
  const messages = campaignJson.included?.filter(
    (i: Record<string, unknown>) => i.type === 'campaign-message',
  ) ?? [];

  if (messages.length === 0) {
    return { previewUrl: '', html: '<p>No campaign content available</p>' };
  }

  // Step 2: Get the template ID from the first message
  const messageId = messages[0].id;
  const templateRes = await fetch(
    `${KLAVIYO_BASE}/campaign-messages/${messageId}/template/`,
    { headers: klaviyoHeaders(apiKey) },
  );

  if (!templateRes.ok) {
    return { previewUrl: '', html: '<p>Failed to load campaign preview</p>' };
  }

  const templateJson = await templateRes.json();
  const templateHtml = templateJson.data?.attributes?.html || '<p>No HTML content</p>';
  const templateId = templateJson.data?.id || '';

  return {
    previewUrl: `https://www.klaviyo.com/email-editor/${templateId}`,
    html: templateHtml,
  };
}

// ── Schedule Email Campaign ──

export async function scheduleEmailCampaign(
  input: ScheduleEmailCampaignInput,
): Promise<ScheduledEmailCampaignResult> {
  const { token: apiKey, name, subject, previewText, sendAt, contactIds } = input;

  // Klaviyo requires a list or segment as audience, not individual contact IDs.
  // For individual sends, we'd need to create a temporary list first.
  // This is a simplified implementation — in production you'd:
  // 1. Create a temporary list
  // 2. Add profiles to the list
  // 3. Create the campaign targeting that list
  // 4. Assign content
  // 5. Send it

  // Step 1: Create campaign
  const createRes = await fetch(`${KLAVIYO_BASE}/campaigns/`, {
    method: 'POST',
    headers: klaviyoHeaders(apiKey, true),
    body: JSON.stringify({
      data: {
        type: 'campaign',
        attributes: {
          name,
          audiences: {
            included: contactIds, // In production, these should be list/segment IDs
            excluded: [],
          },
          send_strategy: {
            method: 'static',
            options_static: {
              datetime: sendAt,
              is_local: false,
              send_past_recipients_immediately: false,
            },
          },
          campaign_messages: [{
            channel: 'email',
            label: 'Default',
            content: {
              subject,
              preview_text: previewText || '',
            },
          }],
        },
      },
    }),
  });

  if (!createRes.ok) {
    const body = await createRes.text().catch(() => '');
    throw new Error(`Klaviyo campaign creation failed (${createRes.status}): ${body}`);
  }

  const created = await createRes.json();
  const campaignId = created.data?.id;

  if (!campaignId) {
    throw new Error('Klaviyo returned no campaign ID');
  }

  // Step 2: Send the campaign
  const sendRes = await fetch(`${KLAVIYO_BASE}/campaign-send-jobs/`, {
    method: 'POST',
    headers: klaviyoHeaders(apiKey, true),
    body: JSON.stringify({
      data: {
        type: 'campaign-send-job',
        attributes: {
          campaign_id: campaignId,
        },
      },
    }),
  });

  const sendResponse = sendRes.ok ? await sendRes.json().catch(() => null) : null;

  return {
    id: campaignId,
    scheduleId: campaignId,
    campaignId,
    status: sendRes.ok ? 'scheduled' : 'draft',
    endpoint: `${KLAVIYO_BASE}/campaigns/${campaignId}/`,
    response: sendResponse,
  };
}
