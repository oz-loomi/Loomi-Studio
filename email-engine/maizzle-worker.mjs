/**
 * Persistent Maizzle render worker.
 *
 * Runs as a long-lived child process, importing @maizzle/framework once and
 * accepting render requests over IPC. This eliminates the ~500-2000ms cold-start
 * penalty that occurred when every preview spawned a fresh Node.js process.
 *
 * Spawned by /src/lib/maizzle-render.ts via child_process.fork() with
 * cwd set to the email-engine directory.
 */
import { render } from '@maizzle/framework';
import fs from 'fs';
import path from 'path';

const ENGINE_ROOT = process.env.MAIZZLE_ENGINE_ROOT || process.cwd();

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

// Signal that the framework is loaded and ready
process.send({ type: 'ready' });

process.on('message', async (msg) => {
  if (!msg || msg.type !== 'render') return;

  const { id, html, config = {} } = msg;

  try {
    const renderConfig = {
      components: {
        root: '.',
        folders: ['src/components', 'src/layouts'],
      },
      css: {
        inline: true,
        purge: config.purge ?? { safelist: ['*loomi-*'] },
      },
      prettify: config.prettify ?? false,
    };

    // render() accepts an HTML string directly — no temp file needed
    const result = await render(html, renderConfig);
    process.send({ type: 'result', id, html: result.html });
  } catch (err) {
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
