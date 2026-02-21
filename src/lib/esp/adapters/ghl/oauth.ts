import {
  encryptToken as _encryptToken,
  decryptToken as _decryptToken,
} from '../../encryption';
import { signEspOAuthState, verifyEspOAuthState } from '../../oauth-state';
import {
  getOAuthConnection,
  removeOAuthConnection,
  upsertOAuthConnection,
} from '@/lib/esp/oauth-connections';

// ── Constants ──
const GHL_AUTH_URL = 'https://marketplace.gohighlevel.com/oauth/chooselocation';
const GHL_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token';
const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';

// ── Env helpers ──
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function getClientId() { return requireEnv('GHL_CLIENT_ID'); }
function getClientSecret() { return requireEnv('GHL_CLIENT_SECRET'); }
function getRedirectUri() { return requireEnv('GHL_REDIRECT_URI'); }

function maskClientId(clientId: string): string {
  const value = clientId.trim();
  if (!value) return '(missing)';
  if (value.length <= 6) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

// ── Token types ──
export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: string;
  scope: string;
  locationId: string;
  userId?: string;
}

// ── Encryption (delegates to shared module) ──
export const encryptToken = _encryptToken;
export const decryptToken = _decryptToken;

// ── OAuth State Signing (provider-agnostic) ──

export function signState(accountKey: string): string {
  return signEspOAuthState({
    provider: 'ghl',
    accountKey,
  });
}

export function verifyState(state: string): { accountKey: string } | null {
  const payload = verifyEspOAuthState(state, {
    expectedProvider: 'ghl',
    maxAgeMs: 10 * 60 * 1000,
  });
  return payload ? { accountKey: payload.accountKey } : null;
}

// ── OAuth flow ──

/** Scopes required by the app — used for authorization and mismatch detection. */
export const REQUIRED_SCOPES = [
  'locations.readonly',
  'locations/customValues.readonly',
  'locations/customValues.write',
  'contacts.readonly',
  'contacts.write',
  'conversations.readonly',
  'conversations/message.readonly',
  'conversations.write',
  'conversations/message.write',
  'emails/schedule.readonly',
  'campaigns.readonly',
  'workflows.readonly',
  'users.readonly',
  'emails/builder.readonly',
  'emails/builder.write',
  'medias.readonly',
  'medias.write',
];

/**
 * Build the GHL OAuth authorization URL.
 * Redirects the user to GHL's "Choose Location" page.
 */
export function getAuthorizationUrl(accountKey: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: REQUIRED_SCOPES.join(' '),
    state: signState(accountKey),
  });

  return `${GHL_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const redirectUri = getRedirectUri();

  const res = await fetch(GHL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Token exchange failed (${res.status}): ${body} [clientId=${maskClientId(clientId)} redirectUri=${redirectUri}]`,
    );
  }

  return res.json() as Promise<TokenSet>;
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const clientId = getClientId();
  const clientSecret = getClientSecret();

  const res = await fetch(GHL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Token refresh failed (${res.status}): ${body} [clientId=${maskClientId(clientId)}]`,
    );
  }

  return res.json() as Promise<TokenSet>;
}

/**
 * Get a valid (non-expired) access token for an account.
 * Automatically refreshes if expired.
 * Returns null if no OAuth connection exists.
 */
export async function getValidToken(accountKey: string): Promise<string | null> {
  const connection = await getOAuthConnection(accountKey, 'ghl');

  if (!connection) return null;

  const now = new Date();
  const expiresAt = new Date(connection.tokenExpiresAt);
  // Refresh if expiring within 5 minutes
  const refreshBuffer = 5 * 60 * 1000;

  if (expiresAt.getTime() - now.getTime() > refreshBuffer) {
    // Token is still valid
    return decryptToken(connection.accessToken);
  }

  // Token is expired or expiring soon — refresh it
  try {
    const decryptedRefresh = decryptToken(connection.refreshToken);
    const tokens = await refreshAccessToken(decryptedRefresh);

    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await upsertOAuthConnection({
      accountKey,
      provider: 'ghl',
      locationId: connection.locationId,
      locationName: connection.locationName,
      accessToken: encryptToken(tokens.access_token),
      refreshToken: encryptToken(tokens.refresh_token),
      tokenExpiresAt: newExpiresAt,
      scopes: JSON.stringify(tokens.scope ? tokens.scope.split(' ') : []),
      installedAt: connection.installedAt,
    });

    return tokens.access_token;
  } catch (err) {
    console.error(`Failed to refresh GHL token for account "${accountKey}":`, err);
    // Return the existing token anyway — it might still work for a moment
    try {
      return decryptToken(connection.accessToken);
    } catch {
      return null;
    }
  }
}

/**
 * Fetch location details from GHL using an access token.
 */
export async function fetchLocationDetails(
  accessToken: string,
  locationId: string,
): Promise<Record<string, string>> {
  const res = await fetch(`${GHL_BASE}/locations/${locationId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Version: API_VERSION,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch location details (${res.status})`);
  }

  const data = await res.json();
  const location = data.location || data;

  return {
    id: String(location.id || location._id || locationId),
    name: String(location.name || location.businessName || ''),
    email: String(location.email || ''),
    phone: String(location.phone || ''),
    address: String(location.address || ''),
    city: String(location.city || ''),
    state: String(location.state || ''),
    postalCode: String(location.postalCode || location.postal_code || location.zipCode || ''),
    website: String(location.website || ''),
    timezone: String(location.timezone || ''),
  };
}

/**
 * Store a new GHL connection after successful OAuth flow.
 */
export async function storeConnection({
  accountKey,
  locationId,
  locationName,
  tokens,
}: {
  accountKey: string;
  locationId: string;
  locationName?: string;
  tokens: TokenSet;
}) {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const scopes = tokens.scope ? tokens.scope.split(' ') : [];

  await upsertOAuthConnection({
    accountKey,
    provider: 'ghl',
    locationId,
    locationName: locationName || null,
    accessToken: encryptToken(tokens.access_token),
    refreshToken: encryptToken(tokens.refresh_token),
    tokenExpiresAt: expiresAt,
    scopes: JSON.stringify(scopes),
  });
}

/**
 * Remove a GHL connection for an account.
 */
export async function removeConnection(accountKey: string): Promise<boolean> {
  return removeOAuthConnection(accountKey, 'ghl');
}

/**
 * Get the connection record for an account (without decrypting tokens).
 * Useful for checking connection status.
 */
export async function getConnection(accountKey: string) {
  const connection = await getOAuthConnection(accountKey, 'ghl');
  if (!connection?.locationId) return null;
  return {
    accountKey: connection.accountKey,
    locationId: connection.locationId,
    locationName: connection.locationName,
    scopes: connection.scopes,
    tokenExpiresAt: connection.tokenExpiresAt,
    installedAt: connection.installedAt,
  };
}
