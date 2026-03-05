// ── SendGrid Transactional Templates ──
// CRUD operations for SendGrid dynamic transactional templates via v3 API.

import { SENDGRID_BASE } from './constants';
import type { EspEmailTemplate, CreateEspTemplateInput, UpdateEspTemplateInput } from '../../types';

// ── In-memory cache (5 min TTL) ──

const templateCache = new Map<string, { data: EspEmailTemplate[]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(accountId: string): string {
  return `sendgrid:${accountId}`;
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

function sendgridHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/**
 * SendGrid templates have versions. The "active" version is the one with active=1.
 * We surface the active version's HTML, subject, etc.
 */
function normalizeTemplate(raw: Record<string, unknown>): EspEmailTemplate {
  const versions = Array.isArray(raw.versions) ? raw.versions : [];
  // Find the active version, or fall back to the first one
  const activeVersion = (versions.find(
    (v: Record<string, unknown>) => v.active === 1,
  ) || versions[0] || {}) as Record<string, unknown>;

  return {
    id: String(raw.id || ''),
    name: String(raw.name || ''),
    subject: String(activeVersion.subject || ''),
    previewText: '',
    html: String(activeVersion.html_content || ''),
    status: 'active',
    editorType: String(raw.generation || 'dynamic'),
    thumbnailUrl: String(activeVersion.thumbnail_url || ''),
    createdAt: String(raw.updated_at || ''),
    updatedAt: String(activeVersion.updated_at || raw.updated_at || ''),
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
  let pageToken: string | undefined;

  // SendGrid paginates templates with page_size and page_token
  do {
    const params = new URLSearchParams({
      generations: 'dynamic',
      page_size: '200',
    });
    if (pageToken) params.set('page_token', pageToken);

    const res = await fetch(`${SENDGRID_BASE}/v3/templates?${params}`, {
      headers: sendgridHeaders(apiKey),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[SendGrid] Templates fetch failed (${res.status}) for ${accountId}:`, body);
      throw new Error(`SendGrid templates fetch failed (${res.status})`);
    }

    const json = await res.json();
    const templates = Array.isArray(json.templates) ? json.templates : (json.result || []);

    for (const raw of templates) {
      allTemplates.push(normalizeTemplate(raw));
    }

    // SendGrid v3 templates use _metadata.self/next for pagination
    const metadata = json._metadata;
    if (metadata?.next) {
      // Extract page_token from the next URL
      try {
        const nextUrl = new URL(metadata.next, SENDGRID_BASE);
        pageToken = nextUrl.searchParams.get('page_token') || undefined;
      } catch {
        pageToken = undefined;
      }
    } else {
      pageToken = undefined;
    }
  } while (pageToken);

  setCache(accountId, allTemplates);
  return allTemplates;
}

// ── Fetch single template ──

export async function fetchTemplateById(
  apiKey: string,
  _accountId: string,
  templateId: string,
): Promise<EspEmailTemplate | null> {
  const res = await fetch(`${SENDGRID_BASE}/v3/templates/${encodeURIComponent(templateId)}`, {
    headers: sendgridHeaders(apiKey),
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SendGrid template fetch failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  return normalizeTemplate(json);
}

// ── Create template ──

export async function createTemplate(
  apiKey: string,
  accountId: string,
  input: CreateEspTemplateInput,
): Promise<EspEmailTemplate> {
  // Step 1: Create the template shell
  const createRes = await fetch(`${SENDGRID_BASE}/v3/templates`, {
    method: 'POST',
    headers: sendgridHeaders(apiKey),
    body: JSON.stringify({
      name: input.name,
      generation: 'dynamic',
    }),
  });

  if (!createRes.ok) {
    const body = await createRes.text().catch(() => '');
    throw new Error(`SendGrid template creation failed (${createRes.status}): ${body}`);
  }

  const template = await createRes.json();
  const templateId = template.id;

  // Step 2: Add a version with the HTML content
  const versionRes = await fetch(
    `${SENDGRID_BASE}/v3/templates/${encodeURIComponent(templateId)}/versions`,
    {
      method: 'POST',
      headers: sendgridHeaders(apiKey),
      body: JSON.stringify({
        name: input.name,
        subject: input.subject || '{{subject}}',
        html_content: input.html,
        active: 1,
        editor: input.editorType === 'design' ? 'design' : 'code',
      }),
    },
  );

  if (!versionRes.ok) {
    const body = await versionRes.text().catch(() => '');
    console.error(`[SendGrid] Template version creation failed (${versionRes.status}):`, body);
    // Template was created but version failed — still return what we have
  }

  invalidateCache(accountId);

  // Fetch the complete template to return
  const complete = await fetchTemplateById(apiKey, accountId, templateId);
  return complete || normalizeTemplate(template);
}

// ── Update template ──

export async function updateTemplate(
  apiKey: string,
  accountId: string,
  templateId: string,
  input: UpdateEspTemplateInput,
): Promise<EspEmailTemplate> {
  // Update template name if provided
  if (input.name) {
    const nameRes = await fetch(
      `${SENDGRID_BASE}/v3/templates/${encodeURIComponent(templateId)}`,
      {
        method: 'PATCH',
        headers: sendgridHeaders(apiKey),
        body: JSON.stringify({ name: input.name }),
      },
    );

    if (!nameRes.ok) {
      const body = await nameRes.text().catch(() => '');
      throw new Error(`SendGrid template name update failed (${nameRes.status}): ${body}`);
    }
  }

  // Update version content if HTML/subject changed
  if (input.html || input.subject) {
    // First, get the active version ID
    const template = await fetchTemplateById(apiKey, accountId, templateId);
    if (!template) {
      throw new Error(`SendGrid template ${templateId} not found`);
    }

    // Fetch full template to get version IDs
    const fullRes = await fetch(
      `${SENDGRID_BASE}/v3/templates/${encodeURIComponent(templateId)}`,
      { headers: sendgridHeaders(apiKey) },
    );

    if (!fullRes.ok) {
      throw new Error(`Failed to fetch template for version update (${fullRes.status})`);
    }

    const fullTemplate = await fullRes.json();
    const versions = Array.isArray(fullTemplate.versions) ? fullTemplate.versions : [];
    const activeVersion = versions.find(
      (v: Record<string, unknown>) => v.active === 1,
    ) || versions[0];

    if (activeVersion?.id) {
      const versionUpdate: Record<string, unknown> = {};
      if (input.html) versionUpdate.html_content = input.html;
      if (input.subject) versionUpdate.subject = input.subject;

      const versionRes = await fetch(
        `${SENDGRID_BASE}/v3/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(activeVersion.id)}`,
        {
          method: 'PATCH',
          headers: sendgridHeaders(apiKey),
          body: JSON.stringify(versionUpdate),
        },
      );

      if (!versionRes.ok) {
        const body = await versionRes.text().catch(() => '');
        throw new Error(`SendGrid template version update failed (${versionRes.status}): ${body}`);
      }
    }
  }

  invalidateCache(accountId);

  const updated = await fetchTemplateById(apiKey, accountId, templateId);
  if (!updated) {
    throw new Error(`SendGrid template ${templateId} not found after update`);
  }
  return updated;
}

// ── Delete template ──

export async function deleteTemplate(
  apiKey: string,
  accountId: string,
  templateId: string,
): Promise<void> {
  const res = await fetch(
    `${SENDGRID_BASE}/v3/templates/${encodeURIComponent(templateId)}`,
    {
      method: 'DELETE',
      headers: sendgridHeaders(apiKey),
    },
  );

  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`SendGrid template deletion failed (${res.status}): ${body}`);
  }

  invalidateCache(accountId);
}
