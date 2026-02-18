// ── Klaviyo Authentication ──
// API-key-based auth: store encrypted API keys in EspConnection, resolve per account.

import { encryptToken, decryptToken } from '../../encryption';
import { KLAVIYO_BASE, KLAVIYO_REVISION } from './constants';
import type { EspCredentials } from '../../types';
import {
  getApiKeyConnection,
  removeApiKeyConnection,
  upsertApiKeyConnection,
} from '@/lib/esp/api-key-connections';

// ── Connection Management ──

/**
 * Validate that a Klaviyo API key is functional by hitting the accounts endpoint.
 * Returns the Klaviyo account ID and name if valid.
 */
export async function validateApiKey(
  apiKey: string,
): Promise<{ accountId: string; accountName: string }> {
  const res = await fetch(`${KLAVIYO_BASE}/accounts/`, {
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      revision: KLAVIYO_REVISION,
      Accept: 'application/vnd.api+json',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Klaviyo API key validation failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  const account = json.data?.[0];
  if (!account) {
    throw new Error('Klaviyo returned no account data');
  }

  return {
    accountId: account.id,
    accountName: account.attributes?.contact_information?.default_sender_name ||
                 account.attributes?.contact_information?.organization_name ||
                 'Klaviyo Account',
  };
}

/**
 * Store a Klaviyo connection (encrypts the API key).
 * Account provider selection is handled by the connection service.
 */
export async function storeKlaviyoConnection(params: {
  accountKey: string;
  apiKey: string;
  accountId?: string;
  accountName?: string;
}): Promise<void> {
  const { accountKey, apiKey, accountId, accountName } = params;
  const encryptedKey = encryptToken(apiKey);

  await upsertApiKeyConnection({
    accountKey,
    provider: 'klaviyo',
    apiKey: encryptedKey,
    accountId: accountId ?? null,
    accountName: accountName ?? null,
  });
}

/**
 * Remove a Klaviyo connection row.
 * Account-provider fallback selection is handled by the connection service.
 */
export async function removeKlaviyoConnection(accountKey: string): Promise<boolean> {
  try {
    return await removeApiKeyConnection(accountKey, 'klaviyo');
  } catch {
    return false;
  }
}

/**
 * Get the Klaviyo connection for an account (decrypts API key).
 */
export async function getKlaviyoConnection(accountKey: string): Promise<{
  accountKey: string;
  apiKey: string;
  accountId: string | null;
  accountName: string | null;
  installedAt: Date;
} | null> {
  const row = await getApiKeyConnection(accountKey, 'klaviyo');
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
 * Get the decrypted API key for a Klaviyo account, or null if not connected.
 */
export async function getValidApiKey(accountKey: string): Promise<string | null> {
  const connection = await getKlaviyoConnection(accountKey);
  return connection?.apiKey ?? null;
}

/**
 * Resolve Klaviyo credentials for an account.
 * Returns EspCredentials with provider='klaviyo' and the API key as token.
 * The locationId maps to the Klaviyo account ID.
 */
export async function resolveKlaviyoCredentials(
  accountKey: string,
): Promise<EspCredentials | null> {
  const connection = await getKlaviyoConnection(accountKey);
  if (!connection) return null;

  return {
    provider: 'klaviyo',
    token: connection.apiKey,
    locationId: connection.accountId || accountKey,
  };
}
