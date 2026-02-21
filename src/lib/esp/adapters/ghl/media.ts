// ── GHL Media Files ──
// List, upload, and delete media via the GHL public API.

import { GHL_BASE, API_VERSION } from './constants';
import type { EspMedia, MediaListResult, MediaUploadInput } from '../../types';

// ── In-memory cache (5 min TTL, same pattern as templates) ──

const mediaCache = new Map<string, { data: EspMedia[]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(locationId: string): string {
  return `ghl-media:${locationId}`;
}

function getCached(locationId: string): EspMedia[] | null {
  const entry = mediaCache.get(cacheKey(locationId));
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    mediaCache.delete(cacheKey(locationId));
    return null;
  }
  return entry.data;
}

function setCache(locationId: string, data: EspMedia[]): void {
  mediaCache.set(cacheKey(locationId), { data, fetchedAt: Date.now() });
}

function invalidateCache(locationId: string): void {
  mediaCache.delete(cacheKey(locationId));
}

// ── Helpers ──

function ghlHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Version: API_VERSION,
    Accept: 'application/json',
  };
}

function normalizeFile(raw: Record<string, unknown>): EspMedia {
  return {
    id: String(raw.id || raw.altId || ''),
    name: String(raw.name || ''),
    url: String(raw.url || ''),
    type: String(raw.type || 'image'),
    thumbnailUrl: String(raw.url || ''),
    createdAt: String(raw.createdAt || ''),
    updatedAt: String(raw.updatedAt || ''),
  };
}

// ── List media files (offset-based pagination) ──

export async function listMedia(
  token: string,
  locationId: string,
  options?: { cursor?: string; limit?: number },
): Promise<MediaListResult> {
  // Check cache only for first page (no cursor)
  if (!options?.cursor) {
    const cached = getCached(locationId);
    if (cached) {
      return { files: cached };
    }
  }

  const offset = options?.cursor ? Number(options.cursor) : 0;
  const limit = options?.limit || 50;
  const url = `${GHL_BASE}/medias/files?locationId=${encodeURIComponent(locationId)}&offset=${offset}&limit=${limit}`;

  const res = await fetch(url, { headers: ghlHeaders(token) });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg =
      (data as Record<string, string>)?.message ||
      (data as Record<string, string>)?.error ||
      `GHL API error (${res.status})`;
    throw new Error(msg);
  }

  const data = await res.json();
  const rawFiles: Record<string, unknown>[] =
    ((data as Record<string, unknown>)?.files as Record<string, unknown>[]) ?? [];

  const files = rawFiles.map(normalizeFile);

  // Cache first page only
  if (!options?.cursor) {
    setCache(locationId, files);
  }

  const nextOffset = offset + files.length;
  return {
    files,
    nextCursor: files.length === limit ? String(nextOffset) : undefined,
  };
}

// ── Upload media (multipart/form-data) ──

export async function uploadMedia(
  token: string,
  locationId: string,
  input: MediaUploadInput,
): Promise<EspMedia> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(input.file)], { type: input.mimeType });
  formData.append('file', blob, input.name);
  formData.append('name', input.name);
  formData.append('locationId', locationId);

  const res = await fetch(`${GHL_BASE}/medias/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Version: API_VERSION,
      // DO NOT set Content-Type — FormData sets multipart boundary automatically
    },
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg =
      (data as Record<string, string>)?.message ||
      (data as Record<string, string>)?.error ||
      `GHL API error (${res.status})`;
    throw new Error(msg);
  }

  const data = await res.json();
  const raw = ((data as Record<string, unknown>)?.file || data) as Record<string, unknown>;

  invalidateCache(locationId);

  return normalizeFile(raw);
}

// ── Delete media ──

export async function deleteMedia(
  token: string,
  _locationId: string,
  mediaId: string,
): Promise<void> {
  const res = await fetch(`${GHL_BASE}/medias/${encodeURIComponent(mediaId)}`, {
    method: 'DELETE',
    headers: ghlHeaders(token),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg =
      (data as Record<string, string>)?.message ||
      (data as Record<string, string>)?.error ||
      `GHL API error (${res.status})`;
    throw new Error(msg);
  }

  invalidateCache(_locationId);
}
