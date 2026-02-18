// ── Klaviyo Webhook Verification ──
// Klaviyo uses HMAC-SHA256 with the webhook secret key.
// Headers: Klaviyo-Signature, Klaviyo-Timestamp, Klaviyo-Webhook-Id

import crypto from 'crypto';

/**
 * Verify a Klaviyo webhook signature.
 *
 * Klaviyo's algorithm:
 * 1. HMAC-SHA256(secret_key, rawBody + timestamp) → hex digest
 * 2. Compare with Klaviyo-Signature header
 *
 * @param rawBody - The raw request body as a string
 * @param signature - The Klaviyo-Signature header value
 * @param timestamp - The Klaviyo-Timestamp header value (optional, included in HMAC)
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  timestamp?: string,
): boolean {
  const secret = process.env.KLAVIYO_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('KLAVIYO_WEBHOOK_SECRET not set — cannot verify webhook signature');
    return false;
  }

  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody);
    if (timestamp) {
      hmac.update(timestamp);
    }
    const computed = hmac.digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(signature, 'hex'),
    );
  } catch {
    return false;
  }
}
