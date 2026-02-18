import crypto from 'crypto';
import type { EspProvider } from '@/lib/esp/types';
import { requireEspOAuthStateSecrets } from '@/lib/esp/secrets';

const STATE_VERSION = 1 as const;
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 60 * 1000;

export type EspOAuthStatePayload = {
  v: typeof STATE_VERSION;
  provider: EspProvider;
  accountKey: string;
  ts: number;
};

function normalizeProvider(value: string | null | undefined): EspProvider | null {
  const normalized = (value || '').trim().toLowerCase();
  return normalized ? (normalized as EspProvider) : null;
}

function deriveHmacKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(`${secret}:esp-oauth-state`).digest();
}

function getHmacKeys(): Buffer[] {
  return requireEspOAuthStateSecrets().map((secret) => deriveHmacKey(secret));
}

function parseStateParts(state: string): { payloadB64: string; signature: string } | null {
  const [payloadB64, signature] = state.split('.');
  if (!payloadB64 || !signature) return null;
  return { payloadB64, signature };
}

function hasValidSignature(payloadB64: string, signature: string): boolean {
  const signatureBuffer = Buffer.from(signature, 'base64url');
  for (const key of getHmacKeys()) {
    const expectedSignature = crypto
      .createHmac('sha256', key)
      .update(payloadB64)
      .digest('base64url');
    const expectedBuffer = Buffer.from(expectedSignature, 'base64url');
    if (signatureBuffer.length !== expectedBuffer.length) continue;
    if (crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return true;
  }
  return false;
}

function parsePayload(payloadB64: string): EspOAuthStatePayload | null {
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const provider = normalizeProvider(payload?.provider);
    const accountKey = typeof payload?.accountKey === 'string' ? payload.accountKey.trim() : '';
    const ts = typeof payload?.ts === 'number' ? payload.ts : Number.NaN;
    if (payload?.v !== STATE_VERSION) return null;
    if (!provider || !accountKey || !Number.isFinite(ts)) return null;
    return {
      v: STATE_VERSION,
      provider,
      accountKey,
      ts,
    };
  } catch {
    return null;
  }
}

export function signEspOAuthState(input: {
  provider: EspProvider;
  accountKey: string;
  ts?: number;
}): string {
  const provider = normalizeProvider(input.provider);
  const accountKey = input.accountKey.trim();
  if (!provider) throw new Error('OAuth state provider is required');
  if (!accountKey) throw new Error('OAuth state accountKey is required');

  const payload: EspOAuthStatePayload = {
    v: STATE_VERSION,
    provider,
    accountKey,
    ts: typeof input.ts === 'number' && Number.isFinite(input.ts) ? input.ts : Date.now(),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const [primaryKey] = getHmacKeys();
  const signature = crypto.createHmac('sha256', primaryKey).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

export function verifyEspOAuthState(
  state: string | null | undefined,
  options: {
    expectedProvider?: EspProvider;
    maxAgeMs?: number;
  } = {},
): EspOAuthStatePayload | null {
  try {
    const rawState = (state || '').trim();
    if (!rawState) return null;

    const parts = parseStateParts(rawState);
    if (!parts) return null;
    if (!hasValidSignature(parts.payloadB64, parts.signature)) return null;

    const payload = parsePayload(parts.payloadB64);
    if (!payload) return null;

    const expectedProvider = normalizeProvider(options.expectedProvider);
    if (expectedProvider && payload.provider !== expectedProvider) return null;

    const maxAgeMs = typeof options.maxAgeMs === 'number' && options.maxAgeMs > 0
      ? options.maxAgeMs
      : DEFAULT_MAX_AGE_MS;
    const ageMs = Date.now() - payload.ts;
    if (ageMs > maxAgeMs) return null;
    if (ageMs < -MAX_FUTURE_CLOCK_SKEW_MS) return null;

    return payload;
  } catch {
    return null;
  }
}
