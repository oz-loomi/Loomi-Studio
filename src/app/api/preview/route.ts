import { NextRequest, NextResponse } from 'next/server';
import { PATHS } from '@/lib/paths';
import { requireAuth } from '@/lib/api-auth';
import * as templateService from '@/lib/services/templates';
import * as accountEmailService from '@/lib/services/account-emails';
import { maizzleRender } from '@/lib/maizzle-render';
import crypto from 'crypto';
import { readdir, readFile, writeFile, mkdir, unlink, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// ── Server-side disk cache ──

const CACHE_DIR = path.join(process.cwd(), '.preview-cache');
const PREVIEW_CACHE_VERSION = process.env.PREVIEW_CACHE_VERSION || '2026-02-22.3';
const ENGINE_SIGNATURE_TTL_MS = 1000;
const ENGINE_SIGNATURE_PATHS = [
  path.join(PATHS.engine.root, 'src', 'components'),
  path.join(PATHS.engine.root, 'src', 'layouts'),
];

let engineSignatureCache: { value: string; computedAt: number } = {
  value: '',
  computedAt: 0,
};

// ── Helpers ──

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyPreviewValues(
  html: string,
  previewValues?: Record<string, string>,
): string {
  if (!previewValues || Object.keys(previewValues).length === 0) return html;

  let output = html;
  for (const [rawKey, rawValue] of Object.entries(previewValues)) {
    if (rawValue === undefined || rawValue === null) continue;
    const key = rawKey.trim();
    if (!key) continue;
    const token = key.startsWith('{{') && key.endsWith('}}')
      ? key
      : `{{${key.replace(/^\{+|\}+$/g, '')}}}`;
    output = output.replace(new RegExp(escapeRegex(token), 'g'), String(rawValue));
  }
  return output;
}

async function getEngineSignature(): Promise<string> {
  const now = Date.now();
  if (
    engineSignatureCache.value &&
    now - engineSignatureCache.computedAt < ENGINE_SIGNATURE_TTL_MS
  ) {
    return engineSignatureCache.value;
  }

  let latestMtime = 0;
  const stack = [...ENGINE_SIGNATURE_PATHS];

  while (stack.length) {
    const current = stack.pop();
    if (!current || !existsSync(current)) continue;

    let entries: import('fs').Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      try {
        const s = await stat(fullPath);
        if (s.mtimeMs > latestMtime) latestMtime = s.mtimeMs;
      } catch {
        continue;
      }
    }
  }

  const value = String(Math.floor(latestMtime));
  engineSignatureCache = { value, computedAt: now };
  return value;
}

async function getCacheKey(html: string): Promise<string> {
  const engineSignature = await getEngineSignature();
  return crypto
    .createHash('md5')
    .update(`${PREVIEW_CACHE_VERSION}:${engineSignature}:${html}`)
    .digest('hex');
}

async function getCachedPreview(cacheKey: string): Promise<string | null> {
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.html`);
  try {
    return await readFile(cachePath, 'utf-8');
  } catch {
    return null;
  }
}

async function setCachedPreview(cacheKey: string, html: string) {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(path.join(CACHE_DIR, `${cacheKey}.html`), html);
  } catch {}
}

// ── POST /api/preview — Editor preview ──

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const { html, previewValues } = await req.json();

    if (!html) {
      return NextResponse.json({ error: 'No HTML provided' }, { status: 400 });
    }

    const resolvedHtml = applyPreviewValues(
      html,
      previewValues && typeof previewValues === 'object'
        ? previewValues as Record<string, string>
        : undefined,
    );

    // Check cache — key includes engine file mtimes so stale results are impossible
    const cacheKey = await getCacheKey(resolvedHtml);
    const cached = await getCachedPreview(cacheKey);
    if (cached) {
      return NextResponse.json({ html: cached });
    }

    // Compile via persistent worker (no prettify for preview — it renders in an iframe)
    const result = await maizzleRender.renderTemplate(resolvedHtml, {
      prettify: false,
      purge: { safelist: ['*loomi-*'] },
    });

    await setCachedPreview(cacheKey, result);
    return NextResponse.json({ html: result });
  } catch (err: any) {
    console.error('Preview error:', err);
    return NextResponse.json(
      { error: err.message || 'Preview compilation failed' },
      { status: 500 },
    );
  }
}

// ── GET /api/preview?design=slug|emailId=id — Listing / account email preview ──

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const design = req.nextUrl.searchParams.get('design');
    const emailId = req.nextUrl.searchParams.get('emailId');

    let html: string | null = null;
    let previewValues: Record<string, string> = {};

    if (emailId) {
      const accountEmail = await accountEmailService.getAccountEmail(emailId);
      if (!accountEmail) {
        return NextResponse.json({ error: 'Account email not found' }, { status: 404 });
      }
      html = accountEmail.content || accountEmail.template.content;

      if (accountEmail.account) {
        const account = accountEmail.account;
        previewValues['custom_values.dealer_name'] = account.dealer;
        if (account.oem) previewValues['custom_values.oem_name'] = account.oem;
        if (account.phone) previewValues['location.phone'] = account.phone;
        if (account.email) previewValues['location.email'] = account.email;
        if (account.address) previewValues['location.address'] = account.address;
        if (account.website) previewValues['location.website'] = account.website;
        if (account.customValues) {
          try {
            const cv = JSON.parse(account.customValues) as Record<string, { name: string; value: string }>;
            for (const [key, def] of Object.entries(cv)) {
              if (def.value) previewValues[`custom_values.${key}`] = def.value;
            }
          } catch {}
        }
      }
    } else if (design) {
      const template = await templateService.getTemplate(design);
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }
      html = template.content;
    } else {
      return NextResponse.json({ error: 'Provide design or emailId parameter' }, { status: 400 });
    }

    if (!html) {
      return NextResponse.json({ error: 'No template content' }, { status: 404 });
    }

    const resolvedHtml = applyPreviewValues(html, previewValues);

    // Check cache
    const cacheKey = await getCacheKey(resolvedHtml);
    const cached = await getCachedPreview(cacheKey);
    if (cached) {
      return NextResponse.json({ html: cached });
    }

    // Compile via persistent worker (no prettify for preview)
    const result = await maizzleRender.renderTemplate(resolvedHtml, {
      prettify: false,
      purge: { safelist: ['*loomi-*'] },
    });

    await setCachedPreview(cacheKey, result);
    return NextResponse.json({ html: result });
  } catch (err: any) {
    console.error('Preview GET error:', err);
    return NextResponse.json(
      { error: err.message || 'Preview compilation failed' },
      { status: 500 },
    );
  }
}

// ── DELETE /api/preview — Clear cache ──

export async function DELETE() {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    if (existsSync(CACHE_DIR)) {
      const files = await readdir(CACHE_DIR);
      await Promise.all(files.map((f) => unlink(path.join(CACHE_DIR, f))));
    }
    return NextResponse.json({ cleared: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
