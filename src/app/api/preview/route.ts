import { NextRequest, NextResponse } from 'next/server';
import { PATHS } from '@/lib/paths';
import { requireAuth } from '@/lib/api-auth';
import * as templateService from '@/lib/services/templates';
import * as accountEmailService from '@/lib/services/account-emails';
import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Server-side disk cache directory
const CACHE_DIR = path.join(process.cwd(), '.preview-cache');

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

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheKey(html: string): string {
  return crypto.createHash('md5').update(html).digest('hex');
}

function getCachedPreview(cacheKey: string): string | null {
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.html`);
  try {
    if (fs.existsSync(cachePath)) {
      return fs.readFileSync(cachePath, 'utf-8');
    }
  } catch {}
  return null;
}

function setCachedPreview(cacheKey: string, html: string) {
  try {
    ensureCacheDir();
    fs.writeFileSync(path.join(CACHE_DIR, `${cacheKey}.html`), html);
  } catch {}
}

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

    // Check disk cache first
    const cacheKey = getCacheKey(resolvedHtml);
    const cached = getCachedPreview(cacheKey);
    if (cached) {
      return NextResponse.json({ html: cached });
    }

    // Always use the email engine for compilation
    const engineRoot = PATHS.engine.root;

    // Use unique ID for temp files to avoid race conditions with concurrent requests
    const uid = crypto.randomBytes(6).toString('hex');
    const tmpDir = path.join(engineRoot, 'src', 'templates', `_preview_${uid}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, '_preview.html');
    fs.writeFileSync(tmpFile, resolvedHtml, 'utf-8');

    const scriptFile = path.join(engineRoot, `_render-preview-${uid}.mjs`);

    try {
      const scriptContent = `
import { render } from '@maizzle/framework';
import fs from 'fs';

const template = fs.readFileSync(${JSON.stringify(tmpFile)}, 'utf-8');
const result = await render(template, {
  components: {
    root: '.',
    folders: ['src/components', 'src/layouts'],
  },
  css: { inline: true, purge: true },
  prettify: true,
});

process.stdout.write(JSON.stringify({ html: result.html }));
`;

      fs.writeFileSync(scriptFile, scriptContent);

      const output = execSync(`node _render-preview-${uid}.mjs`, {
        cwd: engineRoot,
        timeout: 15000,
        encoding: 'utf-8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const jsonStart = output.indexOf('{"html":');
      if (jsonStart === -1) {
        return NextResponse.json({ error: 'No output from Maizzle render' }, { status: 500 });
      }
      const result = JSON.parse(output.slice(jsonStart));

      // Cache the result to disk
      setCachedPreview(cacheKey, result.html);

      return NextResponse.json({ html: result.html });
    } finally {
      try { fs.unlinkSync(scriptFile); } catch {}
      try { fs.unlinkSync(tmpFile); } catch {}
      try { fs.rmdirSync(tmpDir); } catch {}
    }
  } catch (err: any) {
    console.error('Preview error:', err);
    return NextResponse.json(
      { error: err.message || 'Preview compilation failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/preview?design=slug
 * GET /api/preview?emailId=id
 *
 * Resolve a template from the database and compile it.
 * - design: look up a library template by slug
 * - emailId: look up an account email by ID (uses customized content or falls back to library)
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const design = req.nextUrl.searchParams.get('design');
    const emailId = req.nextUrl.searchParams.get('emailId');

    let html: string | null = null;
    let previewValues: Record<string, string> = {};

    if (emailId) {
      // Look up account email — use customized content or fall back to library template
      const accountEmail = await accountEmailService.getAccountEmail(emailId);
      if (!accountEmail) {
        return NextResponse.json({ error: 'Account email not found' }, { status: 404 });
      }
      html = accountEmail.content || accountEmail.template.content;

      // Build preview values from account data
      if (accountEmail.account) {
        const account = accountEmail.account;
        previewValues['custom_values.dealer_name'] = account.dealer;
        if (account.oem) previewValues['custom_values.oem_name'] = account.oem;
        if (account.phone) previewValues['location.phone'] = account.phone;
        if (account.email) previewValues['location.email'] = account.email;
        if (account.address) previewValues['location.address'] = account.address;
        if (account.website) previewValues['location.website'] = account.website;
        // Parse custom values from JSON
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

    // Apply preview values
    const resolvedHtml = applyPreviewValues(html, previewValues);

    // Check cache
    const cacheKey = getCacheKey(resolvedHtml);
    const cached = getCachedPreview(cacheKey);
    if (cached) {
      return NextResponse.json({ html: cached });
    }

    // Compile with Maizzle
    const engineRoot = PATHS.engine.root;
    const uid = crypto.randomBytes(6).toString('hex');
    const tmpDir = path.join(engineRoot, 'src', 'templates', `_preview_${uid}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, '_preview.html');
    fs.writeFileSync(tmpFile, resolvedHtml, 'utf-8');

    const scriptFile = path.join(engineRoot, `_render-preview-${uid}.mjs`);

    try {
      const scriptContent = `
import { render } from '@maizzle/framework';
import fs from 'fs';

const template = fs.readFileSync(${JSON.stringify(tmpFile)}, 'utf-8');
const result = await render(template, {
  components: {
    root: '.',
    folders: ['src/components', 'src/layouts'],
  },
  css: { inline: true, purge: true },
  prettify: true,
});

process.stdout.write(JSON.stringify({ html: result.html }));
`;
      fs.writeFileSync(scriptFile, scriptContent);

      const output = execSync(`node _render-preview-${uid}.mjs`, {
        cwd: engineRoot,
        timeout: 15000,
        encoding: 'utf-8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const jsonStart = output.indexOf('{"html":');
      if (jsonStart === -1) {
        return NextResponse.json({ error: 'No output from Maizzle render' }, { status: 500 });
      }
      const result = JSON.parse(output.slice(jsonStart));
      setCachedPreview(cacheKey, result.html);
      return NextResponse.json({ html: result.html });
    } finally {
      try { fs.unlinkSync(scriptFile); } catch {}
      try { fs.unlinkSync(tmpFile); } catch {}
      try { fs.rmdirSync(tmpDir); } catch {}
    }
  } catch (err: any) {
    console.error('Preview GET error:', err);
    return NextResponse.json(
      { error: err.message || 'Preview compilation failed' },
      { status: 500 },
    );
  }
}

// DELETE handler to clear the cache
export async function DELETE() {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(CACHE_DIR, file));
      }
    }
    return NextResponse.json({ cleared: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
