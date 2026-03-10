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
type ResolvedMediaObject = {
  id: string;
  kind: 'file' | 'folder';
  name: string;
  parentId: string | null;
};
type MoveStrategy = {
  label: string;
  method: 'POST' | 'PUT';
  url: string;
  body?: JsonRecord;
};
type MoveStrategyAttempt = {
  matched: boolean;
  accepted: boolean;
  fatal: boolean;
  error?: string;
};
type FetchRawMediaOptions = {
  fetchAll?: boolean;
  offset?: number;
  limit?: number;
  parentId?: string | null;
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

function extractFolderName(raw: Record<string, unknown>): string {
  return firstNonEmptyString(raw, ['name', 'title', 'displayName']) || 'Untitled folder';
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
  options?: FetchRawMediaOptions,
): Promise<JsonRecord[]> {
  const params = new URLSearchParams({
    altId: locationId,
    altType: 'location',
    type,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  if (options?.fetchAll) params.set('fetchAll', 'true');
  if (typeof options?.offset === 'number') params.set('offset', String(options.offset));
  if (typeof options?.limit === 'number') params.set('limit', String(options.limit));
  if (options?.parentId) params.set('parentId', options.parentId);

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

async function resolveMediaObject(
  token: string,
  locationId: string,
  mediaId: string,
): Promise<ResolvedMediaObject | null> {
  const fileRecords = await fetchRawMediaObjects(token, locationId, 'file', { fetchAll: true });
  const file = fileRecords.find((row) => extractMediaId(row) === mediaId);
  if (file) {
    return {
      id: extractMediaId(file) || mediaId,
      kind: 'file',
      name: extractMediaName(file),
      parentId: extractParentId(file),
    };
  }

  const folderRecords = await fetchRawMediaObjects(token, locationId, 'folder', { fetchAll: true });
  const folder = folderRecords.find((row) => extractMediaId(row) === mediaId);
  if (folder) {
    return {
      id: extractMediaId(folder) || mediaId,
      kind: 'folder',
      name: extractFolderName(folder),
      parentId: extractParentId(folder),
    };
  }

  return null;
}

async function isMediaListedUnderParent(
  token: string,
  locationId: string,
  mediaId: string,
  type: 'file' | 'folder',
  parentId: string | null,
): Promise<boolean> {
  const pageSize = 200;
  const maxPages = 20;
  let previousPageSignature = '';

  for (let page = 0; page < maxPages; page += 1) {
    const records = await fetchRawMediaObjects(token, locationId, type, {
      parentId,
      offset: page * pageSize,
      limit: pageSize,
    });
    if (records.some((row) => extractMediaId(row) === mediaId)) {
      return true;
    }
    if (records.length < pageSize) {
      return false;
    }

    const pageSignature = records
      .slice(0, 5)
      .map((row) => extractMediaId(row))
      .join(',');
    if (pageSignature && pageSignature === previousPageSignature) {
      return false;
    }
    previousPageSignature = pageSignature;
  }

  return false;
}

async function verifyMediaParent(
  token: string,
  locationId: string,
  mediaId: string,
  targetFolderId?: string,
): Promise<MediaParentVerification> {
  const target = normalizeParentId(targetFolderId);
  const media = await resolveMediaObject(token, locationId, mediaId);
  if (media) {
    if (media.parentId === target) {
      return {
        matched: true,
        found: true,
        observedParentId: media.parentId,
      };
    }

    // Some GHL tenants update direct folder listings before the flattened
    // fetchAll parent metadata catches up.
    const isListedUnderTarget = await isMediaListedUnderParent(
      token,
      locationId,
      mediaId,
      media.kind,
      target,
    );
    if (isListedUnderTarget) {
      return {
        matched: true,
        found: true,
        observedParentId: target,
      };
    }

    return {
      matched: false,
      found: true,
      observedParentId: media.parentId,
    };
  }

  const fileListedUnderTarget = await isMediaListedUnderParent(
    token,
    locationId,
    mediaId,
    'file',
    target,
  );
  if (fileListedUnderTarget) {
    return {
      matched: true,
      found: true,
      observedParentId: target,
    };
  }

  const folderListedUnderTarget = await isMediaListedUnderParent(
    token,
    locationId,
    mediaId,
    'folder',
    target,
  );
  if (folderListedUnderTarget) {
    return {
      matched: true,
      found: true,
      observedParentId: target,
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
  return (await resolveMediaObject(token, locationId, mediaId))?.name || '';
}

function throwGhlError(data: unknown, status: number): never {
  const msg =
    (data as Record<string, string>)?.message ||
    (data as Record<string, string>)?.error ||
    `GHL API error (${status})`;
  throw new Error(msg);
}

function buildMoveFieldPayload(
  locationId: string,
  targetFolderId: string | null,
): JsonRecord {
  return {
    altType: 'location',
    altId: locationId,
    locationId,
    parentId: targetFolderId,
    parentID: targetFolderId,
    folderId: targetFolderId,
    folderID: targetFolderId,
  };
}

function addMoveNameFields(body: JsonRecord, name?: string): JsonRecord {
  const resolvedName = name?.trim();
  if (!resolvedName) return body;

  body.name = resolvedName;
  // Some GHL tenants serialize this field under fileName.
  body.fileName = resolvedName;
  return body;
}

function buildMoveStrategies(
  locationId: string,
  mediaId: string,
  targetFolderId: string | null,
  name?: string,
): MoveStrategy[] {
  const encodedMediaId = encodeURIComponent(mediaId);
  const updateParams = new URLSearchParams({
    altType: 'location',
    altId: locationId,
  });
  const legacyParams = new URLSearchParams({
    altType: 'location',
    altId: locationId,
  });
  if (targetFolderId) legacyParams.set('parentId', targetFolderId);

  const singleUpdateBody = addMoveNameFields(
    buildMoveFieldPayload(locationId, targetFolderId),
    name,
  );
  const bulkBase = addMoveNameFields(
    buildMoveFieldPayload(locationId, targetFolderId),
    name,
  );

  return [
    {
      label: 'single-update-query',
      method: 'POST',
      url: `${GHL_BASE}/medias/${encodedMediaId}?${updateParams.toString()}`,
      body: singleUpdateBody,
    },
    {
      label: 'single-update-bare',
      method: 'POST',
      url: `${GHL_BASE}/medias/${encodedMediaId}`,
      body: singleUpdateBody,
    },
    {
      label: 'bulk-update-ids-put',
      method: 'PUT',
      url: `${GHL_BASE}/medias/update-files?${updateParams.toString()}`,
      body: { ...bulkBase, ids: [mediaId] },
    },
    {
      label: 'bulk-update-ids-post',
      method: 'POST',
      url: `${GHL_BASE}/medias/update-files?${updateParams.toString()}`,
      body: { ...bulkBase, ids: [mediaId] },
    },
    {
      label: 'bulk-update-fileIds-post',
      method: 'POST',
      url: `${GHL_BASE}/medias/update-files?${updateParams.toString()}`,
      body: { ...bulkBase, fileIds: [mediaId] },
    },
    {
      label: 'bulk-update-mediaIds-post',
      method: 'POST',
      url: `${GHL_BASE}/medias/update-files?${updateParams.toString()}`,
      body: { ...bulkBase, mediaIds: [mediaId] },
    },
    {
      label: 'legacy-move-put',
      method: 'PUT',
      url: `${GHL_BASE}/medias/${encodedMediaId}/move?${legacyParams.toString()}`,
    },
  ];
}

function moveResponseMatchesTargetParent(
  response: JsonRecord | null,
  mediaId: string,
  targetFolderId: string | null,
): boolean {
  if (!response || typeof response !== 'object') return false;

  const rawCandidate = (
    response.file
    ?? response.media
    ?? response.data
    ?? response
  ) as unknown;

  if (!rawCandidate || typeof rawCandidate !== 'object') return false;

  const raw = rawCandidate as JsonRecord;
  const responseId = extractMediaId(raw);
  const observedParent = extractParentId(raw);
  return (!responseId || responseId === mediaId) && observedParent === targetFolderId;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyMediaParentWithRetries(
  token: string,
  locationId: string,
  mediaId: string,
  targetFolderId: string | null,
  attempts: number,
  baseDelayMs: number,
): Promise<MediaParentVerification> {
  let verification: MediaParentVerification = {
    matched: false,
    found: false,
    observedParentId: null,
  };

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    verification = await verifyMediaParent(token, locationId, mediaId, targetFolderId || undefined);
    if (verification.matched) return verification;
    if (attempt < attempts - 1) {
      await sleep(baseDelayMs * (attempt + 1));
    }
  }

  return verification;
}

async function attemptMoveStrategy(
  token: string,
  locationId: string,
  mediaId: string,
  targetFolderId: string | null,
  strategy: MoveStrategy,
): Promise<MoveStrategyAttempt> {
  try {
    const res = await fetch(strategy.url, {
      method: strategy.method,
      headers: strategy.body
        ? {
          ...ghlHeaders(token),
          'Content-Type': 'application/json',
        }
        : ghlHeaders(token),
      body: strategy.body ? JSON.stringify(strategy.body) : undefined,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        matched: false,
        accepted: false,
        fatal: res.status === 401 || res.status === 403,
        error:
          (data as Record<string, string>)?.message ||
          (data as Record<string, string>)?.error ||
          `GHL API error (${res.status})`,
      };
    }

    const moveResponse = await res.json().catch(() => null) as JsonRecord | null;
    if (moveResponseMatchesTargetParent(moveResponse, mediaId, targetFolderId)) {
      return {
        matched: true,
        accepted: true,
        fatal: false,
      };
    }

    const verification = await verifyMediaParentWithRetries(
      token,
      locationId,
      mediaId,
      targetFolderId,
      3,
      250,
    );
    if (verification.matched) {
      return {
        matched: true,
        accepted: true,
        fatal: false,
      };
    }

    const observedLabel = verification.found
      ? (verification.observedParentId ?? 'root')
      : 'not-found';

    return {
      matched: false,
      accepted: true,
      fatal: false,
      error: `accepted but parent remained ${observedLabel}`,
    };
  } catch (error) {
    return {
      matched: false,
      accepted: false,
      fatal: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
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
  const existing = await resolveMediaObject(token, locationId, mediaId);
  if (existing && existing.parentId === normalizedTarget) {
    invalidateAllCaches(locationId);
    return;
  }

  const resolvedName = name?.trim() || existing?.name || (await resolveMediaName(token, locationId, mediaId));
  const strategies = buildMoveStrategies(locationId, mediaId, normalizedTarget, resolvedName);
  const failures: string[] = [];
  let acceptedAny = false;

  for (const strategy of strategies) {
    const result = await attemptMoveStrategy(
      token,
      locationId,
      mediaId,
      normalizedTarget,
      strategy,
    );

    if (result.matched) {
      invalidateAllCaches(locationId);
      return;
    }

    if (result.accepted) acceptedAny = true;
    if (result.error) failures.push(`${strategy.label}: ${result.error}`);
    if (result.fatal) break;
  }

  const verification = await verifyMediaParentWithRetries(
    token,
    locationId,
    mediaId,
    normalizedTarget,
    6,
    300,
  );
  if (verification.matched) {
    invalidateAllCaches(locationId);
    return;
  }

  const targetLabel = normalizedTarget ?? 'root';
  const observedLabel = verification.found
    ? (verification.observedParentId ?? 'root')
    : 'not-found';

  console.error('[ghl-media] Failed to move media after all strategies', {
    locationId,
    mediaId,
    targetFolderId: normalizedTarget,
    observedParentId: verification.observedParentId,
    failures,
  });

  if (acceptedAny) {
    throw new Error(
      `Move request was accepted but the file/folder parent did not change (target: ${targetLabel}, observed: ${observedLabel})`,
    );
  }

  throw new Error(failures[0] || 'Failed to move media');
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
