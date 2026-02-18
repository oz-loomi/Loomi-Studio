import crypto from 'crypto';

// ── Signature Verification ──

/**
 * Verify the x-wh-signature header from GHL webhooks.
 * GHL signs the raw request body with RSA-SHA256 using their private key.
 * We verify using the public key from the GHL developer portal.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const publicKey = process.env.GHL_WEBHOOK_PUBLIC_KEY;

  // In development without a key, skip verification (log a warning)
  if (!publicKey) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[webhook] GHL_WEBHOOK_PUBLIC_KEY not set — skipping verification (dev mode)');
      return true;
    }
    console.error('[webhook] GHL_WEBHOOK_PUBLIC_KEY not set — cannot verify');
    return false;
  }

  if (!signature) return false;

  try {
    const pem = publicKey.replace(/\\n/g, '\n');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(rawBody);
    return verifier.verify(pem, signature, 'base64');
  } catch (err) {
    console.error('[webhook] Signature verification error:', err);
    return false;
  }
}

// ── Payload Types ──

export interface LCEmailStatsPayload {
  type: string;
  locationId: string;
  companyId?: string;
  webhookPayload: {
    event: string;
    id: string;
    timestamp: number;
    recipient?: string;
    campaigns?: string[];
    message?: {
      headers?: Record<string, string>;
    };
    tags?: string[];
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
  switch (event) {
    case 'delivered': return 'deliveredCount';
    case 'opened':    return 'openedCount';
    case 'clicked':   return 'clickedCount';
    case 'bounced':   return 'bouncedCount';
    case 'complained': return 'complainedCount';
    case 'unsubscribed': return 'unsubscribedCount';
    default: return null;
  }
}

// ── Campaign ID Extraction ──

/**
 * Extract campaign identifiers from the webhook payload.
 * The `campaigns` array is primary; `tags` may also contain IDs.
 */
export function extractCampaignIds(payload: LCEmailStatsPayload): string[] {
  const ids: string[] = [];

  if (payload.webhookPayload.campaigns) {
    ids.push(...payload.webhookPayload.campaigns);
  }

  if (payload.webhookPayload.tags) {
    for (const tag of payload.webhookPayload.tags) {
      if (/^[a-zA-Z0-9_-]{10,}$/.test(tag) && !ids.includes(tag)) {
        ids.push(tag);
      }
    }
  }

  return ids.filter(Boolean);
}
