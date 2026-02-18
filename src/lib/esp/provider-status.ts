import type { ProviderCatalogEntry } from '@/lib/esp/provider-catalog';
import { normalizeProviderId } from '@/lib/esp/provider-catalog';

export type ProviderConnectionType = 'oauth' | 'api-key' | 'none';

type ActiveConnectionLike = {
  provider?: string | null;
  connected?: boolean | null;
  connectionType?: ProviderConnectionType | string | null;
  locationId?: string | null;
  accountId?: string | null;
  accountName?: string | null;
};

type OAuthConnectionLike = {
  provider?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  installedAt?: string | Date | null;
};

type ApiConnectionLike = {
  provider?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  installedAt?: string | Date | null;
};

export type ProviderStatusAccountLike = {
  activeLocationId?: string | null;
  connectedProviders?: Array<string | null | undefined> | null;
  activeConnection?: ActiveConnectionLike | null;
  oauthConnections?: OAuthConnectionLike[] | null;
  espConnections?: ApiConnectionLike[] | null;
};

export type ResolvedProviderStatus = {
  provider: string;
  connected: boolean;
  connectionType: ProviderConnectionType;
  oauthConnected: boolean;
  locationId?: string;
  locationName?: string;
  scopes: string[];
  installedAt?: string;
  accountId?: string;
  accountName?: string;
};

export type CustomValuesSyncReadiness = {
  requiredScopes: string[];
  hasRequiredScopes: boolean;
  supportsCustomValues: boolean;
  needsReauthorization: boolean;
  readyForSync: boolean;
};

function normalizeConnectionType(value: unknown): ProviderConnectionType | null {
  if (value === 'oauth' || value === 'api-key' || value === 'none') return value;
  return null;
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toInstalledAt(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  return toOptionalString(value);
}

export function createProviderStatusResolver(input: {
  providerCatalog: ProviderCatalogEntry[];
  account: ProviderStatusAccountLike;
}) {
  const providerById = new Map(
    input.providerCatalog.map((entry) => [normalizeProviderId(entry.provider), entry] as const),
  );
  const fallbackConnectedProviders = new Set(
    (input.account.connectedProviders || [])
      .map((provider) => normalizeProviderId(provider))
      .filter(Boolean),
  );

  const activeConnectionProvider = normalizeProviderId(input.account.activeConnection?.provider);
  if (input.account.activeConnection?.connected && activeConnectionProvider) {
    fallbackConnectedProviders.add(activeConnectionProvider);
  }

  const fallbackOauthByProvider = new Map(
    (input.account.oauthConnections || []).flatMap((connection) => {
      const provider = normalizeProviderId(connection.provider);
      return provider ? [[provider, connection] as const] : [];
    }),
  );
  const fallbackApiByProvider = new Map(
    (input.account.espConnections || []).flatMap((connection) => {
      const provider = normalizeProviderId(connection.provider);
      return provider ? [[provider, connection] as const] : [];
    }),
  );

  const getProviderStatus = (providerId: string): ResolvedProviderStatus => {
    const providerKey = normalizeProviderId(providerId);
    const catalogEntry = providerById.get(providerKey);
    const fallbackOauth = fallbackOauthByProvider.get(providerKey);
    const fallbackApi = fallbackApiByProvider.get(providerKey);
    const activeConnection = activeConnectionProvider === providerKey
      ? input.account.activeConnection
      : null;

    const connected = catalogEntry?.connected === true
      || fallbackConnectedProviders.has(providerKey)
      || Boolean(fallbackOauth)
      || Boolean(fallbackApi)
      || activeConnection?.connected === true;

    const fallbackConnectionType = normalizeConnectionType(activeConnection?.connectionType)
      || (fallbackOauth ? 'oauth' : fallbackApi ? 'api-key' : 'none');
    const connectionType = normalizeConnectionType(catalogEntry?.connectionType) || fallbackConnectionType;

    return {
      provider: providerKey,
      connected,
      connectionType,
      oauthConnected: catalogEntry?.oauthConnected === true || connectionType === 'oauth',
      locationId:
        toOptionalString(catalogEntry?.locationId)
        || toOptionalString(fallbackOauth?.locationId)
        || toOptionalString(activeConnection?.locationId)
        || toOptionalString(input.account.activeLocationId),
      locationName: toOptionalString(catalogEntry?.locationName) || toOptionalString(fallbackOauth?.locationName),
      scopes: Array.isArray(catalogEntry?.scopes) ? catalogEntry.scopes.map(String) : [],
      installedAt:
        toOptionalString(catalogEntry?.installedAt)
        || toInstalledAt(fallbackOauth?.installedAt)
        || toInstalledAt(fallbackApi?.installedAt),
      accountId:
        toOptionalString(catalogEntry?.accountId)
        || toOptionalString(fallbackApi?.accountId)
        || toOptionalString(activeConnection?.accountId),
      accountName:
        toOptionalString(catalogEntry?.accountName)
        || toOptionalString(fallbackApi?.accountName)
        || toOptionalString(activeConnection?.accountName),
    };
  };

  const hasAnyProviderConnection = input.providerCatalog.some((entry) => (
    getProviderStatus(entry.provider).connected
  )) || fallbackConnectedProviders.size > 0;

  return {
    providerById,
    fallbackConnectedProviders,
    getProviderStatus,
    hasAnyProviderConnection,
  };
}

export function resolveCustomValuesSyncReadiness(input: {
  supportsCustomValues: boolean;
  providerStatus: Pick<ResolvedProviderStatus, 'connected' | 'oauthConnected' | 'scopes'>;
  requiredScopes?: string[] | null;
}): CustomValuesSyncReadiness {
  const requiredScopes = Array.isArray(input.requiredScopes)
    ? input.requiredScopes
    : [];
  const hasRequiredScopes =
    requiredScopes.length === 0
      || requiredScopes.every((scope) => input.providerStatus.scopes.includes(scope));
  const needsReauthorization =
    input.supportsCustomValues
      && input.providerStatus.oauthConnected
      && requiredScopes.length > 0
      && !hasRequiredScopes;

  return {
    requiredScopes,
    hasRequiredScopes,
    supportsCustomValues: input.supportsCustomValues,
    needsReauthorization,
    readyForSync: input.supportsCustomValues && input.providerStatus.connected && !needsReauthorization,
  };
}
