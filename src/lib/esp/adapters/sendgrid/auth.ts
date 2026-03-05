// ── SendGrid Authentication ──
// API-key-based auth: store encrypted API keys in EspConnection, resolve per account.

import { encryptToken, decryptToken } from '../../encryption';
import { SENDGRID_BASE } from './constants';
import type { EspCredentials } from '../../types';
import {
  getApiKeyConnection,
  removeApiKeyConnection,
  upsertApiKeyConnection,
} from '@/lib/esp/api-key-connections';

// ── Connection Management ──

/**
 * Validate that a SendGrid API key is functional by hitting the user profile endpoint.
 * Returns a display name for the account.
 */
export async function validateApiKey(
  apiKey: string,
): Promise<{ accountId: string; accountName: string }> {
  const res = await fetch(`${SENDGRID_BASE}/v3/user/profile`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SendGrid API key validation failed (${res.status}): ${body}`);
  }

  const json = await res.json();

  // SendGrid user/profile returns { first_name, last_name, username, ... }
  const firstName = typeof json.first_name === 'string' ? json.first_name.trim() : '';
  const lastName = typeof json.last_name === 'string' ? json.last_name.trim() : '';
  const username = typeof json.username === 'string' ? json.username.trim() : '';
  const accountName = [firstName, lastName].filter(Boolean).join(' ') || username || 'SendGrid Account';

  // SendGrid doesn't have a simple account ID — use the username as the identifier
  const accountId = username || 'sendgrid';

  return { accountId, accountName };
}

/**
 * Store a SendGrid connection (encrypts the API key).
 */
export async function storeSendGridConnection(params: {
  accountKey: string;
  apiKey: string;
  accountId?: string;
  accountName?: string;
}): Promise<void> {
  const { accountKey, apiKey, accountId, accountName } = params;
  const encryptedKey = encryptToken(apiKey);

  await upsertApiKeyConnection({
    accountKey,
    provider: 'sendgrid',
    apiKey: encryptedKey,
    accountId: accountId ?? null,
    accountName: accountName ?? null,
  });
}

/**
 * Remove a SendGrid connection row.
 */
export async function removeSendGridConnection(accountKey: string): Promise<boolean> {
  try {
    return await removeApiKeyConnection(accountKey, 'sendgrid');
  } catch {
    return false;
  }
}

/**
 * Get the SendGrid connection for an account (decrypts API key).
 */
export async function getSendGridConnection(accountKey: string): Promise<{
  accountKey: string;
  apiKey: string;
  accountId: string | null;
  accountName: string | null;
  installedAt: Date;
} | null> {
  const row = await getApiKeyConnection(accountKey, 'sendgrid');
  if (!row) return null;

  return {
    accountKey: row.accountKey,
    apiKey: decryptToken(row.apiKey),
    accountId: row.accountId,
    accountName: row.accountName,
    installedAt: row.installedAt,
  };
}

/**
 * Get the decrypted API key for a SendGrid account, or null if not connected.
 */
export async function getValidApiKey(accountKey: string): Promise<string | null> {
  const connection = await getSendGridConnection(accountKey);
  return connection?.apiKey ?? null;
}

/**
 * Resolve SendGrid credentials for an account.
 * Returns EspCredentials with provider='sendgrid' and the API key as token.
 * The locationId maps to the SendGrid account ID (username).
 */
export async function resolveSendGridCredentials(
  accountKey: string,
): Promise<EspCredentials | null> {
  const connection = await getSendGridConnection(accountKey);
  if (!connection) return null;

  return {
    provider: 'sendgrid',
    token: connection.apiKey,
    locationId: connection.accountId || accountKey,
  };
}
