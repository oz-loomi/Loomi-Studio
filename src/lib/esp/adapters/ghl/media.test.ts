import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { moveMedia } from './media';

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalConsoleError = console.error;

type FetchCall = {
  url: string;
  method: string;
  body: unknown;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseBody(init?: RequestInit): unknown {
  if (!init?.body || typeof init.body !== 'string') return undefined;
  return JSON.parse(init.body);
}

function installImmediateTimers(): void {
  globalThis.setTimeout = ((handler: TimerHandler) => {
    if (typeof handler === 'function') handler();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  console.error = originalConsoleError;
});

test('moveMedia falls back to bulk update when the single-item update does not move the file', async () => {
  installImmediateTimers();

  const calls: FetchCall[] = [];
  const originalParent = 'folder-old';
  const targetParent = 'folder-new';
  let currentParent = originalParent;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const method = init?.method || 'GET';
    const body = parseBody(init);
    calls.push({ url, method, body });

    if (url.includes('/medias/files?')) {
      return jsonResponse({
        files: [{ _id: 'file-1', name: 'asset.png', parentId: currentParent }],
      });
    }

    if (url.includes('/medias/update-files')) {
      const payload = body as Record<string, unknown> | undefined;
      if (Array.isArray(payload?.ids) && payload.ids.includes('file-1')) {
        currentParent = targetParent;
      }
      return jsonResponse({ success: true });
    }

    if (url.includes('/medias/file-1')) {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;

  await moveMedia('token', 'loc-1', 'file-1', targetParent, 'asset.png');

  const mutationCalls = calls.filter((call) => call.url.includes('/medias/') && !call.url.includes('/medias/files?'));
  assert.ok(
    mutationCalls.some((call) => call.url.includes('/medias/file-1?') && call.method === 'POST'),
    'expected the documented single-item update endpoint to be attempted first',
  );
  assert.ok(
    mutationCalls.some((call) => {
      const payload = call.body as Record<string, unknown> | undefined;
      return call.url.includes('/medias/update-files')
        && call.method === 'POST'
        && Array.isArray(payload?.ids)
        && payload.ids.includes('file-1')
        && payload.parentId === targetParent;
    }),
    'expected fallback to the bulk update endpoint with ids[] and the target parent',
  );
  assert.equal(currentParent, targetParent);
});

test('moveMedia returns early when the item is already in the target folder', async () => {
  installImmediateTimers();

  const calls: FetchCall[] = [];
  const targetParent = 'folder-new';

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    calls.push({ url, method: init?.method || 'GET', body: parseBody(init) });

    if (url.includes('/medias/files?')) {
      return jsonResponse({
        files: [{ _id: 'file-1', name: 'asset.png', parentId: targetParent }],
      });
    }

    throw new Error(`Unexpected mutation fetch: ${url}`);
  }) as typeof fetch;

  await moveMedia('token', 'loc-1', 'file-1', targetParent, 'asset.png');

  assert.equal(
    calls.filter((call) => call.url.includes('/medias/files?')).length,
    1,
    'expected only the parent lookup request when no move is needed',
  );
});

test('moveMedia throws when every strategy is accepted but the parent never changes', async () => {
  installImmediateTimers();
  console.error = () => {};

  const originalParent = 'folder-old';
  const targetParent = 'folder-new';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url.includes('/medias/files?')) {
      return jsonResponse({
        files: [{ _id: 'file-1', name: 'asset.png', parentId: originalParent }],
      });
    }

    if (url.includes('/medias/')) {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  await assert.rejects(
    () => moveMedia('token', 'loc-1', 'file-1', targetParent, 'asset.png'),
    /Move request was accepted but the file\/folder parent did not change \(target: folder-new, observed: folder-old\)/,
  );
});
