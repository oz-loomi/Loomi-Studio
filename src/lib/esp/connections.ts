import { prisma } from '@/lib/prisma';
import type { EspCapabilities, EspConnectInput, EspProvider } from '@/lib/esp/types';
import '@/lib/esp/init';
import { getAdapter, getDefaultEspProvider, getRegisteredProviders } from '@/lib/esp/registry';
import { listOAuthConnections } from '@/lib/esp/oauth-connections';
import { listApiKeyConnections } from '@/lib/esp/api-key-connections';
import { listAccountProviderLinks } from '@/lib/esp/account-provider-links';
import { listProviderOAuthCredentials } from '@/lib/esp/provider-oauth-credentials';

type ProviderWithAny = EspProvider | 'any';

export interface EspProviderStatus {
  provider: EspProvider;
  connected: boolean;
  connectionType: 'oauth' | 'api-key' | 'none';
}

export interface GenericConnectionStatus extends EspProviderStatus {
  installedAt?: string;
  accountId?: string;
  accountName?: string;
  oauthConnected?: boolean;
  locationId?: string;
  locationName?: string;
  scopes?: string[];
  tokenExpiresAt?: string;
  capabilities?: EspCapabilities;
}

export interface EspConnectionsStatus {
  accountKey: string;
  accountProvider: EspProvider;
  connectedProviders: EspProvider[];
  providers: Record<string, GenericConnectionStatus>;
}

export interface DisconnectResult {
  success: true;
  provider: EspProvider;
  removed: boolean;
}

export interface ConnectResult {
  success: true;
  provider: EspProvider;
  accountId?: string;
  accountName?: string;
}

export class EspConnectionError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'EspConnectionError';
    this.status = status;
  }
}

function parseScopes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function authToConnectionType(auth: 'oauth' | 'api-key' | 'both'): EspProviderStatus['connectionType'] {
  if (auth === 'oauth') return 'oauth';
  if (auth === 'api-key') return 'api-key';
  return 'api-key';
}

function normalizeProvider(provider: string | null | undefined): EspProvider | null {
  const normalized = (provider || '').trim().toLowerCase();
  return normalized ? (normalized as EspProvider) : null;
}

function installedAtEpoch(value: Date | null | undefined): number {
  if (!(value instanceof Date)) return Number.NEGATIVE_INFINITY;
  const epoch = value.getTime();
  return Number.isFinite(epoch) ? epoch : Number.NEGATIVE_INFINITY;
}

function parseInstalledAt(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? epoch : Number.NEGATIVE_INFINITY;
}

function pickMostRecentConnectedProvider(
  status: EspConnectionsStatus,
  excluded: ReadonlySet<EspProvider> = new Set(),
): EspProvider | null {
  const candidates = status.connectedProviders
    .filter((provider) => !excluded.has(provider))
    .map((provider) => ({
      provider,
      installedAt: parseInstalledAt(status.providers[provider]?.installedAt),
    }))
    .sort((a, b) => b.installedAt - a.installedAt);

  return candidates[0]?.provider || null;
}

async function resolveProviderForDisconnect(
  accountKey: string,
  provider: ProviderWithAny,
): Promise<EspProvider> {
  if (provider !== 'any') return provider;

  const status = await getEspConnectionsStatus(accountKey);
  const preferred = status.accountProvider;

  if (preferred && status.providers[preferred]?.connected) {
    return preferred;
  }
  const mostRecentConnectedProvider = pickMostRecentConnectedProvider(status);
  if (mostRecentConnectedProvider) {
    return mostRecentConnectedProvider;
  }
  if (preferred && status.providers[preferred]) {
    return preferred;
  }
  return getDefaultEspProvider();
}

async function resolveFallbackProviderAfterDisconnect(
  accountKey: string,
  removedProvider: EspProvider,
): Promise<EspProvider> {
  const status = await getEspConnectionsStatus(accountKey);
  const nextProvider = pickMostRecentConnectedProvider(status, new Set([removedProvider]));
  if (nextProvider) {
    return nextProvider;
  }
  return getDefaultEspProvider();
}

function getAdapterOrThrow(
  provider: EspProvider,
): ReturnType<typeof getAdapter> {
  try {
    return getAdapter(provider);
  } catch (err) {
    const message = err instanceof Error ? err.message : `Provider "${provider}" is not registered`;
    throw new EspConnectionError(message, 400);
  }
}

async function disconnectViaAdapter(accountKey: string, provider: EspProvider): Promise<boolean> {
  const adapter = getAdapterOrThrow(provider);
  if (adapter.connection) {
    return adapter.connection.disconnect(accountKey);
  }
  if (adapter.oauth) {
    return adapter.oauth.removeConnection(accountKey);
  }

  return false;
}

async function connectViaAdapter(
  provider: EspProvider,
  input: EspConnectInput,
): Promise<{ provider: EspProvider; accountId?: string; accountName?: string }> {
  const adapter = getAdapterOrThrow(provider);
  if (!adapter.connection) {
    if (adapter.oauth) {
      throw new EspConnectionError(
        `${provider} uses OAuth. Start with /api/esp/connections/authorize.`,
        501,
      );
    }
    throw new EspConnectionError(
      `${provider} connect flow is not supported by this endpoint`,
      501,
    );
  }

  const result = await adapter.connection.connect(input);
  return {
    provider: adapter.provider,
    accountId: result.accountId,
    accountName: result.accountName,
  };
}

function deriveConnectionErrorStatus(message: string): number {
  const statusMatch = /\((\d{3})\)/.exec(message);
  if (statusMatch) return Number(statusMatch[1]);
  if (message.includes('validation failed')) return 401;
  if (message.endsWith('is required')) return 400;
  return 500;
}

export async function getEspConnectionsStatus(accountKey: string): Promise<EspConnectionsStatus> {
  const [account, oauthConnections, espConnections, accountProviderLinks, providerOAuthCredentials] = await Promise.all([
    prisma.account.findUnique({
      where: { key: accountKey },
      select: {
        espProvider: true,
      },
    }),
    listOAuthConnections({ accountKeys: [accountKey] }),
    listApiKeyConnections({ accountKeys: [accountKey] }),
    listAccountProviderLinks({ accountKeys: [accountKey] }).catch(() => []),
    listProviderOAuthCredentials().catch(() => []),
  ]);

  const oauthByProvider = new Map(
    oauthConnections.map((connection) => [connection.provider, connection]),
  );
  const linkByProvider = new Map(
    accountProviderLinks.map((link) => [link.provider, link]),
  );
  const credentialByProvider = new Map(
    providerOAuthCredentials.map((credential) => [credential.provider, credential]),
  );

  const providers: Record<string, GenericConnectionStatus> = {};
  for (const provider of getRegisteredProviders()) {
    const adapter = getAdapter(provider);
    const oauthConnection = oauthByProvider.get(provider);
    const accountProviderLink = linkByProvider.get(provider);
    const providerCredential = credentialByProvider.get(provider);
    const supportsOAuth = adapter.capabilities.auth === 'oauth' || adapter.capabilities.auth === 'both';
    const hasLinkedLocation = Boolean(accountProviderLink?.locationId);
    const hasProviderCredential = Boolean(providerCredential)
      || (provider === 'ghl' && Boolean(process.env.GHL_AGENCY_TOKEN?.trim()));
    const oauthConnected = supportsOAuth && Boolean(
      oauthConnection || (hasLinkedLocation && hasProviderCredential),
    );

    providers[provider] = {
      provider,
      connected: oauthConnected,
      connectionType: oauthConnected ? 'oauth' : 'none',
      oauthConnected,
      locationId: oauthConnection?.locationId || accountProviderLink?.locationId || undefined,
      locationName: oauthConnection?.locationName || accountProviderLink?.locationName || undefined,
      scopes: parseScopes(providerCredential?.scopes || oauthConnection?.scopes),
      installedAt:
        oauthConnection?.installedAt?.toISOString()
        || accountProviderLink?.linkedAt?.toISOString(),
      tokenExpiresAt:
        oauthConnection?.tokenExpiresAt?.toISOString()
        || providerCredential?.tokenExpiresAt?.toISOString(),
      capabilities: adapter.capabilities,
    };
  }

  // Provider-agnostic API-key connections (one row per account+provider).
  for (const espConnection of espConnections) {
    const connectedEspProvider = espConnection.provider as EspProvider;
    if (!connectedEspProvider || !providers[connectedEspProvider]) continue;

    let auth: 'oauth' | 'api-key' | 'both' = 'api-key';
    try {
      const adapter = getAdapter(connectedEspProvider);
      auth = adapter.capabilities.auth;
    } catch {
      auth = 'api-key';
    }

    const supportsApiKey = auth === 'api-key' || auth === 'both';
    if (!supportsApiKey) {
      continue;
    }

    const existing = providers[connectedEspProvider];
    const hasOAuthConnection = existing.connectionType === 'oauth';
    if (hasOAuthConnection && auth === 'both') {
      providers[connectedEspProvider] = {
        ...existing,
        accountId: existing.accountId ?? espConnection.accountId ?? undefined,
        accountName: existing.accountName ?? espConnection.accountName ?? undefined,
        installedAt: existing.installedAt ?? espConnection.installedAt?.toISOString(),
      };
      continue;
    }

    const connectionType: EspProviderStatus['connectionType'] = authToConnectionType(auth);
    providers[connectedEspProvider] = {
      ...existing,
      provider: connectedEspProvider,
      connected: true,
      connectionType,
      accountId: espConnection.accountId ?? undefined,
      accountName: espConnection.accountName ?? undefined,
      installedAt: espConnection.installedAt?.toISOString(),
    };
  }

  const connectedProviders = Object.values(providers)
    .filter((status) => status.connected)
    .map((status) => status.provider);

  const registeredProviders = new Set(getRegisteredProviders());
  const explicitProvider = normalizeProvider(account?.espProvider);
  const explicitRegisteredProvider =
    explicitProvider && registeredProviders.has(explicitProvider)
      ? explicitProvider
      : null;

  const mostRecentConnectedProvider = [
    ...oauthConnections.map((connection) => ({
      provider: connection.provider,
      installedAt: connection.installedAt,
    })),
    ...espConnections.map((connection) => ({
      provider: connection.provider,
      installedAt: connection.installedAt,
    })),
    ...accountProviderLinks.map((link) => ({
      provider: link.provider,
      installedAt: link.linkedAt,
    })),
  ]
    .flatMap((connection) => {
      const provider = normalizeProvider(connection.provider);
      if (!provider || !registeredProviders.has(provider)) return [];
      return [{ provider, installedAt: connection.installedAt }];
    })
    .sort((a, b) => installedAtEpoch(b.installedAt) - installedAtEpoch(a.installedAt))[0]
    ?.provider;

  return {
    accountKey,
    accountProvider: explicitRegisteredProvider || mostRecentConnectedProvider || getDefaultEspProvider(),
    connectedProviders,
    providers,
  };
}

export async function disconnectEspConnection(input: {
  accountKey: string;
  provider: ProviderWithAny;
}): Promise<DisconnectResult> {
  const accountKey = input.accountKey.trim();
  if (!accountKey) {
    throw new EspConnectionError('accountKey is required', 400);
  }
  const provider = await resolveProviderForDisconnect(accountKey, input.provider);
  const accountBefore = await prisma.account.findUnique({
    where: { key: accountKey },
    select: { espProvider: true },
  });

  const removed = await disconnectViaAdapter(accountKey, provider);

  if (removed && (accountBefore?.espProvider as EspProvider | undefined) === provider) {
    const fallbackProvider = await resolveFallbackProviderAfterDisconnect(accountKey, provider);
    if (fallbackProvider !== provider) {
      await prisma.account.update({
        where: { key: accountKey },
        data: { espProvider: fallbackProvider },
      });
    }
  }

  return {
    success: true,
    provider,
    removed,
  };
}

export async function connectEspConnection(input: {
  accountKey: string;
  provider: EspProvider;
  apiKey?: string;
}): Promise<ConnectResult> {
  const { provider, apiKey } = input;
  const accountKey = input.accountKey.trim();
  if (!accountKey) {
    throw new EspConnectionError('accountKey is required', 400);
  }

  try {
    const result = await connectViaAdapter(provider, {
      accountKey,
      apiKey,
    });

    // Keep the account's active provider aligned with the successful connection.
    await prisma.account.update({
      where: { key: accountKey },
      data: { espProvider: result.provider },
    });

    return {
      success: true,
      provider: result.provider,
      accountId: result.accountId,
      accountName: result.accountName,
    };
  } catch (err) {
    if (err instanceof EspConnectionError) {
      throw err;
    }

    const message = err instanceof Error ? err.message : 'Failed to connect provider';
    const status = deriveConnectionErrorStatus(message);
    throw new EspConnectionError(message, status);
  }
}
