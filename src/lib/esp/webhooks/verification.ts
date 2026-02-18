import { NextRequest } from 'next/server';
import '@/lib/esp/init';
import { getAdapter } from '@/lib/esp/registry';

export function requestHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of req.headers.entries()) {
    headers[key.toLowerCase()] = value;
  }
  return headers;
}

function resolveSignature(
  headers: Record<string, string>,
  candidates: string[],
): string {
  for (const candidate of candidates) {
    const value = headers[candidate.toLowerCase()];
    if (value) return value;
  }
  return '';
}

export function verifyProviderWebhookSignature(params: {
  provider: string;
  rawBody: string;
  headers: Record<string, string>;
  signatureHeaderCandidates?: string[];
}): { ok: boolean; signature: string } {
  let signature = '';
  try {
    const webhook = getAdapter(params.provider).webhook;
    if (!webhook) return { ok: false, signature: '' };
    const candidates = (
      Array.isArray(params.signatureHeaderCandidates) && params.signatureHeaderCandidates.length > 0
        ? params.signatureHeaderCandidates
        : Array.isArray(webhook.signatureHeaderCandidates)
          ? [...webhook.signatureHeaderCandidates]
          : []
    ).map((header) => String(header || '').toLowerCase()).filter(Boolean);
    signature = resolveSignature(params.headers, candidates);
    const ok = webhook.verifySignature({
      rawBody: params.rawBody,
      signature,
      headers: params.headers,
    });
    return { ok, signature };
  } catch {
    return { ok: false, signature };
  }
}
