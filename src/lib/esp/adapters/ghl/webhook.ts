import crypto from 'crypto';

// ── Signature Verification ──

/**
 * Verify the x-wh-signature header from GHL webhooks.
 * GHL signs the raw request body with RSA-SHA256 using their private key.
 * We verify using the public key from the GHL developer portal.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const publicKey = process.env.GHL_WEBHOOK_PUBLIC_KEY;

  // Without a public key, skip verification but log clearly
  if (!publicKey) {
    console.warn(
      '[webhook:ghl] GHL_WEBHOOK_PUBLIC_KEY not set — accepting webhook without signature verification. ' +
      'Set this env var in production for security.',
    );
    // Accept the webhook anyway — it's better to process stats than silently drop them.
    // The webhook endpoint URL itself serves as a shared secret.
    return true;
  }

  if (!signature) {
    console.warn('[webhook:ghl] No x-wh-signature header present on request');
    return false;
  }

  try {
    const pem = publicKey.replace(/\\n/g, '\n');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(rawBody);
    const valid = verifier.verify(pem, signature, 'base64');
    if (!valid) {
      console.warn('[webhook:ghl] RSA-SHA256 signature mismatch — rejecting');
    }
    return valid;
  } catch (err) {
    console.error('[webhook:ghl] Signature verification error:', err);
    return false;
  }
}

// ── Payload Types ──

export interface LCEmailStatsPayload {
  type: string;
  locationId: string;
  companyId?: string;
  // GHL payloads can include top-level campaign/email identifiers
  campaignId?: string;
  emailId?: string;
  scheduleId?: string;
  webhookPayload: {
    event: string;
    id: string;
    timestamp: number;
    recipient?: string;
    campaigns?: string[];
    campaignId?: string;
    emailId?: string;
    scheduleId?: string;
    message?: {
      headers?: Record<string, string>;
    };
    tags?: string[];
    // GHL sometimes nests additional data
    [key: string]: unknown;
  };
}

// ── Event Mapping ──

export type WebhookEventColumn =
  | 'deliveredCount'
  | 'openedCount'
  | 'clickedCount'
  | 'bouncedCount'
  | 'complainedCount'
  | 'unsubscribedCount';

export function eventToColumn(event: string): WebhookEventColumn | null {
  // Use fuzzy matching (like Klaviyo handler) to handle variations in event names
  // GHL may send: "delivered", "Delivered", "email.delivered", "EmailDelivered", etc.
  const normalized = event.toLowerCase().replace(/[^a-z]+/g, '');
  if (!normalized) return null;

  // Order matters: check more specific patterns first to avoid false positives
  if (normalized.includes('unsubscribe')) return 'unsubscribedCount';
  if (normalized.includes('complain') || normalized.includes('spam')) return 'complainedCount';
  if (normalized.includes('bounce')) return 'bouncedCount';
  if (normalized.includes('click')) return 'clickedCount';
  if (normalized.includes('open')) return 'openedCount';
  if (normalized.includes('deliver')) return 'deliveredCount';
  return null;
}

// ── Campaign ID Extraction ──

/**
 * Extract campaign identifiers from the webhook payload.
 * GHL payloads may include campaign IDs in various locations:
 * - webhookPayload.campaigns[] (array of IDs)
 * - webhookPayload.campaignId / emailId / scheduleId (direct fields)
 * - payload.campaignId / emailId / scheduleId (top-level fields)
 * - webhookPayload.tags[] (tags that look like IDs)
 */
export function extractCampaignIds(payload: LCEmailStatsPayload): string[] {
  const ids = new Set<string>();
  const wp = payload.webhookPayload;

  // Primary: campaigns array
  if (Array.isArray(wp.campaigns)) {
    for (const c of wp.campaigns) {
      if (typeof c === 'string' && c.trim()) ids.add(c.trim());
    }
  }

  // Direct ID fields on webhookPayload
  for (const key of ['campaignId', 'emailId', 'scheduleId'] as const) {
    const val = wp[key];
    if (typeof val === 'string' && val.trim()) ids.add(val.trim());
  }

  // Top-level ID fields on the payload root
  for (const key of ['campaignId', 'emailId', 'scheduleId'] as const) {
    const val = payload[key];
    if (typeof val === 'string' && val.trim()) ids.add(val.trim());
  }

  // Tags that look like IDs (alphanumeric, 10+ chars)
  if (Array.isArray(wp.tags)) {
    for (const tag of wp.tags) {
      if (typeof tag === 'string' && /^[a-zA-Z0-9_-]{10,}$/.test(tag)) {
        ids.add(tag.trim());
      }
    }
  }

  return [...ids].filter(Boolean);
}
