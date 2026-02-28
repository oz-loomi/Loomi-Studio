/**
 * Maizzle render service — singleton that manages a persistent worker process.
 *
 * Instead of spawning a new Node.js process for every preview/export render
 * (which cold-loads @maizzle/framework each time), this service keeps a single
 * worker alive that imports the framework once and processes renders via IPC.
 *
 * Usage:
 *   import { maizzleRender } from '@/lib/maizzle-render';
 *   const html = await maizzleRender.renderTemplate(templateHtml, { prettify: false });
 */
import { fork, type ChildProcess } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import { PATHS } from '@/lib/paths';

// ── Types ──

export interface RenderConfig {
  /** Run js-beautify on output (default: false). Use true for export only. */
  prettify?: boolean;
  /** PurgeCSS config. Default: { safelist: ['*loomi-*'] } */
  purge?: boolean | { safelist?: string[] };
  /** Set to false to skip PostCSS/Tailwind entirely (preview mode). Default: true (inline + purge). */
  css?: false;
  /** Per-request timeout in ms. Default: 15000 */
  timeout?: number;
}

interface RenderRequest {
  type: 'render';
  id: string;
  html: string;
  config: { prettify?: boolean; purge?: boolean | { safelist?: string[] }; css?: false };
}

interface PendingRequest {
  resolve: (html: string) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

interface QueueEntry {
  request: RenderRequest;
  resolve: (html: string) => void;
  reject: (err: Error) => void;
  timeout: number;
}

// ── Singleton ──

const globalForWorker = globalThis as unknown as {
  maizzleRender: MaizzleRenderService | undefined;
};

const WORKER_PATH = path.join(PATHS.engine.root, 'maizzle-worker.mjs');
const RESPAWN_DELAYS = [100, 500, 2000, 5000];
const DEFAULT_TIMEOUT = 15_000;

class MaizzleRenderService {
  private worker: ChildProcess | null = null;
  private pending = new Map<string, PendingRequest>();
  private queue: QueueEntry[] = [];
  private activeRequestId: string | null = null;
  private ready = false;
  private respawnAttempts = 0;
  private spawning = false;
  private readyPromise: Promise<void> | null = null;

  constructor() {
    // Graceful shutdown
    const cleanup = () => this.shutdown();
    process.on('beforeExit', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  }

  // ── Public API ──

  async renderTemplate(html: string, config: RenderConfig = {}): Promise<string> {
    await this.ensureWorker();

    const id = crypto.randomBytes(8).toString('hex');
    const timeout = config.timeout ?? DEFAULT_TIMEOUT;

    const request: RenderRequest = {
      type: 'render',
      id,
      html,
      config: {
        prettify: config.prettify,
        purge: config.purge,
        css: config.css,
      },
    };

    return new Promise<string>((resolve, reject) => {
      const entry: QueueEntry = { request, resolve, reject, timeout };

      if (this.activeRequestId) {
        // Worker is busy — queue this request
        this.queue.push(entry);
      } else {
        this.sendRequest(entry);
      }
    });
  }

  shutdown() {
    if (this.worker) {
      this.worker.removeAllListeners();
      this.worker.kill('SIGTERM');
      this.worker = null;
    }
    this.ready = false;
    this.readyPromise = null;

    // Reject all pending
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Worker shutting down'));
    }
    this.pending.clear();

    for (const entry of this.queue) {
      entry.reject(new Error('Worker shutting down'));
    }
    this.queue = [];
    this.activeRequestId = null;
  }

  // ── Internals ──

  private async ensureWorker(): Promise<void> {
    if (this.ready && this.worker && this.worker.connected) return;
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = this.spawnWorker();
    return this.readyPromise;
  }

  private spawnWorker(): Promise<void> {
    if (this.spawning) return this.readyPromise!;
    this.spawning = true;

    return new Promise<void>((resolve, reject) => {
      try {
        this.worker = fork(WORKER_PATH, [], {
          cwd: PATHS.engine.root,
          env: {
            ...process.env,
            NODE_NO_WARNINGS: '1',
            MAIZZLE_ENGINE_ROOT: PATHS.engine.root,
          },
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        });

        // Pipe worker stderr to parent stderr for debugging
        this.worker.stderr?.on('data', (data: Buffer) => {
          console.error(`[maizzle-worker] ${data.toString().trim()}`);
        });

        this.worker.on('message', (msg: any) => {
          if (msg?.type === 'ready') {
            this.ready = true;
            this.spawning = false;
            this.respawnAttempts = 0;
            console.log('[maizzle-render] Worker ready');
            resolve();
            return;
          }

          if (msg?.type === 'result') {
            this.handleResult(msg);
          }
        });

        this.worker.on('exit', (code) => {
          console.warn(`[maizzle-render] Worker exited (code ${code})`);
          this.ready = false;
          this.spawning = false;
          this.readyPromise = null;
          this.worker = null;

          // Reject all pending requests
          for (const [, pending] of this.pending) {
            clearTimeout(pending.timer);
            pending.reject(new Error(`Worker exited unexpectedly (code ${code})`));
          }
          this.pending.clear();
          this.activeRequestId = null;

          // Reject queued requests — they'll retry via ensureWorker on next call
          for (const entry of this.queue) {
            entry.reject(new Error(`Worker exited unexpectedly (code ${code})`));
          }
          this.queue = [];

          // Auto-respawn with backoff (don't block — callers will trigger ensureWorker)
          if (!this.spawning) {
            const delay = RESPAWN_DELAYS[
              Math.min(this.respawnAttempts, RESPAWN_DELAYS.length - 1)
            ];
            this.respawnAttempts++;
            console.log(`[maizzle-render] Respawning worker in ${delay}ms (attempt ${this.respawnAttempts})`);
            setTimeout(() => {
              this.readyPromise = this.spawnWorker().catch((err) => {
                console.error('[maizzle-render] Respawn failed:', err.message);
              });
            }, delay);
          }
        });

        this.worker.on('error', (err) => {
          console.error('[maizzle-render] Worker error:', err.message);
          this.spawning = false;
          this.ready = false;
          this.readyPromise = null;
          reject(err);
        });

        // Timeout for initial startup
        setTimeout(() => {
          if (!this.ready) {
            this.spawning = false;
            reject(new Error('Worker startup timed out (30s)'));
          }
        }, 30_000);
      } catch (err) {
        this.spawning = false;
        reject(err);
      }
    });
  }

  private sendRequest(entry: QueueEntry) {
    const { request, resolve, reject, timeout } = entry;

    this.activeRequestId = request.id;

    const timer = setTimeout(() => {
      this.pending.delete(request.id);
      this.activeRequestId = null;
      reject(new Error(`Render timed out after ${timeout}ms`));
      this.processQueue();
    }, timeout);

    this.pending.set(request.id, { resolve, reject, timer });

    try {
      this.worker!.send(request);
    } catch (err) {
      clearTimeout(timer);
      this.pending.delete(request.id);
      this.activeRequestId = null;
      reject(err instanceof Error ? err : new Error(String(err)));
      this.processQueue();
    }
  }

  private handleResult(msg: { id: string; html?: string; error?: string }) {
    const pending = this.pending.get(msg.id);
    if (!pending) return; // Timed out or already handled

    clearTimeout(pending.timer);
    this.pending.delete(msg.id);
    this.activeRequestId = null;

    if (msg.error) {
      pending.reject(new Error(msg.error));
    } else if (msg.html) {
      pending.resolve(msg.html);
    } else {
      pending.reject(new Error('Empty render result'));
    }

    this.processQueue();
  }

  private processQueue() {
    if (this.activeRequestId || this.queue.length === 0) return;

    const next = this.queue.shift()!;

    if (!this.ready || !this.worker?.connected) {
      // Worker is down — reject and let caller retry
      next.reject(new Error('Worker not available'));
      return;
    }

    this.sendRequest(next);
  }
}

export const maizzleRender =
  globalForWorker.maizzleRender ?? new MaizzleRenderService();

if (process.env.NODE_ENV !== 'production') {
  globalForWorker.maizzleRender = maizzleRender;
}
