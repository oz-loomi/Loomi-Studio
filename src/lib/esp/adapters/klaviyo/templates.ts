// ── Klaviyo Email Templates ──
// CRUD operations for Klaviyo email templates via their API.

import { KLAVIYO_BASE, KLAVIYO_REVISION } from './constants';
import type { EspEmailTemplate, CreateEspTemplateInput, UpdateEspTemplateInput } from '../../types';

// ── In-memory cache (5 min TTL) ──

const templateCache = new Map<string, { data: EspEmailTemplate[]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(accountId: string): string {
  return `klaviyo:${accountId}`;
}

function getCached(accountId: string): EspEmailTemplate[] | null {
  const entry = templateCache.get(cacheKey(accountId));
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    templateCache.delete(cacheKey(accountId));
    return null;
  }
  return entry.data;
}

function setCache(accountId: string, data: EspEmailTemplate[]): void {
  templateCache.set(cacheKey(accountId), { data, fetchedAt: Date.now() });
}

function invalidateCache(accountId: string): void {
  templateCache.delete(cacheKey(accountId));
}

// ── Helpers ──

function klaviyoHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    revision: KLAVIYO_REVISION,
  };
}

function normalizeTemplate(raw: Record<string, unknown>): EspEmailTemplate {
  const attrs = (raw.attributes || {}) as Record<string, unknown>;
  return {
    id: String(raw.id || ''),
    name: String(attrs.name || ''),
    subject: '',
    previewText: '',
    html: String(attrs.html || ''),
    status: 'active',
    editorType: String(attrs.editor_type || 'CODE'),
    thumbnailUrl: '',
    createdAt: String(attrs.created || ''),
    updatedAt: String(attrs.updated || ''),
  };
}

// ── Fetch all templates ──

export async function fetchTemplates(
  apiKey: string,
  accountId: string,
  options?: { forceRefresh?: boolean },
): Promise<EspEmailTemplate[]> {
  if (!options?.forceRefresh) {
    const cached = getCached(accountId);
    if (cached) return cached;
  }

  const allTemplates: EspEmailTemplate[] = [];
  let nextUrl: string | null = `${KLAVIYO_BASE}/templates/`;

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: klaviyoHeaders(apiKey) });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = (data as Record<string, unknown>)?.detail
        || (data as Record<string, unknown>)?.message
        || `Klaviyo API error (${res.status})`;
      throw new Error(String(msg));
    }

    const json = await res.json() as Record<string, unknown>;
    const items = (json.data || []) as Record<string, unknown>[];
    allTemplates.push(...items.map(normalizeTemplate));

    const links = json.links as Record<string, string> | undefined;
    nextUrl = links?.next || null;
  }

  setCache(accountId, allTemplates);
  return allTemplates;
}

// ── Fetch single template ──

export async function fetchTemplateById(
  apiKey: string,
  _accountId: string,
  templateId: string,
): Promise<EspEmailTemplate | null> {
  const url = `${KLAVIYO_BASE}/templates/${encodeURIComponent(templateId)}/`;
  const res = await fetch(url, { headers: klaviyoHeaders(apiKey) });

  if (!res.ok) {
    if (res.status === 404) return null;
    const data = await res.json().catch(() => ({}));
    const msg = (data as Record<string, unknown>)?.detail
      || (data as Record<string, unknown>)?.message
      || `Klaviyo API error (${res.status})`;
    throw new Error(String(msg));
  }

  const json = await res.json() as Record<string, unknown>;
  const raw = json.data as Record<string, unknown>;
  if (!raw) return null;
  return normalizeTemplate(raw);
}

// ── Create template ──

export async function createTemplate(
  apiKey: string,
  accountId: string,
  input: CreateEspTemplateInput,
): Promise<EspEmailTemplate> {
  const url = `${KLAVIYO_BASE}/templates/`;
  const payload = {
    data: {
      type: 'template',
      attributes: {
        name: input.name,
        editor_type: input.editorType || 'CODE',
        html: input.html,
      },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: klaviyoHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const errors = (data as Record<string, unknown>)?.errors as Array<Record<string, unknown>> | undefined;
    const msg = errors?.[0]?.detail
      || (data as Record<string, unknown>)?.detail
      || `Klaviyo API error (${res.status})`;
    throw new Error(String(msg));
  }

  const json = await res.json() as Record<string, unknown>;
  const raw = json.data as Record<string, unknown>;

  invalidateCache(accountId);
  return normalizeTemplate(raw);
}

// ── Update template ──

export async function updateTemplate(
  apiKey: string,
  accountId: string,
  templateId: string,
  input: UpdateEspTemplateInput,
): Promise<EspEmailTemplate> {
  const url = `${KLAVIYO_BASE}/templates/${encodeURIComponent(templateId)}/`;
  const attrs: Record<string, unknown> = {};
  if (input.name !== undefined) attrs.name = input.name;
  if (input.html !== undefined) attrs.html = input.html;

  const payload = {
    data: {
      type: 'template',
      id: templateId,
      attributes: attrs,
    },
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: klaviyoHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const errors = (data as Record<string, unknown>)?.errors as Array<Record<string, unknown>> | undefined;
    const msg = errors?.[0]?.detail
      || (data as Record<string, unknown>)?.detail
      || `Klaviyo API error (${res.status})`;
    throw new Error(String(msg));
  }

  const json = await res.json() as Record<string, unknown>;
  const raw = json.data as Record<string, unknown>;

  invalidateCache(accountId);
  return normalizeTemplate(raw);
}

// ── Delete template ──

export async function deleteTemplate(
  apiKey: string,
  accountId: string,
  templateId: string,
): Promise<void> {
  const url = `${KLAVIYO_BASE}/templates/${encodeURIComponent(templateId)}/`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: klaviyoHeaders(apiKey),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const errors = (data as Record<string, unknown>)?.errors as Array<Record<string, unknown>> | undefined;
    const msg = errors?.[0]?.detail
      || (data as Record<string, unknown>)?.detail
      || `Klaviyo API error (${res.status})`;
    throw new Error(String(msg));
  }

  invalidateCache(accountId);
}
