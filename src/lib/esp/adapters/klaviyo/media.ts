// ── Klaviyo Images ──
// List, upload, and rename images via the Klaviyo API.

import { KLAVIYO_BASE, KLAVIYO_REVISION } from './constants';
import type { EspMedia, MediaListResult, MediaUploadInput } from '../../types';

// ── In-memory cache (5 min TTL) ──

const mediaCache = new Map<string, { data: EspMedia[]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(accountId: string): string {
  return `klaviyo-media:${accountId}`;
}

function getCached(accountId: string): EspMedia[] | null {
  const entry = mediaCache.get(cacheKey(accountId));
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    mediaCache.delete(cacheKey(accountId));
    return null;
  }
  return entry.data;
}

function setCache(accountId: string, data: EspMedia[]): void {
  mediaCache.set(cacheKey(accountId), { data, fetchedAt: Date.now() });
}

function invalidateCache(accountId: string): void {
  mediaCache.delete(cacheKey(accountId));
}

// ── Helpers ──

function klaviyoHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    Accept: 'application/json',
    revision: KLAVIYO_REVISION,
  };
}

function normalizeImage(raw: Record<string, unknown>): EspMedia {
  const attrs = (raw.attributes || {}) as Record<string, unknown>;
  return {
    id: String(raw.id || ''),
    name: String(attrs.name || ''),
    url: String(attrs.image_url || ''),
    type: String(attrs.format || 'image'),
    size: typeof attrs.size === 'number' ? attrs.size : undefined,
    thumbnailUrl: String(attrs.image_url || ''),
    createdAt: String(attrs.created || ''),
    updatedAt: String(attrs.updated || ''),
  };
}

// ── List images (cursor-based pagination) ──

export async function listMedia(
  apiKey: string,
  accountId: string,
  options?: { cursor?: string; limit?: number },
): Promise<MediaListResult> {
  // Check cache only for first page (no cursor)
  if (!options?.cursor) {
    const cached = getCached(accountId);
    if (cached) {
      return { files: cached };
    }
  }

  // If cursor is provided, it's the full next URL from Klaviyo
  const url = options?.cursor || `${KLAVIYO_BASE}/images/`;

  const res = await fetch(url, { headers: klaviyoHeaders(apiKey) });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg =
      (data as Record<string, unknown>)?.detail ||
      (data as Record<string, unknown>)?.message ||
      `Klaviyo API error (${res.status})`;
    throw new Error(String(msg));
  }

  const json = (await res.json()) as Record<string, unknown>;
  const items = (json.data || []) as Record<string, unknown>[];
  const files = items.map(normalizeImage);

  // Cache first page only
  if (!options?.cursor) {
    setCache(accountId, files);
  }

  const links = json.links as Record<string, string> | undefined;
  return {
    files,
    nextCursor: links?.next || undefined,
  };
}

// ── Upload image (multipart/form-data) ──

export async function uploadMedia(
  apiKey: string,
  accountId: string,
  input: MediaUploadInput,
): Promise<EspMedia> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(input.file)], { type: input.mimeType });
  formData.append('file', blob, input.name);

  const res = await fetch(`${KLAVIYO_BASE}/images/`, {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      Accept: 'application/json',
      revision: KLAVIYO_REVISION,
      // DO NOT set Content-Type — FormData sets multipart boundary automatically
    },
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const errors = (data as Record<string, unknown>)?.errors as
      | Array<Record<string, unknown>>
      | undefined;
    const msg =
      errors?.[0]?.detail ||
      (data as Record<string, unknown>)?.detail ||
      `Klaviyo API error (${res.status})`;
    throw new Error(String(msg));
  }

  const json = (await res.json()) as Record<string, unknown>;
  const raw = json.data as Record<string, unknown>;

  invalidateCache(accountId);
  return normalizeImage(raw);
}

// ── Rename image (PATCH — name only) ──

export async function renameMedia(
  apiKey: string,
  accountId: string,
  imageId: string,
  newName: string,
): Promise<EspMedia> {
  const url = `${KLAVIYO_BASE}/images/${encodeURIComponent(imageId)}/`;
  const payload = {
    data: {
      type: 'image',
      id: imageId,
      attributes: { name: newName },
    },
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...klaviyoHeaders(apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const errors = (data as Record<string, unknown>)?.errors as
      | Array<Record<string, unknown>>
      | undefined;
    const msg =
      errors?.[0]?.detail ||
      (data as Record<string, unknown>)?.detail ||
      `Klaviyo API error (${res.status})`;
    throw new Error(String(msg));
  }

  const json = (await res.json()) as Record<string, unknown>;
  const raw = json.data as Record<string, unknown>;

  invalidateCache(accountId);
  return normalizeImage(raw);
}

// Klaviyo has NO delete endpoint for images
