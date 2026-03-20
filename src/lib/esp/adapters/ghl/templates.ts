// ── GHL Email Templates ──
// CRUD operations for GoHighLevel email templates via the public API.

import { GHL_BASE, API_VERSION } from './constants';
import type { EspEmailTemplate, CreateEspTemplateInput, UpdateEspTemplateInput } from '../../types';

// ── GHL Template Folder (remote) ──

export interface GhlTemplateFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── In-memory cache (5 min TTL, same pattern as campaigns) ──

const templateCache = new Map<string, { data: EspEmailTemplate[]; fetchedAt: number }>();
const folderCache = new Map<string, { data: GhlTemplateFolder[]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const TEMPLATE_PAGE_SIZE = 100;
const MAX_TEMPLATE_PAGES = 50;

type JsonRecord = Record<string, unknown>;

function cacheKey(locationId: string): string {
  return `ghl:${locationId}`;
}

function getCached(locationId: string): EspEmailTemplate[] | null {
  const entry = templateCache.get(cacheKey(locationId));
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    templateCache.delete(cacheKey(locationId));
    return null;
  }
  return entry.data;
}

function setCache(locationId: string, data: EspEmailTemplate[]): void {
  templateCache.set(cacheKey(locationId), { data, fetchedAt: Date.now() });
}

function invalidateCache(locationId: string): void {
  templateCache.delete(cacheKey(locationId));
  folderCache.delete(cacheKey(locationId));
}

// ── Helpers ──

function ghlHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Version: API_VERSION,
    Accept: 'application/json',
  };
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function asRecordArray(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asRecord(item))
    .filter((item): item is JsonRecord => Boolean(item));
}

function extractTemplateRows(payload: JsonRecord): JsonRecord[] {
  const data = asRecord(payload.data);
  const templatesObj = asRecord(payload.templates);
  const candidates: unknown[] = [
    payload.templates,
    data?.templates,
    templatesObj?.items,
    payload.items,
    data?.items,
    payload.results,
    data?.results,
    payload.data,
  ];

  for (const candidate of candidates) {
    const rows = asRecordArray(candidate);
    if (rows.length > 0) return rows;
  }

  return [];
}

function extractNextPageUrl(payload: JsonRecord): string | null {
  const meta = asRecord(payload.meta);
  const pagination = asRecord(payload.pagination);
  const links = asRecord(payload.links);

  const candidates: unknown[] = [
    payload.nextPageUrl,
    payload.nextPage,
    meta?.nextPageUrl,
    meta?.nextPage,
    pagination?.nextPageUrl,
    pagination?.nextPage,
    links?.next,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function toAbsoluteUrl(nextUrl: string): string {
  if (nextUrl.startsWith('http://') || nextUrl.startsWith('https://')) return nextUrl;
  if (nextUrl.startsWith('/')) return `${GHL_BASE}${nextUrl}`;
  return `${GHL_BASE}/${nextUrl.replace(/^\/+/, '')}`;
}

function extractBuilderRows(payload: JsonRecord): JsonRecord[] {
  const data = asRecord(payload.data);
  const candidates: unknown[] = [
    payload.builders,
    data?.builders,
    payload.items,
    data?.items,
    payload.results,
    data?.results,
  ];

  for (const candidate of candidates) {
    const rows = asRecordArray(candidate);
    if (rows.length > 0) return rows;
  }

  return [];
}

function extractBuilderTotal(payload: JsonRecord): number | null {
  const data = asRecord(payload.data);
  const totalCandidate = payload.total ?? data?.total;

  if (typeof totalCandidate === 'number' && Number.isFinite(totalCandidate) && totalCandidate >= 0) {
    return Math.floor(totalCandidate);
  }

  const totalRecord = asRecord(totalCandidate);
  if (totalRecord) {
    const nestedValue = Number(totalRecord.total);
    if (Number.isFinite(nestedValue) && nestedValue >= 0) {
      return Math.floor(nestedValue);
    }
  }

  if (Array.isArray(totalCandidate) && totalCandidate.length > 0) {
    const first = asRecord(totalCandidate[0]);
    if (first) {
      const nestedValue = Number(first.total);
      if (Number.isFinite(nestedValue) && nestedValue >= 0) {
        return Math.floor(nestedValue);
      }
    }
  }

  return null;
}

// ── Folder detection ──

function isGhlFolder(row: JsonRecord): boolean {
  const type = String(row.type || '').toLowerCase();
  const templateType = String(row.templateType || '').toLowerCase();
  return type === 'folder' || templateType === 'folder';
}

function toGhlFolder(row: JsonRecord): GhlTemplateFolder {
  return {
    id: String(row.id || row._id || ''),
    name: String(row.name || ''),
    parentId: typeof row.parentId === 'string' && row.parentId ? row.parentId : null,
    createdAt: String(row.dateAdded || row.createdAt || ''),
    updatedAt: String(row.dateUpdated || row.updatedAt || ''),
  };
}

// ── Template mapping ──

function toEspTemplate(t: JsonRecord): EspEmailTemplate {
  return {
    id: String(t.id || t._id || ''),
    name: String(t.name || ''),
    subject: '',
    previewText: '',
    html: String(t.html || ''),
    status: 'active',
    editorType: String(t.templateType || t.type || 'code'),
    thumbnailUrl: String(t.previewUrl || t.thumbnailUrl || ''),
    createdAt: String(t.dateAdded || t.createdAt || ''),
    updatedAt: String(t.dateUpdated || t.updatedAt || ''),
    parentId: typeof t.parentId === 'string' && t.parentId ? t.parentId : undefined,
  };
}

// ── Location endpoint fetch (templates + folder detection) ──

interface LocationEndpointResult {
  templates: EspEmailTemplate[];
  folders: GhlTemplateFolder[];
}

async function fetchFromLocationEndpoint(
  token: string,
  locationId: string,
  options?: { parentId?: string },
): Promise<LocationEndpointResult> {
  const templatesById = new Map<string, EspEmailTemplate>();
  const foldersById = new Map<string, GhlTemplateFolder>();

  const baseParams = new URLSearchParams({ type: 'email', limit: String(TEMPLATE_PAGE_SIZE) });
  if (options?.parentId) baseParams.set('parentId', options.parentId);

  let nextUrl: string | null =
    `${GHL_BASE}/locations/${encodeURIComponent(locationId)}/templates?${baseParams.toString()}`;
  const seenUrls = new Set<string>();

  for (let page = 0; page < MAX_TEMPLATE_PAGES && nextUrl; page += 1) {
    const requestUrl = toAbsoluteUrl(nextUrl);
    if (seenUrls.has(requestUrl)) break;
    seenUrls.add(requestUrl);

    const res = await fetch(requestUrl, { headers: ghlHeaders(token) });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = (data as Record<string, string>)?.message
        || (data as Record<string, string>)?.error
        || `GHL API error (${res.status})`;
      throw new Error(msg);
    }

    const payload = asRecord(await res.json()) ?? {};
    const rows = extractTemplateRows(payload);

    const countBefore = templatesById.size;
    for (const row of rows) {
      if (isGhlFolder(row)) {
        const folder = toGhlFolder(row);
        if (folder.id) foldersById.set(folder.id, folder);
        continue;
      }
      const template = toEspTemplate(row);
      if (!template.id) continue;
      templatesById.set(template.id, template);
    }
    const addedOnThisPage = templatesById.size - countBefore;

    const explicitNext = extractNextPageUrl(payload);
    if (explicitNext) {
      nextUrl = explicitNext;
      continue;
    }

    // Fallback for offset-style pagination if no explicit next link is provided.
    if (rows.length >= TEMPLATE_PAGE_SIZE) {
      if (addedOnThisPage === 0) break;
      const parsed = new URL(requestUrl);
      const currentOffset = Number(parsed.searchParams.get('offset') || '0');
      const nextOffset = currentOffset + rows.length;
      parsed.searchParams.set('limit', String(TEMPLATE_PAGE_SIZE));
      parsed.searchParams.set('offset', String(nextOffset));
      nextUrl = parsed.toString();
      continue;
    }

    nextUrl = null;
  }

  return {
    templates: Array.from(templatesById.values()),
    folders: Array.from(foldersById.values()),
  };
}

async function fetchTemplatesFromBuilderEndpoint(
  token: string,
  locationId: string,
): Promise<EspEmailTemplate[]> {
  const templatesById = new Map<string, EspEmailTemplate>();
  let offset = 0;
  let total: number | null = null;

  for (let page = 0; page < MAX_TEMPLATE_PAGES; page += 1) {
    const params = new URLSearchParams({
      locationId,
      limit: String(TEMPLATE_PAGE_SIZE),
      offset: String(offset),
    });

    const res = await fetch(`${GHL_BASE}/emails/builder?${params.toString()}`, {
      headers: ghlHeaders(token),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = (data as Record<string, string>)?.message
        || (data as Record<string, string>)?.error
        || `GHL API error (${res.status})`;
      throw new Error(msg);
    }

    const payload = asRecord(await res.json()) ?? {};
    const rows = extractBuilderRows(payload);
    const nextTotal = extractBuilderTotal(payload);
    if (nextTotal !== null) total = nextTotal;

    if (rows.length === 0) break;

    for (const row of rows) {
      if (isGhlFolder(row)) continue;
      const template = toEspTemplate(row);
      if (!template.id) continue;
      templatesById.set(template.id, template);
    }

    if (rows.length < TEMPLATE_PAGE_SIZE) break;
    if (total !== null && templatesById.size >= total) break;

    offset += rows.length;
  }

  return Array.from(templatesById.values());
}

// ── Fetch all templates for a location ──

export async function fetchTemplates(
  token: string,
  locationId: string,
  options?: { forceRefresh?: boolean },
): Promise<EspEmailTemplate[]> {
  if (!options?.forceRefresh) {
    const cached = getCached(locationId);
    if (cached) return cached;
  }

  let locationResult: LocationEndpointResult | null = null;
  let builderTemplates: EspEmailTemplate[] = [];
  let locationError: Error | null = null;
  let builderError: Error | null = null;

  try {
    locationResult = await fetchFromLocationEndpoint(token, locationId);
  } catch (err) {
    locationError = err instanceof Error ? err : new Error(String(err));
  }

  try {
    builderTemplates = await fetchTemplatesFromBuilderEndpoint(token, locationId);
  } catch (err) {
    builderError = err instanceof Error ? err : new Error(String(err));
  }

  // Collect folder IDs from the location endpoint so we can exclude them
  // from builder results (the builder endpoint returns folders as templates
  // without a distinguishing type field).
  const folderIds = new Set(
    (locationResult?.folders ?? []).map((f) => f.id).filter(Boolean),
  );

  const templatesById = new Map<string, EspEmailTemplate>();
  const allTemplates = [...(locationResult?.templates ?? []), ...builderTemplates];
  for (const template of allTemplates) {
    if (!template.id) continue;
    if (folderIds.has(template.id)) continue;
    templatesById.set(template.id, template);
  }
  const templates = Array.from(templatesById.values());

  if (templates.length === 0 && locationError && builderError) {
    throw new Error(
      `Failed to fetch templates from GHL (locations endpoint: ${locationError.message}; builder endpoint: ${builderError.message})`,
    );
  }

  setCache(locationId, templates);
  return templates;
}

// ── Fetch single template by ID ──

export async function fetchTemplateById(
  token: string,
  locationId: string,
  templateId: string,
): Promise<EspEmailTemplate | null> {
  const url = `${GHL_BASE}/emails/builder?locationId=${encodeURIComponent(locationId)}&templateId=${encodeURIComponent(templateId)}`;
  const res = await fetch(url, { headers: ghlHeaders(token) });

  if (!res.ok) {
    if (res.status === 404) return null;
    const data = await res.json().catch(() => ({}));
    const msg = (data as Record<string, string>)?.message
      || (data as Record<string, string>)?.error
      || `GHL API error (${res.status})`;
    throw new Error(msg);
  }

  const data = await res.json();
  const t = (data as Record<string, unknown>)?.template || data;
  const raw = t as Record<string, unknown>;

  return {
    id: String(raw.id || raw._id || templateId),
    name: String(raw.name || ''),
    subject: '',
    previewText: '',
    html: String(raw.html || ''),
    status: 'active',
    editorType: String(raw.templateType || raw.type || 'code'),
    thumbnailUrl: String(raw.previewUrl || raw.thumbnailUrl || ''),
    createdAt: String(raw.dateAdded || raw.createdAt || ''),
    updatedAt: String(raw.dateUpdated || raw.updatedAt || ''),
  };
}

// ── Create template ──
//
// GHL's POST /emails/builder creates a shell template that ignores `name` and
// `html` in the request body.  We work around this by creating the shell first,
// then immediately pushing the real name + HTML via the PATCH update endpoint.

export async function createTemplate(
  token: string,
  locationId: string,
  input: CreateEspTemplateInput,
): Promise<EspEmailTemplate> {
  // Step 1 — create the shell template
  const createUrl = `${GHL_BASE}/emails/builder`;
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: ghlHeaders(token),
    body: JSON.stringify({
      locationId,
      name: input.name,
      type: 'html',
    }),
  });

  if (!createRes.ok) {
    const data = await createRes.json().catch(() => ({}));
    const msg = (data as Record<string, string>)?.message
      || (data as Record<string, string>)?.error
      || `GHL API error (${createRes.status})`;
    throw new Error(msg);
  }

  const createData = await createRes.json();
  const raw = ((createData as Record<string, unknown>)?.template || createData) as Record<string, unknown>;
  const templateId = String(raw.id || raw._id || '');

  if (!templateId) {
    throw new Error('GHL did not return a template ID after creation');
  }

  // Step 2 — push the real name + HTML via the PATCH endpoint
  // Uses PATCH /emails/builder/{templateId} (the current GHL v2 endpoint)
  const patchUrl = `${GHL_BASE}/emails/builder/${encodeURIComponent(templateId)}`;
  const patchBody: Record<string, unknown> = { locationId };
  if (input.name) patchBody.name = input.name;
  if (input.html) {
    patchBody.html = input.html;
    // Also send in the newer editorType/editorContent format for compatibility
    patchBody.editorType = 'html';
    patchBody.editorContent = input.html;
  }

  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers: ghlHeaders(token),
    body: JSON.stringify(patchBody),
  });

  if (!patchRes.ok) {
    // Try the legacy POST /emails/builder/data endpoint as fallback
    const legacyBody: Record<string, unknown> = { locationId, templateId };
    if (input.name) legacyBody.name = input.name;
    if (input.html) legacyBody.html = input.html;

    const legacyRes = await fetch(`${GHL_BASE}/emails/builder/data`, {
      method: 'POST',
      headers: ghlHeaders(token),
      body: JSON.stringify(legacyBody),
    });

    if (!legacyRes.ok) {
      const errData = await legacyRes.json().catch(() => ({}));
      const errMsg = (errData as Record<string, string>)?.message
        || (errData as Record<string, string>)?.error
        || `Failed to push name/HTML to GHL template (${legacyRes.status})`;
      throw new Error(errMsg);
    }
  }

  invalidateCache(locationId);

  // Re-fetch the template to get the actual state after update
  const final = await fetchTemplateById(token, locationId, templateId);
  if (final) {
    return {
      ...final,
      subject: input.subject || '',
      previewText: input.previewText || '',
    };
  }

  return {
    id: templateId,
    name: input.name || '',
    subject: input.subject || '',
    previewText: input.previewText || '',
    html: input.html || '',
    status: 'active',
    editorType: 'code',
    thumbnailUrl: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Update template ──
//
// Uses PATCH /emails/builder/{templateId} (GHL v2 endpoint).
// Falls back to legacy POST /emails/builder/data if PATCH is not supported.

export async function updateTemplate(
  token: string,
  locationId: string,
  templateId: string,
  input: UpdateEspTemplateInput,
): Promise<EspEmailTemplate> {
  const patchUrl = `${GHL_BASE}/emails/builder/${encodeURIComponent(templateId)}`;
  const patchBody: Record<string, unknown> = { locationId };
  if (input.name !== undefined) patchBody.name = input.name;
  if (input.html !== undefined) {
    patchBody.html = input.html;
    patchBody.editorType = 'html';
    patchBody.editorContent = input.html;
  }

  const res = await fetch(patchUrl, {
    method: 'PATCH',
    headers: ghlHeaders(token),
    body: JSON.stringify(patchBody),
  });

  if (!res.ok) {
    // Fallback to legacy endpoint
    const legacyBody: Record<string, unknown> = { locationId, templateId };
    if (input.name !== undefined) legacyBody.name = input.name;
    if (input.html !== undefined) legacyBody.html = input.html;

    const legacyRes = await fetch(`${GHL_BASE}/emails/builder/data`, {
      method: 'POST',
      headers: ghlHeaders(token),
      body: JSON.stringify(legacyBody),
    });

    if (!legacyRes.ok) {
      const data = await legacyRes.json().catch(() => ({}));
      const msg = (data as Record<string, string>)?.message
        || (data as Record<string, string>)?.error
        || `GHL API error (${legacyRes.status})`;
      throw new Error(msg);
    }
  }

  invalidateCache(locationId);

  // GHL update response may not return the full template, so refetch.
  const updated = await fetchTemplateById(token, locationId, templateId);
  if (!updated) {
    return {
      id: templateId,
      name: input.name || '',
      subject: input.subject || '',
      previewText: input.previewText || '',
      html: input.html || '',
      status: 'active',
      updatedAt: new Date().toISOString(),
    };
  }
  return updated;
}

// ── Delete template ──
//
// Uses DELETE /locations/{locationId}/templates/{templateId} (GHL v2 endpoint).

export async function deleteTemplate(
  token: string,
  locationId: string,
  templateId: string,
): Promise<void> {
  const url = `${GHL_BASE}/locations/${encodeURIComponent(locationId)}/templates/${encodeURIComponent(templateId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: ghlHeaders(token),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as Record<string, string>)?.message
      || (data as Record<string, string>)?.error
      || `GHL API error (${res.status})`;
    throw new Error(msg);
  }

  invalidateCache(locationId);
}

// ── Template Folders (GHL remote) ──

/**
 * Fetch all template folders for a location from the GHL locations endpoint.
 * Folders are items with type "folder" in the templates response.
 */
export async function fetchTemplateFolders(
  token: string,
  locationId: string,
  options?: { forceRefresh?: boolean },
): Promise<GhlTemplateFolder[]> {
  if (!options?.forceRefresh) {
    const entry = folderCache.get(cacheKey(locationId));
    if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
      return entry.data;
    }
  }

  const result = await fetchFromLocationEndpoint(token, locationId);
  folderCache.set(cacheKey(locationId), { data: result.folders, fetchedAt: Date.now() });
  return result.folders;
}

/**
 * Create a template folder in GHL via POST /locations/{locationId}/templates.
 */
export async function createTemplateFolder(
  token: string,
  locationId: string,
  name: string,
  parentId?: string | null,
): Promise<GhlTemplateFolder> {
  const url = `${GHL_BASE}/locations/${encodeURIComponent(locationId)}/templates`;
  const body: Record<string, unknown> = {
    name,
    type: 'folder',
  };
  if (parentId) body.parentId = parentId;

  const res = await fetch(url, {
    method: 'POST',
    headers: ghlHeaders(token),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as Record<string, string>)?.message
      || (data as Record<string, string>)?.error
      || `GHL API error (${res.status})`;
    throw new Error(msg);
  }

  const data = await res.json();
  const raw = (data as Record<string, unknown>)?.template || data;
  const record = raw as Record<string, unknown>;

  invalidateCache(locationId);

  return {
    id: String(record.id || record._id || ''),
    name: String(record.name || name),
    parentId: typeof record.parentId === 'string' && record.parentId ? record.parentId : parentId || null,
    createdAt: String(record.dateAdded || record.createdAt || new Date().toISOString()),
    updatedAt: String(record.dateUpdated || record.updatedAt || new Date().toISOString()),
  };
}

/**
 * Delete a template folder in GHL via DELETE /locations/{locationId}/templates/{folderId}.
 */
export async function deleteTemplateFolder(
  token: string,
  locationId: string,
  folderId: string,
): Promise<void> {
  const url = `${GHL_BASE}/locations/${encodeURIComponent(locationId)}/templates/${encodeURIComponent(folderId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: ghlHeaders(token),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as Record<string, string>)?.message
      || (data as Record<string, string>)?.error
      || `GHL API error (${res.status})`;
    throw new Error(msg);
  }

  invalidateCache(locationId);
}

/**
 * Rename a template folder in GHL via PUT /locations/{locationId}/templates/{folderId}.
 */
export async function updateTemplateFolder(
  token: string,
  locationId: string,
  folderId: string,
  name: string,
): Promise<GhlTemplateFolder> {
  const url = `${GHL_BASE}/locations/${encodeURIComponent(locationId)}/templates/${encodeURIComponent(folderId)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: ghlHeaders(token),
    body: JSON.stringify({ name }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as Record<string, string>)?.message
      || (data as Record<string, string>)?.error
      || `GHL API error (${res.status})`;
    throw new Error(msg);
  }

  const data = await res.json();
  const raw = (data as Record<string, unknown>)?.template || data;
  const record = raw as Record<string, unknown>;

  invalidateCache(locationId);

  return {
    id: String(record.id || record._id || folderId),
    name: String(record.name || name),
    parentId: typeof record.parentId === 'string' && record.parentId ? record.parentId : null,
    createdAt: String(record.dateAdded || record.createdAt || ''),
    updatedAt: String(record.dateUpdated || record.updatedAt || new Date().toISOString()),
  };
}
