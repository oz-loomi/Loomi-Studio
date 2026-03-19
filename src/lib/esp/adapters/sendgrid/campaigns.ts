// ── SendGrid Campaigns Adapter ──
// SendGrid sends are dispatched via the Mail Send API (POST /v3/mail/send).
// Campaign listing will be backed by Loomi's own EmailCampaign model in the future.

import { SENDGRID_BASE } from './constants';
import type {
  EspCampaign,
  EspCampaignAnalytics,
  EspWorkflow,
  ScheduleEmailCampaignInput,
  ScheduledEmailCampaignResult,
} from '../../types';

// ── Request helper ──

function sendgridHeaders(apiKey: string, json = false): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };
  if (json) h['Content-Type'] = 'application/json';
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
  _apiKey: string,
  locationId: string,
  options?: { forceRefresh?: boolean },
): Promise<EspCampaign[]> {
  const cacheKey = locationId;

  if (!options?.forceRefresh) {
    const cached = campaignCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  }

  // TODO: Back campaign listing with Loomi's own EmailCampaign model.
  const campaigns: EspCampaign[] = [];

  campaignCache.set(cacheKey, { data: campaigns, ts: Date.now() });
  return campaigns;
}

// ── Fetch Campaign Analytics ──

export async function fetchCampaignAnalytics(
  _apiKey: string,
  _locationId: string,
  _identifiers: { scheduleId?: string; campaignId?: string; recordId?: string },
): Promise<EspCampaignAnalytics> {
  // TODO: Back analytics with Loomi's own EmailCampaign model.
  return {};
}

// ── Fetch Workflows (not applicable) ──

export async function fetchWorkflows(
  _apiKey: string,
  _locationId: string,
): Promise<EspWorkflow[]> {
  return [];
}

// ── Fetch Campaign Preview HTML ──

export async function fetchCampaignPreviewHtml(
  _apiKey: string,
  _locationId: string,
  _campaignId: string,
): Promise<{ previewUrl: string; html: string }> {
  // SendGrid transactional sends don't store rendered HTML per-campaign.
  // This would require template lookup, which is a future enhancement.
  return { previewUrl: '', html: '' };
}

// ── Schedule / Send Email Campaign ──

interface SendGridPersonalization {
  to: Array<{ email: string; name?: string }>;
  custom_args?: Record<string, string>;
}

interface SendGridMailSendPayload {
  personalizations: SendGridPersonalization[];
  from: { email: string; name?: string };
  subject: string;
  content?: Array<{ type: string; value: string }>;
  template_id?: string;
  custom_args?: Record<string, string>;
}

/**
 * Send an email campaign via SendGrid's Mail Send API.
 * Batches recipients into groups of 1,000 (SendGrid's per-request limit).
 *
 * IMPORTANT: Includes custom_args { loomi_campaign_id, loomi_account_key }
 * so webhook events can be correlated back to this campaign.
 */
export async function scheduleEmailCampaign(
  input: ScheduleEmailCampaignInput,
): Promise<ScheduledEmailCampaignResult> {
  const { token: apiKey, locationId, name, subject, html, contactIds } = input;

  // Generate a unique campaign ID for tracking
  const campaignId = `sg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  // Custom args for webhook correlation
  const customArgs: Record<string, string> = {
    loomi_campaign_id: campaignId,
    loomi_account_key: locationId,
  };

  // Batch contacts into groups of 1,000
  const BATCH_SIZE = 1000;
  const batches: string[][] = [];
  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    batches.push(contactIds.slice(i, i + BATCH_SIZE));
  }

  let lastResponse: Record<string, unknown> | null = null;

  for (const batch of batches) {
    const personalizations: SendGridPersonalization[] = batch.map((email) => ({
      to: [{ email }],
      custom_args: customArgs,
    }));

    const payload: SendGridMailSendPayload = {
      personalizations,
      from: { email: 'noreply@loomilm.com', name: name || 'Loomi' },
      subject,
      custom_args: customArgs,
    };

    if (input.remoteTemplateId) {
      payload.template_id = input.remoteTemplateId;
    } else {
      payload.content = [{ type: 'text/html', value: html }];
    }

    const res = await fetch(`${SENDGRID_BASE}/v3/mail/send`, {
      method: 'POST',
      headers: sendgridHeaders(apiKey, true),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      console.error(`[SendGrid] Mail send failed (${res.status}):`, errorBody);
      throw new Error(`SendGrid mail send failed (${res.status}): ${errorBody}`);
    }

    // SendGrid returns 202 Accepted with no body on success
    if (res.status === 202) {
      const messageId = res.headers.get('x-message-id') || '';
      lastResponse = { status: 202, messageId };
    } else {
      lastResponse = await res.json().catch(() => null);
    }
  }

  return {
    id: campaignId,
    scheduleId: campaignId,
    campaignId,
    status: 'accepted',
    endpoint: `${SENDGRID_BASE}/v3/mail/send`,
    response: lastResponse,
  };
}
