import type { EspCapabilities } from '@/lib/esp/types';

export type ProviderCatalogEntry = {
  provider: string;
  capabilities: EspCapabilities;
  oauthSupported: boolean;
  credentialConnectSupported?: boolean;
  validationSupported?: boolean;
  businessDetailsRefreshSupported?: boolean;
  businessDetailsSyncSupported?: boolean;
  connected: boolean;
  connectionType: 'oauth' | 'api-key' | 'none';
  oauthConnected?: boolean;
  locationId?: string;
  locationName?: string;
  scopes?: string[];
  tokenExpiresAt?: string;
  accountId?: string;
  accountName?: string;
  installedAt?: string;
  activeForAccount?: boolean;
  webhookEndpoints?: Record<string, string>;
};

export type ProviderCatalogPayload = {
  providers?: ProviderCatalogEntry[];
  accountKey?: string;
  accountProvider?: string | null;
};

export const EMPTY_PROVIDER_CAPABILITIES: EspCapabilities = {
  auth: 'both',
  contacts: false,
  campaigns: false,
  workflows: false,
  messages: false,
  users: false,
  webhooks: false,
  customValues: false,
};

function normalizeWebhookEndpoints(value: unknown): ProviderCatalogEntry['webhookEndpoints'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const normalized = Object.entries(row).reduce<Record<string, string>>((acc, [family, endpoint]) => {
    const key = family.trim().toLowerCase();
    const value = typeof endpoint === 'string' ? endpoint.trim() : '';
    if (!key || !value) return acc;
    acc[key] = value;
    return acc;
  }, {});

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizeProviderId(provider: unknown): string {
  return typeof provider === 'string' ? provider.trim().toLowerCase() : '';
}

export function createFallbackProviderEntry(provider: string): ProviderCatalogEntry {
  return {
    provider,
    capabilities: { ...EMPTY_PROVIDER_CAPABILITIES },
    oauthSupported: false,
    credentialConnectSupported: false,
    validationSupported: false,
    businessDetailsRefreshSupported: false,
    businessDetailsSyncSupported: false,
    connected: false,
    connectionType: 'none',
  };
}

export function extractProviderCatalog(
  payload: ProviderCatalogPayload | null | undefined,
): ProviderCatalogEntry[] {
  const entries = Array.isArray(payload?.providers) ? payload.providers : [];
  return entries.flatMap((entry) => {
    const provider = normalizeProviderId(entry?.provider);
    if (!provider) return [];

    return [{
      ...createFallbackProviderEntry(provider),
      ...entry,
      provider,
      capabilities: entry?.capabilities || { ...EMPTY_PROVIDER_CAPABILITIES },
      oauthSupported: entry?.oauthSupported === true,
      credentialConnectSupported: entry?.credentialConnectSupported === true,
      validationSupported: entry?.validationSupported === true,
      businessDetailsRefreshSupported: entry?.businessDetailsRefreshSupported === true,
      businessDetailsSyncSupported: entry?.businessDetailsSyncSupported === true,
      connected: entry?.connected === true,
      connectionType:
        entry?.connectionType === 'oauth' || entry?.connectionType === 'api-key'
          ? entry.connectionType
          : 'none',
      scopes: Array.isArray(entry?.scopes) ? entry.scopes.map(String) : [],
      webhookEndpoints: normalizeWebhookEndpoints(entry?.webhookEndpoints),
    }];
  });
}

export function mergeProviderCatalog(
  primary: ProviderCatalogEntry[],
  secondary: ProviderCatalogEntry[],
): ProviderCatalogEntry[] {
  const byProvider = new Map<string, ProviderCatalogEntry>();
  const order: string[] = [];

  for (const entry of secondary) {
    const provider = normalizeProviderId(entry.provider);
    if (!provider) continue;
    if (!byProvider.has(provider)) order.push(provider);
    byProvider.set(provider, entry);
  }
  for (const entry of primary) {
    const provider = normalizeProviderId(entry.provider);
    if (!provider) continue;
    if (!byProvider.has(provider)) order.push(provider);
    byProvider.set(provider, {
      ...(byProvider.get(provider) || createFallbackProviderEntry(provider)),
      ...entry,
      provider,
    });
  }

  return order
    .map((provider) => byProvider.get(provider))
    .filter((entry): entry is ProviderCatalogEntry => Boolean(entry));
}

export async function fetchProviderCatalogPayload(
  url: string,
): Promise<ProviderCatalogPayload | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

export async function fetchProviderCatalog(url: string): Promise<ProviderCatalogEntry[]> {
  const payload = await fetchProviderCatalogPayload(url);
  return extractProviderCatalog(payload);
}
