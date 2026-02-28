/**
 * Persistent Maizzle render worker.
 *
 * Runs as a long-lived child process, importing @maizzle/framework once and
 * accepting render requests over IPC. This eliminates the ~500-2000ms cold-start
 * penalty that occurred when every preview spawned a fresh Node.js process.
 *
 * Two render modes:
 * - Full render (export): Maizzle's render() with PostCSS, Tailwind, CSS inlining, purging
 * - Fast render (preview): PostHTML component expansion only — no PostCSS/Tailwind overhead
 *
 * Spawned by /src/lib/maizzle-render.ts via child_process.fork() with
 * cwd set to the email-engine directory.
 */
import { render } from '@maizzle/framework';
import posthtml from 'posthtml';
import components from 'posthtml-component';
import expressions from 'posthtml-expressions';
import fs from 'fs';
import path from 'path';

const ENGINE_ROOT = process.env.MAIZZLE_ENGINE_ROOT || process.cwd();

// Component expansion config (shared between fast and full render)
const COMPONENT_CONFIG = {
  root: '.',
  folders: ['src/components', 'src/layouts'],
  fileExtension: ['html'],
  expressions: {
    loopTags: ['each', 'for'],
    missingLocal: '{local}',
    strictMode: false,
  },
};

// Clean up any orphaned temp dirs from previous crashed workers
try {
  const templatesDir = path.join(ENGINE_ROOT, 'src', 'templates');
  if (fs.existsSync(templatesDir)) {
    for (const entry of fs.readdirSync(templatesDir)) {
      if (entry.startsWith('_worker_')) {
        try {
          fs.rmSync(path.join(templatesDir, entry), { recursive: true, force: true });
        } catch {}
      }
    }
  }
} catch {}

/**
 * Strip YAML frontmatter (--- ... ---) from template source.
 * PostHTML doesn't understand frontmatter and renders the delimiters as visible text.
 */
function stripFrontmatter(src) {
  const match = src.match(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? src.slice(match[0].length) : src;
}

/**
 * Fast preview render — PostHTML component expansion only.
 * Skips PostCSS, Tailwind, CSS inlining, purging, and all other transformers.
 * Components already use inline styles, so preview looks correct without CSS processing.
 */
async function renderPreview(html) {
  const clean = stripFrontmatter(html);
  const result = await posthtml([
    components(COMPONENT_CONFIG),
  ]).process(clean, {
    recognizeSelfClosing: true,
    xmlMode: false,
    closingSingleTag: 'slash',
  });
  return result.html;
}

// Signal that the framework is loaded and ready
process.send({ type: 'ready' });

process.on('message', async (msg) => {
  if (!msg || msg.type !== 'render') return;

  const { id, html, config = {} } = msg;
  const t0 = Date.now();

  try {
    let resultHtml;

    if (config.css === false) {
      // Preview mode: fast component expansion only (no PostCSS/Tailwind)
      resultHtml = await renderPreview(html);
    } else {
      // Export mode: full Maizzle pipeline with CSS inlining and purging
      const renderConfig = {
        components: COMPONENT_CONFIG,
        css: {
          inline: true,
          purge: config.purge ?? { safelist: ['*loomi-*'] },
        },
        prettify: config.prettify ?? false,
      };
      const result = await render(html, renderConfig);
      resultHtml = result.html;
    }

    const elapsed = Date.now() - t0;
    if (elapsed > 2000) {
      console.warn(`[maizzle-worker] slow render: ${elapsed}ms (preview: ${config.css === false})`);
    }
    process.send({ type: 'result', id, html: resultHtml });
  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error(`[maizzle-worker] render error after ${elapsed}ms:`, err?.message);
    process.send({ type: 'result', id, error: err?.message || 'Render failed' });
  }
});

// Keep the process alive
process.on('uncaughtException', (err) => {
  console.error('[maizzle-worker] uncaught exception:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('[maizzle-worker] unhandled rejection:', err);
});
