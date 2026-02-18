import crypto from 'crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';

type Mode = 'dry-run' | 'apply';

function parseArgs(): { mode: Mode; cleanupStale: boolean } {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  // Keep --cleanup-legacy as a backward-compatible alias.
  const cleanupStale = args.includes('--cleanup-stale') || args.includes('--cleanup-legacy');
  return {
    mode: dryRun ? 'dry-run' : 'apply',
    cleanupStale,
  };
}

function parseEnvEntries(raw: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalIndex = line.indexOf('=');
    if (equalIndex <= 0) continue;
    const key = line.slice(0, equalIndex).trim();
    const value = line.slice(equalIndex + 1);
    if (!key) continue;
    entries.set(key, value);
  }
  return entries;
}

function newSecretHex(): string {
  return crypto.randomBytes(32).toString('hex');
}

function withTrailingNewline(value: string): string {
  if (value.length === 0) return '';
  return value.endsWith('\n') ? value : `${value}\n`;
}

function keyFromEnvLine(line: string): string {
  const equalIndex = line.indexOf('=');
  if (equalIndex <= 0) return '';
  return line.slice(0, equalIndex).trim();
}

async function main() {
  const { mode, cleanupStale } = parseArgs();
  const envPath = path.join(process.cwd(), '.env.local');
  let raw = '';
  try {
    raw = await fs.readFile(envPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  const lines = raw.length > 0 ? raw.split(/\r?\n/) : [];
  const entries = parseEnvEntries(raw);
  const additions: string[] = [];
  const updates: string[] = [];

  const existingEspToken = entries.get('ESP_TOKEN_SECRET')?.trim() || '';
  const existingEspOAuthState = entries.get('ESP_OAUTH_STATE_SECRET')?.trim() || '';
  const nextAuthSecret = entries.get('NEXTAUTH_SECRET')?.trim() || '';

  const resolvedEspToken = existingEspToken || nextAuthSecret || newSecretHex();
  const resolvedEspOAuthState = existingEspOAuthState || nextAuthSecret || resolvedEspToken || newSecretHex();

  if (!existingEspToken) {
    additions.push(`ESP_TOKEN_SECRET=${resolvedEspToken}`);
    updates.push('add ESP_TOKEN_SECRET');
  }
  if (!existingEspOAuthState) {
    additions.push(`ESP_OAUTH_STATE_SECRET=${resolvedEspOAuthState}`);
    updates.push('add ESP_OAUTH_STATE_SECRET');
  }

  const staleKeysToRemove = new Set([
    'GHL_TOKEN_SECRET',
    'LOOMI_ALLOW_LEGACY_ESP_SECRETS',
  ]);

  let filteredLines = lines;
  if (cleanupStale) {
    filteredLines = lines.filter((line) => {
      const key = keyFromEnvLine(line);
      if (!key) return true;
      return !staleKeysToRemove.has(key);
    });

    for (const key of staleKeysToRemove) {
      if (entries.has(key)) {
        updates.push(`remove ${key}`);
      }
    }
  }

  console.log(`[env-migrate] file: ${envPath}`);
  console.log(`[env-migrate] mode: ${mode}`);
  if (updates.length === 0) {
    console.log('[env-migrate] no changes needed');
    return;
  }

  console.log('[env-migrate] planned changes:');
  for (const item of updates) {
    console.log(`- ${item}`);
  }

  if (mode === 'dry-run') {
    return;
  }

  const outputLines = [...filteredLines.filter((line) => line.length > 0 || filteredLines.length > 0)];
  if (outputLines.length > 0 && outputLines[outputLines.length - 1].trim() !== '') {
    outputLines.push('');
  }
  outputLines.push('# ESP Secret Migration');
  outputLines.push(...additions);

  await fs.writeFile(envPath, withTrailingNewline(outputLines.join('\n')), 'utf8');
  console.log('[env-migrate] .env.local updated');
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[env-migrate] failed:', message);
  process.exit(1);
});
