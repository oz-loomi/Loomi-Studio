// ── GHL Media Files ──
// List, upload, delete media + folder navigation via the GHL public API.

import { GHL_BASE, API_VERSION } from './constants';
import type {
  EspMedia,
  EspMediaFolder,
  MediaListResult,
  MediaFolderListResult,
  MediaUploadInput,
  CreateMediaFolderInput,
} from '../../types';

// ── In-memory cache (5 min TTL, same pattern as templates) ──

const CACHE_TTL_MS = 5 * 60 * 1000;
type JsonRecord = Record<string, unknown>;
type MediaParentVerification = {
  matched: boolean;
  found: boolean;
  observedParentId: string | null;
};

// File cache — keyed by locationId + parentId
const mediaCache = new Map<string, { data: EspMedia[]; fetchedAt: number }>();

function fileCacheKey(locationId: string, parentId?: string): string {
  return `ghl-media:${locationId}:${parentId || 'root'}`;
}

function getCachedFiles(locationId: string, parentId?: string): EspMedia[] | null {
  const entry = mediaCache.get(fileCacheKey(locationId, parentId));
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    mediaCache.delete(fileCacheKey(locationId, parentId));
    return null;
  }
  return entry.data;
}

function setCacheFiles(locationId: string, data: EspMedia[], parentId?: string): void {
  mediaCache.set(fileCacheKey(locationId, parentId), { data, fetchedAt: Date.now() });
}

// Folder cache — keyed by locationId + parentId
const folderCache = new Map<string, { data: EspMediaFolder[]; fetchedAt: number }>();

function folderCacheKey(locationId: string, parentId?: string): string {
  return `ghl-folders:${locationId}:${parentId || 'root'}`;
}

function getCachedFolders(locationId: string, parentId?: string): EspMediaFolder[] | null {
  const entry = folderCache.get(folderCacheKey(locationId, parentId));
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    folderCache.delete(folderCacheKey(locationId, parentId));
    return null;
  }
  return entry.data;
}

function setCacheFolders(locationId: string, data: EspMediaFolder[], parentId?: string): void {
  folderCache.set(folderCacheKey(locationId, parentId), { data, fetchedAt: Date.now() });
}

/** Invalidate all file + folder cache entries for a location. */
function invalidateAllCaches(locationId: string): void {
  const prefix = `ghl-media:${locationId}:`;
  for (const key of mediaCache.keys()) {
    if (key.startsWith(prefix)) mediaCache.delete(key);
  }
  const folderPrefix = `ghl-folders:${locationId}:`;
  for (const key of folderCache.keys()) {
    if (key.startsWith(folderPrefix)) folderCache.delete(key);
  }
}

// ── Helpers ──

function ghlHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Version: API_VERSION,
    Accept: 'application/json',
  };
}

function firstNonEmptyString(
  raw: Record<string, unknown>,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return '';
}

function inferNameFromUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop() || '';
    if (!lastSegment) return '';
    return decodeURIComponent(lastSegment);
  } catch {
    const cleaned = trimmed.split('?')[0].split('#')[0];
    const lastSegment = cleaned.split('/').filter(Boolean).pop() || '';
    if (!lastSegment) return '';
    try {
      return decodeURIComponent(lastSegment);
    } catch {
      return lastSegment;
    }
  }
}

function extractMediaName(raw: Record<string, unknown>): string {
  const explicit = firstNonEmptyString(raw, [
    'name',
    'fileName',
    'filename',
    'originalFileName',
    'originalFilename',
    'displayName',
    'title',
  ]);
  if (explicit) return explicit;

  const fromUrl = inferNameFromUrl(firstNonEmptyString(raw, ['url', 'fileUrl', 'src']));
  if (fromUrl) return fromUrl;

  return 'Untitled file';
}

function normalizeFile(raw: Record<string, unknown>): EspMedia {
  // GHL uses MongoDB _id — raw.altId is the LOCATION id, never the file id
  const resolvedUrl = firstNonEmptyString(raw, ['url', 'fileUrl', 'src']);
  return {
    id: firstNonEmptyString(raw, ['id', '_id', 'mediaId', 'fileId']),
    name: extractMediaName(raw),
    url: resolvedUrl,
    type: firstNonEmptyString(raw, ['type', 'mimeType', 'contentType']) || 'image',
    thumbnailUrl: firstNonEmptyString(raw, ['thumbnailUrl', 'thumbUrl', 'url', 'fileUrl']) || resolvedUrl,
    createdAt: firstNonEmptyString(raw, ['createdAt', 'dateAdded']),
    updatedAt: firstNonEmptyString(raw, ['updatedAt', 'lastUpdated']),
  };
}

function normalizeFolder(raw: Record<string, unknown>): EspMediaFolder {
  return {
    id: String(raw.id || raw._id || ''),
    name: String(raw.name || ''),
    parentId: raw.parentId ? String(raw.parentId) : undefined,
    createdAt: String(raw.createdAt || ''),
    updatedAt: String(raw.updatedAt || ''),
  };
}

function normalizeParentId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === 'null' || lower === 'root') return null;
  return raw;
}

function extractParentId(raw: JsonRecord): string | null {
  return normalizeParentId(
    raw.parentId
    ?? raw.parentID
    ?? raw.folderId
    ?? raw.folderID
    ?? null,
  );
}

function extractMediaId(raw: JsonRecord): string {
  return firstNonEmptyString(raw, ['id', '_id', 'mediaId', 'fileId']);
}

async function fetchRawMediaObjects(
  token: string,
  locationId: string,
  type: 'file' | 'folder',
): Promise<JsonRecord[]> {
  const params = new URLSearchParams({
    altId: locationId,
    altType: 'location',
    type,
    fetchAll: 'true',
  });
  const res = await fetch(`${GHL_BASE}/medias/files?${params.toString()}`, {
    headers: ghlHeaders(token),
  });
  if (!res.ok) return [];

  const data = await res.json().catch(() => ({}));
  const list = (data as { files?: unknown }).files;
  if (!Array.isArray(list)) return [];

  return list
    .filter((entry): entry is JsonRecord => Boolean(entry && typeof entry === 'object'))
    .map((entry) => entry as JsonRecord);
}

async function verifyMediaParent(
  token: string,
  locationId: string,
  mediaId: string,
  targetFolderId?: string,
): Promise<MediaParentVerification> {
  const target = normalizeParentId(targetFolderId);

  const fileRecords = await fetchRawMediaObjects(token, locationId, 'file');
  const file = fileRecords.find((row) => extractMediaId(row) === mediaId);
  if (file) {
    const observedParentId = extractParentId(file);
    return {
      matched: observedParentId === target,
      found: true,
      observedParentId,
    };
  }

  const folderRecords = await fetchRawMediaObjects(token, locationId, 'folder');
  const folder = folderRecords.find((row) => extractMediaId(row) === mediaId);
  if (folder) {
    const observedParentId = extractParentId(folder);
    return {
      matched: observedParentId === target,
      found: true,
      observedParentId,
    };
  }

  return {
    matched: false,
    found: false,
    observedParentId: null,
  };
}

async function resolveMediaName(
  token: string,
  locationId: string,
  mediaId: string,
): Promise<string> {
  const fileRecords = await fetchRawMediaObjects(token, locationId, 'file');
  const file = fileRecords.find((row) => extractMediaId(row) === mediaId);
  if (file) return extractMediaName(file);

  const folderRecords = await fetchRawMediaObjects(token, locationId, 'folder');
  const folder = folderRecords.find((row) => extractMediaId(row) === mediaId);
  if (folder) {
    return firstNonEmptyString(folder, ['name', 'title', 'displayName']);
  }

  return '';
}

function throwGhlError(data: unknown, status: number): never {
  const msg =
    (data as Record<string, string>)?.message ||
    (data as Record<string, string>)?.error ||
    `GHL API error (${status})`;
  throw new Error(msg);
}

// ── List media files (offset-based pagination) ──

export async function listMedia(
  token: string,
  locationId: string,
  options?: { cursor?: string; limit?: number; parentId?: string; fetchAll?: boolean },
): Promise<MediaListResult> {
  const parentId = options?.parentId;

  // fetchAll mode: return ALL files across all folders (for total count)
  if (options?.fetchAll) {
    const params = new URLSearchParams({
      altId: locationId,
      altType: 'location',
      type: 'file',
      sortBy: 'createdAt',
      sortOrder: 'desc',
      fetchAll: 'true',
    });

    const res = await fetch(`${GHL_BASE}/medias/files?${params.toString()}`, {
      headers: ghlHeaders(token),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throwGhlError(data, res.status);
    }

    const data = await res.json();
    const rawFiles: Record<string, unknown>[] =
      ((data as Record<string, unknown>)?.files as Record<string, unknown>[]) ?? [];

    return { files: rawFiles.map(normalizeFile), total: rawFiles.length };
  }

  // Check cache only for first page (no cursor)
  if (!options?.cursor) {
    const cached = getCachedFiles(locationId, parentId);
    if (cached) {
      return { files: cached };
    }
  }

  const offset = options?.cursor ? Number(options.cursor) : 0;
  const limit = options?.limit || 50;

  const params = new URLSearchParams({
    altId: locationId,
    altType: 'location',
    type: 'file',
    offset: String(offset),
    limit: String(limit),
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  if (parentId) params.set('parentId', parentId);

  const res = await fetch(`${GHL_BASE}/medias/files?${params.toString()}`, {
    headers: ghlHeaders(token),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throwGhlError(data, res.status);
  }

  const data = await res.json();
  const rawFiles: Record<string, unknown>[] =
    ((data as Record<string, unknown>)?.files as Record<string, unknown>[]) ?? [];

  const files = rawFiles.map(normalizeFile);

  // Cache first page only
  if (!options?.cursor) {
    setCacheFiles(locationId, files, parentId);
  }

  const nextOffset = offset + files.length;
  return {
    files,
    nextCursor: files.length === limit ? String(nextOffset) : undefined,
  };
}

// ── List folders ──

export async function listFolders(
  token: string,
  locationId: string,
  parentId?: string,
): Promise<MediaFolderListResult> {
  const cached = getCachedFolders(locationId, parentId);
  if (cached) return { folders: cached };

  const params = new URLSearchParams({
    altId: locationId,
    altType: 'location',
    type: 'folder',
    sortBy: 'createdAt',
    sortOrder: 'desc',
    fetchAll: 'true',
  });
  if (parentId) params.set('parentId', parentId);

  const res = await fetch(`${GHL_BASE}/medias/files?${params.toString()}`, {
    headers: ghlHeaders(token),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throwGhlError(data, res.status);
  }

  const data = await res.json();
  const rawFolders: Record<string, unknown>[] =
    ((data as Record<string, unknown>)?.files as Record<string, unknown>[]) ?? [];

  const allFolders = rawFolders
    .filter((f) => !f.deleted)
    .map(normalizeFolder);

  // GHL with fetchAll=true returns ALL folders flat — filter to only
  // direct children of the requested parent.
  const folders = allFolders.filter((f) =>
    parentId ? f.parentId === parentId : !f.parentId,
  );

  setCacheFolders(locationId, folders, parentId);

  return { folders };
}

// ── Create folder ──

export async function createFolder(
  token: string,
  locationId: string,
  input: CreateMediaFolderInput,
): Promise<EspMediaFolder> {
  const body: Record<string, string> = {
    altId: locationId,
    altType: 'location',
    name: input.name,
  };
  if (input.parentId) body.parentId = input.parentId;

  const res = await fetch(`${GHL_BASE}/medias/folder`, {
    method: 'POST',
    headers: {
      ...ghlHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throwGhlError(data, res.status);
  }

  const data = await res.json();
  invalidateAllCaches(locationId);

  return normalizeFolder(data as Record<string, unknown>);
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
  if (input.parentId) {
    formData.append('parentId', input.parentId);
  }

  const res = await fetch(`${GHL_BASE}/medias/upload-file`, {
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
    throwGhlError(data, res.status);
  }

  const data = await res.json();
  const raw = ((data as Record<string, unknown>)?.file || data) as Record<string, unknown>;

  invalidateAllCaches(locationId);

  const normalized = normalizeFile(raw);
  if (!normalized.name || normalized.name === 'Untitled file') {
    normalized.name = input.name;
  }
  return normalized;
}

// ── Move media / folder (change parent folder) ──

export async function moveMedia(
  token: string,
  locationId: string,
  mediaId: string,
  targetFolderId?: string,
  name?: string,
): Promise<void> {
  const normalizedTarget = normalizeParentId(targetFolderId);
  const resolvedName = name?.trim() || (await resolveMediaName(token, locationId, mediaId));
  const body: Record<string, string | null> = {
    altType: 'location',
    altId: locationId,
    locationId,
    parentId: normalizedTarget,
    parentID: normalizedTarget,
    folderId: normalizedTarget,
    folderID: normalizedTarget,
  };
  if (resolvedName) {
    body.name = resolvedName;
    // Some GHL tenants serialize this field under fileName.
    body.fileName = resolvedName;
  }
  const params = new URLSearchParams({
    altType: 'location',
    altId: locationId,
  });

  const res = await fetch(
    `${GHL_BASE}/medias/${encodeURIComponent(mediaId)}?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        ...ghlHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throwGhlError(data, res.status);
  }

  const moveResponse = await res.json().catch(() => null) as JsonRecord | null;
  if (moveResponse && typeof moveResponse === 'object') {
    const rawCandidate = (
      moveResponse.file
      ?? moveResponse.media
      ?? moveResponse.data
      ?? moveResponse
    ) as unknown;
    if (rawCandidate && typeof rawCandidate === 'object') {
      const raw = rawCandidate as JsonRecord;
      const responseId = extractMediaId(raw);
      const observedParent = extractParentId(raw);
      if ((!responseId || responseId === mediaId) && observedParent === normalizedTarget) {
        invalidateAllCaches(locationId);
        return;
      }
    }
  }

  // Defensive verification with retries: GHL can be eventually consistent.
  let verification: MediaParentVerification = {
    matched: false,
    found: false,
    observedParentId: null,
  };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    verification = await verifyMediaParent(token, locationId, mediaId, normalizedTarget || undefined);
    if (verification.matched) break;
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  if (!verification.matched) {
    const targetLabel = normalizedTarget ?? 'root';
    const observedLabel = verification.found
      ? (verification.observedParentId ?? 'root')
      : 'not-found';
    throw new Error(
      `Move request was accepted but the file/folder parent did not change (target: ${targetLabel}, observed: ${observedLabel})`,
    );
  }

  invalidateAllCaches(locationId);
}

// ── Delete media ──

export async function deleteMedia(
  token: string,
  locationId: string,
  mediaId: string,
): Promise<void> {
  const params = new URLSearchParams({
    altType: 'location',
    altId: locationId,
  });

  const res = await fetch(
    `${GHL_BASE}/medias/${encodeURIComponent(mediaId)}?${params.toString()}`,
    { method: 'DELETE', headers: ghlHeaders(token) },
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throwGhlError(data, res.status);
  }

  invalidateAllCaches(locationId);
}
