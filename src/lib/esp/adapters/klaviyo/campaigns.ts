// ── Klaviyo Campaigns + Flows Adapter ──

import { KLAVIYO_BASE, KLAVIYO_REVISION } from './constants';
import { createTemplate } from './templates';
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
    `${KLAVIYO_BASE}/campaigns/?filter=equals(messages.channel,'email')&sort=-created_at`;

  while (url) {
    const res: Response = await fetch(url, { headers: klaviyoHeaders(apiKey) });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[Klaviyo] campaigns fetch failed (${res.status}) for ${locationId}:`, body);
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
  let url: string | null = `${KLAVIYO_BASE}/flows/?sort=-created`;

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

// ── Klaviyo List Helpers (temporary lists for campaign targeting) ──

const PROFILE_BATCH_SIZE = 100;

async function createList(
  apiKey: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const res = await fetch(`${KLAVIYO_BASE}/lists/`, {
    method: 'POST',
    headers: klaviyoHeaders(apiKey, true),
    body: JSON.stringify({
      data: {
        type: 'list',
        attributes: { name },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Klaviyo list creation failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  const id = json.data?.id;
  if (!id) throw new Error('Klaviyo returned no list ID');
  return { id, name: json.data?.attributes?.name || name };
}

async function addProfilesToList(
  apiKey: string,
  listId: string,
  profileIds: string[],
): Promise<void> {
  for (let i = 0; i < profileIds.length; i += PROFILE_BATCH_SIZE) {
    const batch = profileIds.slice(i, i + PROFILE_BATCH_SIZE);
    const res = await fetch(
      `${KLAVIYO_BASE}/lists/${encodeURIComponent(listId)}/relationships/profiles/`,
      {
        method: 'POST',
        headers: klaviyoHeaders(apiKey, true),
        body: JSON.stringify({
          data: batch.map((id) => ({ type: 'profile', id })),
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Klaviyo add-profiles-to-list failed (${res.status}) batch ${Math.floor(i / PROFILE_BATCH_SIZE) + 1}: ${body}`,
      );
    }
  }
}

async function deleteList(apiKey: string, listId: string): Promise<void> {
  const res = await fetch(
    `${KLAVIYO_BASE}/lists/${encodeURIComponent(listId)}/`,
    { method: 'DELETE', headers: klaviyoHeaders(apiKey) },
  );
  if (!res.ok && res.status !== 404) {
    console.warn(`[Klaviyo] temp list cleanup failed (${res.status}) for ${listId}`);
  }
}

// ── Campaign Message Helpers ──

async function assignTemplateToMessage(
  apiKey: string,
  messageId: string,
  templateId: string,
): Promise<void> {
  const res = await fetch(`${KLAVIYO_BASE}/campaign-message-assign-template/`, {
    method: 'POST',
    headers: klaviyoHeaders(apiKey, true),
    body: JSON.stringify({
      data: {
        type: 'campaign-message',
        id: messageId,
        relationships: {
          template: {
            data: { type: 'template', id: templateId },
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Klaviyo assign-template failed (${res.status}): ${body}`);
  }
}

async function updateCampaignMessage(
  apiKey: string,
  messageId: string,
  content: { subject: string; preview_text?: string },
): Promise<void> {
  const res = await fetch(
    `${KLAVIYO_BASE}/campaign-messages/${encodeURIComponent(messageId)}/`,
    {
      method: 'PATCH',
      headers: klaviyoHeaders(apiKey, true),
      body: JSON.stringify({
        data: {
          type: 'campaign-message',
          id: messageId,
          attributes: {
            content: {
              subject: content.subject,
              preview_text: content.preview_text || '',
            },
          },
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Klaviyo update-campaign-message failed (${res.status}): ${body}`);
  }
}

// ── Schedule Email Campaign ──

export async function scheduleEmailCampaign(
  input: ScheduleEmailCampaignInput,
): Promise<ScheduledEmailCampaignResult> {
  const { token: apiKey, locationId, name, subject, previewText, html, sendAt, contactIds, remoteTemplateId } = input;
  const timestamp = Date.now();

  // Step 1: Resolve or create template in Klaviyo
  let templateId = remoteTemplateId;
  if (!templateId) {
    const template = await createTemplate(apiKey, locationId, {
      name: `Loomi Campaign: ${name} [${timestamp}]`,
      html,
      editorType: 'CODE',
    });
    templateId = template.id;
  }

  // Step 2: Create temporary list for audience targeting
  let listId: string | undefined;
  try {
    const list = await createList(apiKey, `Loomi Send: ${name} [${timestamp}]`);
    listId = list.id;

    // Step 3: Batch-add contact profiles to the list
    await addProfilesToList(apiKey, listId, contactIds);

    // Step 4: Create campaign targeting the list
    const createCampaignRes = await fetch(`${KLAVIYO_BASE}/campaigns/`, {
      method: 'POST',
      headers: klaviyoHeaders(apiKey, true),
      body: JSON.stringify({
        data: {
          type: 'campaign',
          attributes: {
            name,
            audiences: {
              included: [listId],
              excluded: [],
            },
            campaign_messages: [{
              channel: 'email',
              label: 'Default',
              content: {
                subject,
                preview_text: previewText || '',
              },
            }],
            send_strategy: {
              method: 'static',
              options_static: {
                datetime: sendAt,
                is_local: false,
                send_past_recipients_immediately: false,
              },
            },
          },
        },
      }),
    });

    if (!createCampaignRes.ok) {
      const body = await createCampaignRes.text().catch(() => '');
      throw new Error(`Klaviyo campaign creation failed (${createCampaignRes.status}): ${body}`);
    }

    const created = await createCampaignRes.json();
    const campaignId = created.data?.id;
    if (!campaignId) throw new Error('Klaviyo returned no campaign ID');

    // Step 5: Extract campaign message ID
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageId = (created.data?.relationships?.['campaign-messages']?.data as any[])?.[0]?.id;
    if (!messageId) throw new Error('Klaviyo returned no campaign message ID');

    // Step 6: Assign template to the campaign message
    await assignTemplateToMessage(apiKey, messageId, templateId);

    // Step 7: Update message with subject + preview text
    await updateCampaignMessage(apiKey, messageId, {
      subject,
      preview_text: previewText || '',
    });

    // Step 8: For immediate sends (within 2 minutes), fire a send job
    let status = 'scheduled';
    let sendJobResponse: Record<string, unknown> | null = null;
    const sendAtMs = new Date(sendAt).getTime();
    const isImmediate = sendAtMs <= Date.now() + 2 * 60_000;

    if (isImmediate) {
      const sendRes = await fetch(`${KLAVIYO_BASE}/campaign-send-jobs/`, {
        method: 'POST',
        headers: klaviyoHeaders(apiKey, true),
        body: JSON.stringify({
          data: {
            type: 'campaign-send-job',
            id: campaignId,
          },
        }),
      });

      sendJobResponse = sendRes.ok ? await sendRes.json().catch(() => null) : null;
      status = sendRes.ok ? 'sending' : 'scheduled';
    }

    // Step 9: Cleanup temp list (fire-and-forget)
    deleteList(apiKey, listId).catch((err) => {
      console.warn('[Klaviyo] temp list cleanup error:', err);
    });

    // Invalidate campaign cache so new campaign shows up
    invalidateCampaignCache(locationId);

    return {
      id: campaignId,
      scheduleId: campaignId,
      campaignId,
      status,
      endpoint: `${KLAVIYO_BASE}/campaigns/${campaignId}/`,
      response: sendJobResponse,
    };
  } catch (err) {
    // Cleanup temp list on any failure
    if (listId) {
      deleteList(apiKey, listId).catch((cleanupErr) => {
        console.warn('[Klaviyo] temp list cleanup after error:', cleanupErr);
      });
    }
    throw err;
  }
}
