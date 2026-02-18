import '@/lib/esp/init';
import { getAdapter, getDefaultEspProvider } from '@/lib/esp/registry';

export type ConnectionType = 'oauth' | 'api-key' | 'none';

type EspConnectionLike = {
  provider?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  installedAt?: Date | null;
};

type OAuthConnectionLike = {
  provider?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  installedAt?: Date | null;
};

function installedAtEpoch(value: Date | null | undefined): number {
  if (!(value instanceof Date)) return Number.NEGATIVE_INFINITY;
  const epoch = value.getTime();
  return Number.isFinite(epoch) ? epoch : Number.NEGATIVE_INFINITY;
}

function authToConnectionType(auth: 'oauth' | 'api-key' | 'both'): ConnectionType {
  if (auth === 'oauth') return 'oauth';
  if (auth === 'api-key') return 'api-key';
  return 'api-key';
}

function normalizeProviderId(provider: string | null | undefined): string {
  return (provider || '').trim().toLowerCase();
}

function resolveProviderConnectionType(provider: string): ConnectionType {
  try {
    const adapter = getAdapter(provider);
    return authToConnectionType(adapter.capabilities.auth);
  } catch {
    return 'api-key';
  }
}

export function buildAccountConnectionMetadata(input: {
  accountProvider?: string | null;
  oauthConnections?: OAuthConnectionLike[] | null;
  espConnections?: EspConnectionLike[] | null;
}) {
  const oauthConnections = Array.isArray(input.oauthConnections)
    ? input.oauthConnections.flatMap((entry) => {
      const provider = normalizeProviderId(entry?.provider);
      if (!provider) return [];
      return [{
        provider,
        locationId: entry.locationId ?? null,
        locationName: entry.locationName ?? null,
        installedAt: entry.installedAt ?? null,
      }];
    })
    : [];

  const espConnections = Array.isArray(input.espConnections)
    ? input.espConnections.flatMap((entry) => {
      const provider = normalizeProviderId(entry?.provider);
      if (!provider) return [];
      return [{
        provider,
        accountId: entry.accountId ?? null,
        accountName: entry.accountName ?? null,
        installedAt: entry.installedAt ?? null,
      }];
    })
    : [];

  const mostRecentProvider = [...oauthConnections, ...espConnections]
    .sort((a, b) => installedAtEpoch(b.installedAt) - installedAtEpoch(a.installedAt))[0]
    ?.provider;
  const defaultProvider = getDefaultEspProvider();
  const activeProvider =
    normalizeProviderId(input.accountProvider)
    || normalizeProviderId(mostRecentProvider)
    || defaultProvider;

  const connectedProviders = new Set<string>();
  for (const connection of oauthConnections) {
    connectedProviders.add(connection.provider);
  }
  for (const connection of espConnections) {
    connectedProviders.add(connection.provider);
  }

  let activeConnection: {
    provider: string;
    connected: boolean;
    connectionType: ConnectionType;
    locationId: string | null;
    accountId: string | null;
    accountName: string | null;
  } = {
    provider: activeProvider,
    connected: false,
    connectionType: 'none',
    locationId: null,
    accountId: null,
    accountName: null,
  };

  const selectedOAuthConnection = oauthConnections.find((entry) => entry.provider === activeProvider);
  if (selectedOAuthConnection) {
    const locationId = selectedOAuthConnection.locationId || null;
    activeConnection = {
      provider: activeProvider,
      connected: true,
      connectionType: 'oauth',
      locationId,
      accountId: locationId,
      accountName: selectedOAuthConnection.locationName || null,
    };
  } else {
    const selectedEspConnection = espConnections.find((entry) => entry.provider === activeProvider);
    if (selectedEspConnection) {
      activeConnection = {
        provider: activeProvider,
        connected: true,
        connectionType: resolveProviderConnectionType(activeProvider),
        locationId: selectedEspConnection.accountId || null,
        accountId: selectedEspConnection.accountId || null,
        accountName: selectedEspConnection.accountName || null,
      };
    }
  }

  return {
    connectedProviders: [...connectedProviders],
    activeEspProvider: activeProvider,
    activeLocationId: activeConnection.locationId,
    activeConnection,
    ...(oauthConnections.length > 0
      ? {
        oauthConnections: oauthConnections.map((entry) => ({
          provider: entry.provider,
          locationId: entry.locationId || null,
          locationName: entry.locationName || null,
          installedAt: entry.installedAt?.toISOString() || null,
        })),
      }
      : {}),
    ...(espConnections.length > 0
      ? {
        espConnections: espConnections.map((entry) => ({
          provider: entry.provider,
          accountId: entry.accountId || null,
          accountName: entry.accountName || null,
          installedAt: entry.installedAt?.toISOString() || null,
        })),
      }
      : {}),
  };
}
