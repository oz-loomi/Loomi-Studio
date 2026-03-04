// ── GHL Email Templates ──
// CRUD operations for GoHighLevel email templates via the public API.

import { GHL_BASE, API_VERSION } from './constants';
import type { EspEmailTemplate, CreateEspTemplateInput, UpdateEspTemplateInput } from '../../types';

// ── In-memory cache (5 min TTL, same pattern as campaigns) ──

const templateCache = new Map<string, { data: EspEmailTemplate[]; fetchedAt: number }>();
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
  };
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

  const templatesById = new Map<string, EspEmailTemplate>();
  let nextUrl: string | null =
    `${GHL_BASE}/locations/${encodeURIComponent(locationId)}/templates?type=email&limit=${TEMPLATE_PAGE_SIZE}`;
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

  const templates = Array.from(templatesById.values());

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

export async function createTemplate(
  token: string,
  locationId: string,
  input: CreateEspTemplateInput,
): Promise<EspEmailTemplate> {
  const url = `${GHL_BASE}/emails/builder`;
  const res = await fetch(url, {
    method: 'POST',
    headers: ghlHeaders(token),
    body: JSON.stringify({
      locationId,
      name: input.name,
      type: 'html',
      html: input.html,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as Record<string, string>)?.message
      || (data as Record<string, string>)?.error
      || `GHL API error (${res.status})`;
    throw new Error(msg);
  }

  const data = await res.json();
  const raw = ((data as Record<string, unknown>)?.template || data) as Record<string, unknown>;

  invalidateCache(locationId);

  return {
    id: String(raw.id || raw._id || ''),
    name: String(raw.name || input.name),
    subject: input.subject || '',
    previewText: input.previewText || '',
    html: String(raw.html || input.html),
    status: 'active',
    editorType: 'code',
    thumbnailUrl: String(raw.previewUrl || ''),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Update template ──

export async function updateTemplate(
  token: string,
  locationId: string,
  templateId: string,
  input: UpdateEspTemplateInput,
): Promise<EspEmailTemplate> {
  const url = `${GHL_BASE}/emails/builder/data`;
  const body: Record<string, unknown> = { locationId, templateId };
  if (input.name !== undefined) body.name = input.name;
  if (input.html !== undefined) body.html = input.html;

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

export async function deleteTemplate(
  token: string,
  locationId: string,
  templateId: string,
): Promise<void> {
  const url = `${GHL_BASE}/emails/builder/${encodeURIComponent(locationId)}/${encodeURIComponent(templateId)}`;
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
