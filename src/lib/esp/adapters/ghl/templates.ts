// ── GHL Email Templates ──
// CRUD operations for GoHighLevel email templates via the public API.

import { GHL_BASE, API_VERSION } from './constants';
import type { EspEmailTemplate, CreateEspTemplateInput, UpdateEspTemplateInput } from '../../types';

// ── In-memory cache (5 min TTL, same pattern as campaigns) ──

const templateCache = new Map<string, { data: EspEmailTemplate[]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

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

  const url = `${GHL_BASE}/locations/${encodeURIComponent(locationId)}/templates?type=email`;
  const res = await fetch(url, { headers: ghlHeaders(token) });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as Record<string, string>)?.message
      || (data as Record<string, string>)?.error
      || `GHL API error (${res.status})`;
    throw new Error(msg);
  }

  const data = await res.json();
  const rawTemplates: Record<string, unknown>[] =
    (data as Record<string, unknown>)?.templates as Record<string, unknown>[] ?? [];

  const templates: EspEmailTemplate[] = rawTemplates.map((t) => ({
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
  }));

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
