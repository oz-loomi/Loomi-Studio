import {
  encryptToken as _encryptToken,
  decryptToken as _decryptToken,
} from '../../encryption';
import { signEspOAuthState, verifyEspOAuthState } from '../../oauth-state';
import {
  getAccountProviderLink,
  removeAccountProviderLink,
  upsertAccountProviderLink,
} from '@/lib/esp/account-provider-links';
import {
  getOAuthConnection,
  removeOAuthConnection,
  upsertOAuthConnection,
} from '@/lib/esp/oauth-connections';
import {
  getProviderOAuthCredential,
  removeProviderOAuthCredential,
  upsertProviderOAuthCredential,
} from '@/lib/esp/provider-oauth-credentials';

import { GHL_BASE, API_VERSION } from './constants';

// ── Constants ──
const GHL_AUTH_URL = 'https://marketplace.gohighlevel.com/oauth/chooselocation';
const GHL_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token';
const LOCATION_TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000;

export const GHL_AGENCY_ACCOUNT_KEY = '__ghl_agency__';

export type GhlOAuthMode = 'legacy' | 'hybrid' | 'agency';

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
  locationId?: string;
  companyId?: string;
  userId?: string;
  userType?: string;
}

// ── Encryption (delegates to shared module) ──
export const encryptToken = _encryptToken;
export const decryptToken = _decryptToken;

const locationTokenCache = new Map<string, { token: string; expiresAt: number }>();
const locationTokenInFlight = new Map<string, Promise<string | null>>();

function splitScopes(scopes: string | null | undefined): string[] {
  return typeof scopes === 'string'
    ? scopes.split(' ').map((scope) => scope.trim()).filter(Boolean)
    : [];
}

function getAgencyTokenFromEnv(): string | null {
  const token = process.env.GHL_AGENCY_TOKEN?.trim();
  return token ? token : null;
}

function normalizeMode(modeRaw: string | null | undefined): GhlOAuthMode {
  const normalized = (modeRaw || '').trim().toLowerCase();
  if (normalized === 'agency') return 'agency';
  if (normalized === 'hybrid') return 'hybrid';
  return 'legacy';
}

export function getGhlOAuthMode(): GhlOAuthMode {
  return normalizeMode(process.env.GHL_OAUTH_MODE);
}

function clearLocationTokenCache(): void {
  locationTokenCache.clear();
  locationTokenInFlight.clear();
}

function removeCachedLocationToken(locationId: string | null | undefined): void {
  const key = (locationId || '').trim();
  if (!key) return;
  locationTokenCache.delete(key);
  locationTokenInFlight.delete(key);
}

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
  'oauth.readonly',
  'oauth.write',
  'locations.readonly',
  'locations/customValues.readonly',
  'locations/customValues.write',
  'locations/customFields.readonly',
  'locations/customFields.write',
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
      user_type: 'Company',
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
      user_type: 'Company',
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
 * Get a valid (non-expired) legacy location OAuth token for an account.
 * Automatically refreshes if expired.
 * Returns null if no OAuth connection exists.
 */
export async function getLegacyValidToken(accountKey: string): Promise<string | null> {
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

export async function getValidAgencyToken(): Promise<{
  token: string;
  subjectId: string | null;
  scopes: string;
  tokenExpiresAt: Date | null;
  installedAt: Date | null;
} | null> {
  const envToken = getAgencyTokenFromEnv();

  let credential: Awaited<ReturnType<typeof getProviderOAuthCredential>> = null;
  try {
    credential = await getProviderOAuthCredential('ghl');
  } catch (err) {
    if (!envToken) {
      console.warn('Failed to read GHL provider OAuth credential:', err);
    }
  }

  if (!credential) {
    if (!envToken) return null;
    return {
      token: envToken,
      subjectId: null,
      scopes: '[]',
      tokenExpiresAt: null,
      installedAt: null,
    };
  }

  const now = Date.now();
  const expiresAt = credential.tokenExpiresAt.getTime();
  const refreshBuffer = 5 * 60 * 1000;

  if (expiresAt - now > refreshBuffer) {
    try {
      return {
        token: decryptToken(credential.accessToken),
        subjectId: credential.subjectId,
        scopes: credential.scopes,
        tokenExpiresAt: credential.tokenExpiresAt,
        installedAt: credential.installedAt,
      };
    } catch {
      if (!envToken) return null;
      return {
        token: envToken,
        subjectId: credential.subjectId,
        scopes: credential.scopes,
        tokenExpiresAt: credential.tokenExpiresAt,
        installedAt: credential.installedAt,
      };
    }
  }

  try {
    const refreshToken = decryptToken(credential.refreshToken);
    const refreshed = await refreshAccessToken(refreshToken);
    const nextExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    const refreshedScopes = JSON.stringify(splitScopes(refreshed.scope));

    await upsertProviderOAuthCredential({
      provider: 'ghl',
      subjectType: credential.subjectType || 'agency',
      subjectId: credential.subjectId,
      accessToken: encryptToken(refreshed.access_token),
      refreshToken: encryptToken(refreshed.refresh_token),
      tokenExpiresAt: nextExpiresAt,
      scopes: refreshedScopes,
      installedAt: credential.installedAt,
    });

    return {
      token: refreshed.access_token,
      subjectId: credential.subjectId,
      scopes: refreshedScopes,
      tokenExpiresAt: nextExpiresAt,
      installedAt: credential.installedAt,
    };
  } catch (err) {
    console.error('Failed to refresh GHL agency OAuth credential:', err);
    try {
      return {
        token: decryptToken(credential.accessToken),
        subjectId: credential.subjectId,
        scopes: credential.scopes,
        tokenExpiresAt: credential.tokenExpiresAt,
        installedAt: credential.installedAt,
      };
    } catch {
      if (!envToken) return null;
      return {
        token: envToken,
        subjectId: credential.subjectId,
        scopes: credential.scopes,
        tokenExpiresAt: credential.tokenExpiresAt,
        installedAt: credential.installedAt,
      };
    }
  }
}

async function resolveAccountLocationContext(accountKey: string): Promise<{
  locationId: string;
  locationName: string | null;
  installedAt: Date | null;
} | null> {
  try {
    const link = await getAccountProviderLink(accountKey, 'ghl');
    if (link?.locationId) {
      return {
        locationId: link.locationId,
        locationName: link.locationName,
        installedAt: link.linkedAt,
      };
    }
  } catch {
    // New table may not exist yet on environments pending migration.
  }

  const legacyConnection = await getOAuthConnection(accountKey, 'ghl');
  if (!legacyConnection?.locationId) return null;

  // Backfill link row opportunistically.
  try {
    await upsertAccountProviderLink({
      accountKey,
      provider: 'ghl',
      locationId: legacyConnection.locationId,
      locationName: legacyConnection.locationName,
      linkedAt: legacyConnection.installedAt,
    });
  } catch {
    // Best effort only.
  }

  return {
    locationId: legacyConnection.locationId,
    locationName: legacyConnection.locationName,
    installedAt: legacyConnection.installedAt,
  };
}

function extractLocationTokenPayloadValue(
  payload: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function extractLocationTokenExpirySeconds(payload: Record<string, unknown>): number {
  const nested = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data as Record<string, unknown>
    : null;

  const candidates = [
    payload.expires_in,
    payload.expiresIn,
    payload.expiresInSeconds,
    payload.ttl,
    nested?.expires_in,
    nested?.expiresIn,
    nested?.expiresInSeconds,
    nested?.ttl,
  ];

  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.floor(numeric);
    }
  }

  return 15 * 60;
}

async function mintLocationToken(
  agencyToken: string,
  locationId: string,
  subjectId: string | null,
): Promise<string | null> {
  const cacheKey = locationId.trim();
  if (!cacheKey) return null;

  const cached = locationTokenCache.get(cacheKey);
  if (cached && cached.expiresAt - Date.now() > LOCATION_TOKEN_REFRESH_BUFFER_MS) {
    return cached.token;
  }

  const inflight = locationTokenInFlight.get(cacheKey);
  if (inflight) return inflight;

  const requestPromise = (async () => {
    const companyId = subjectId || process.env.GHL_AGENCY_COMPANY_ID?.trim() || '';
    const body: Record<string, string> = { locationId: cacheKey };
    if (companyId) body.companyId = companyId;

    const res = await fetch(`${GHL_BASE}/oauth/locationToken`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${agencyToken}`,
        'Content-Type': 'application/json',
        Version: API_VERSION,
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      const suffix = text ? `: ${text.slice(0, 220)}` : '';
      throw new Error(`Location token mint failed (${res.status})${suffix}`);
    }

    const data = await res.json().catch(() => ({}));
    const payload = data && typeof data === 'object' && !Array.isArray(data)
      ? data as Record<string, unknown>
      : {};
    const nested = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? payload.data as Record<string, unknown>
      : {};

    const token = extractLocationTokenPayloadValue(payload, [
      'access_token',
      'accessToken',
      'token',
      'locationAccessToken',
    ]) || extractLocationTokenPayloadValue(nested, [
      'access_token',
      'accessToken',
      'token',
      'locationAccessToken',
    ]);

    if (!token) {
      throw new Error('Location token mint response did not contain an access token');
    }

    const expiresInSeconds = extractLocationTokenExpirySeconds(payload);
    locationTokenCache.set(cacheKey, {
      token,
      expiresAt: Date.now() + (expiresInSeconds * 1000),
    });

    return token;
  })()
    .finally(() => {
      locationTokenInFlight.delete(cacheKey);
    });

  locationTokenInFlight.set(cacheKey, requestPromise);
  return requestPromise;
}

export async function getValidTokenForAccount(accountKey: string): Promise<string | null> {
  const mode = getGhlOAuthMode();
  if (mode === 'legacy') {
    return getLegacyValidToken(accountKey);
  }

  const location = await resolveAccountLocationContext(accountKey);
  if (!location?.locationId) {
    return mode === 'hybrid' ? getLegacyValidToken(accountKey) : null;
  }

  const agency = await getValidAgencyToken();
  if (!agency?.token) {
    return mode === 'hybrid' ? getLegacyValidToken(accountKey) : null;
  }

  try {
    const token = await mintLocationToken(agency.token, location.locationId, agency.subjectId);
    if (token) return token;
  } catch (err) {
    console.error(`Failed to mint GHL location token for "${accountKey}":`, err);
  }

  return mode === 'hybrid' ? getLegacyValidToken(accountKey) : null;
}

/**
 * Get a valid GHL access token for an account based on current OAuth mode.
 */
export async function getValidToken(accountKey: string): Promise<string | null> {
  return getValidTokenForAccount(accountKey);
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

export async function storeAgencyCredential(input: {
  tokens: TokenSet;
  subjectType?: string;
  subjectId?: string | null;
}): Promise<void> {
  const { tokens, subjectType = 'agency', subjectId } = input;
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Agency OAuth credential requires access_token and refresh_token');
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const scopes = JSON.stringify(splitScopes(tokens.scope));

  await upsertProviderOAuthCredential({
    provider: 'ghl',
    subjectType,
    subjectId: subjectId ?? tokens.companyId ?? null,
    accessToken: encryptToken(tokens.access_token),
    refreshToken: encryptToken(tokens.refresh_token),
    tokenExpiresAt: expiresAt,
    scopes,
  });

  clearLocationTokenCache();
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
  if (accountKey === GHL_AGENCY_ACCOUNT_KEY) {
    await storeAgencyCredential({ tokens, subjectType: 'agency' });
    return;
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const scopes = splitScopes(tokens.scope);

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

  try {
    await upsertAccountProviderLink({
      accountKey,
      provider: 'ghl',
      locationId,
      locationName: locationName || null,
    });
  } catch {
    // Best effort only for environments pending migration.
  }
}

/**
 * Remove a GHL connection for an account.
 */
export async function removeConnection(accountKey: string): Promise<boolean> {
  if (accountKey === GHL_AGENCY_ACCOUNT_KEY) {
    clearLocationTokenCache();
    return removeProviderOAuthCredential('ghl');
  }

  let linkedLocationId: string | null = null;
  try {
    linkedLocationId = (await getAccountProviderLink(accountKey, 'ghl'))?.locationId || null;
  } catch {
    linkedLocationId = null;
  }

  const [removedLegacy, removedLink] = await Promise.all([
    removeOAuthConnection(accountKey, 'ghl'),
    removeAccountProviderLink(accountKey, 'ghl').catch(() => false),
  ]);

  removeCachedLocationToken(linkedLocationId);
  return removedLegacy || removedLink;
}

/**
 * Get the connection record for an account (without decrypting tokens).
 * Useful for checking connection status.
 */
export async function getConnection(accountKey: string) {
  if (accountKey === GHL_AGENCY_ACCOUNT_KEY) {
    try {
      const credential = await getProviderOAuthCredential('ghl');
      if (!credential) return null;
      return {
        accountKey,
        locationId: GHL_AGENCY_ACCOUNT_KEY,
        locationName: 'Agency OAuth',
        scopes: credential.scopes,
        tokenExpiresAt: credential.tokenExpiresAt,
        installedAt: credential.installedAt,
      };
    } catch {
      return getAgencyTokenFromEnv()
        ? {
          accountKey,
          locationId: GHL_AGENCY_ACCOUNT_KEY,
          locationName: 'Agency OAuth',
          scopes: '[]',
          tokenExpiresAt: undefined,
          installedAt: undefined,
        }
        : null;
    }
  }

  const mode = getGhlOAuthMode();
  const legacyConnection = await getOAuthConnection(accountKey, 'ghl');

  if (mode === 'legacy') {
    if (!legacyConnection?.locationId) return null;
    return {
      accountKey: legacyConnection.accountKey,
      locationId: legacyConnection.locationId,
      locationName: legacyConnection.locationName,
      scopes: legacyConnection.scopes,
      tokenExpiresAt: legacyConnection.tokenExpiresAt,
      installedAt: legacyConnection.installedAt,
    };
  }

  let link: Awaited<ReturnType<typeof getAccountProviderLink>> = null;
  let credential: Awaited<ReturnType<typeof getProviderOAuthCredential>> = null;
  try {
    link = await getAccountProviderLink(accountKey, 'ghl');
  } catch {
    link = null;
  }
  try {
    credential = await getProviderOAuthCredential('ghl');
  } catch {
    credential = null;
  }

  const locationId = link?.locationId || legacyConnection?.locationId || null;
  if (!locationId) return null;

  return {
    accountKey,
    locationId,
    locationName: link?.locationName || legacyConnection?.locationName || null,
    scopes: credential?.scopes || legacyConnection?.scopes || '[]',
    tokenExpiresAt: credential?.tokenExpiresAt || legacyConnection?.tokenExpiresAt,
    installedAt: link?.linkedAt || legacyConnection?.installedAt || credential?.installedAt,
  };
}

function parseStoredScopes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export interface GhlAgencyConnectionStatus {
  connected: boolean;
  source: 'oauth' | 'env' | 'none';
  mode: GhlOAuthMode;
  subjectType?: string | null;
  subjectId?: string | null;
  scopes: string[];
  tokenExpiresAt?: Date | null;
  installedAt?: Date | null;
}

export async function getAgencyConnectionStatus(): Promise<GhlAgencyConnectionStatus> {
  const mode = getGhlOAuthMode();
  const envToken = getAgencyTokenFromEnv();

  try {
    const credential = await getProviderOAuthCredential('ghl');
    if (credential) {
      return {
        connected: true,
        source: 'oauth',
        mode,
        subjectType: credential.subjectType,
        subjectId: credential.subjectId,
        scopes: parseStoredScopes(credential.scopes),
        tokenExpiresAt: credential.tokenExpiresAt,
        installedAt: credential.installedAt,
      };
    }
  } catch (err) {
    if (!envToken) {
      console.warn('Failed to load GHL agency connection status from DB:', err);
    }
  }

  if (envToken) {
    return {
      connected: true,
      source: 'env',
      mode,
      scopes: [],
    };
  }

  return {
    connected: false,
    source: 'none',
    mode,
    scopes: [],
  };
}

export async function disconnectAgencyConnection(): Promise<boolean> {
  return removeConnection(GHL_AGENCY_ACCOUNT_KEY);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => Boolean(asRecord(entry)));
}

function extractLocationRows(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates: unknown[] = [
    payload.locations,
    payload.items,
    payload.data,
    asRecord(payload.data)?.locations,
    asRecord(payload.data)?.items,
    asRecord(payload.data)?.data,
  ];

  for (const candidate of candidates) {
    const rows = asRecordArray(candidate);
    if (rows.length > 0) return rows;
  }

  const maybeLocation = asRecord(payload.location);
  return maybeLocation ? [maybeLocation] : [];
}

function normalizeLocationSummary(row: Record<string, unknown>): Record<string, string> {
  return {
    id: String(row.id || row._id || ''),
    name: String(row.name || row.businessName || ''),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    address: String(row.address || ''),
    city: String(row.city || ''),
    state: String(row.state || ''),
    postalCode: String(row.postalCode || row.postal_code || row.zipCode || ''),
    website: String(row.website || ''),
    timezone: String(row.timezone || ''),
  };
}

export async function listAgencyLocations(input: {
  search?: string;
  limit?: number;
} = {}): Promise<Array<Record<string, string>>> {
  const agency = await getValidAgencyToken();
  if (!agency?.token) {
    throw new Error('GHL agency OAuth is not connected');
  }

  const search = (input.search || '').trim().toLowerCase();
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(Number(input.limit), 200)) : 100;
  const encodedSearch = encodeURIComponent(search);
  const companyId = agency.subjectId || process.env.GHL_AGENCY_COMPANY_ID?.trim() || '';
  const candidates = companyId
    ? [
        `${GHL_BASE}/locations/search?companyId=${companyId}&limit=${limit}${search ? `&query=${encodedSearch}` : ''}`,
        `${GHL_BASE}/locations/search?companyId=${companyId}&limit=${limit}${search ? `&search=${encodedSearch}` : ''}`,
      ]
    : [
        `${GHL_BASE}/locations/search?limit=${limit}${search ? `&query=${encodedSearch}` : ''}`,
        `${GHL_BASE}/locations/search?limit=${limit}${search ? `&search=${encodedSearch}` : ''}`,
      ];

  let lastError = 'Failed to list GHL locations';
  for (const candidate of candidates) {
    const res = await fetch(candidate, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${agency.token}`,
        Version: API_VERSION,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const suffix = text ? `: ${text.slice(0, 180)}` : '';
      lastError = `GHL locations API error (${res.status})${suffix}`;
      continue;
    }

    const payload = await res.json().catch(() => ({}));
    const row = asRecord(payload) || {};
    const rows = extractLocationRows(row);
    let locations = rows.map(normalizeLocationSummary).filter((location) => Boolean(location.id));
    if (search) {
      locations = locations.filter((location) => (
        location.name.toLowerCase().includes(search)
        || location.id.toLowerCase().includes(search)
        || location.email.toLowerCase().includes(search)
      ));
    }
    return locations.slice(0, limit);
  }

  throw new Error(lastError);
}

export async function linkAccountToLocation(input: {
  accountKey: string;
  locationId: string;
  locationName?: string;
}): Promise<{ accountKey: string; locationId: string; locationName: string | null }> {
  const accountKey = input.accountKey.trim();
  const locationId = input.locationId.trim();
  if (!accountKey) throw new Error('accountKey is required');
  if (!locationId) throw new Error('locationId is required');
  if (accountKey === GHL_AGENCY_ACCOUNT_KEY) {
    throw new Error('Agency account key cannot be linked to a location');
  }

  const agency = await getValidAgencyToken();
  if (!agency?.token) {
    throw new Error('GHL agency OAuth is not connected');
  }

  let locationName = (input.locationName || '').trim() || null;
  try {
    const details = await fetchLocationDetails(agency.token, locationId);
    if (details.name) locationName = details.name;
  } catch {
    // Best effort only.
  }

  await upsertAccountProviderLink({
    accountKey,
    provider: 'ghl',
    locationId,
    locationName,
  });

  removeCachedLocationToken(locationId);

  return {
    accountKey,
    locationId,
    locationName,
  };
}

export async function unlinkAccountLocation(accountKeyRaw: string): Promise<boolean> {
  const accountKey = accountKeyRaw.trim();
  if (!accountKey) throw new Error('accountKey is required');
  if (accountKey === GHL_AGENCY_ACCOUNT_KEY) {
    throw new Error('Use agency disconnect endpoint to remove agency OAuth');
  }

  const existing = await getAccountProviderLink(accountKey, 'ghl').catch(() => null);
  const removed = await removeAccountProviderLink(accountKey, 'ghl').catch(() => false);

  if (existing?.locationId) {
    removeCachedLocationToken(existing.locationId);
  }
  return removed;
}
