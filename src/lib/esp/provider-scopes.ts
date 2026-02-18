import {
  extractProviderCatalog,
  normalizeProviderId,
  type ProviderCatalogEntry,
  type ProviderCatalogPayload,
} from '@/lib/esp/provider-catalog';

export type ProviderScopesMap = Record<string, string[]>;

export function collectOAuthProviderIds(entries: ProviderCatalogEntry[]): string[] {
  return [...new Set(
    entries.flatMap((entry) => (
      entry.oauthSupported
        ? [normalizeProviderId(entry.provider)]
        : []
    )).filter(Boolean),
  )];
}

export function missingProviderScopes(
  providerIds: string[],
  scopesByProvider: ProviderScopesMap,
): string[] {
  return providerIds.filter((provider) => !(provider in scopesByProvider));
}

async function fetchRequiredScopesForProvider(provider: string): Promise<string[]> {
  try {
    const res = await fetch(
      `/api/esp/connections/required-scopes?provider=${encodeURIComponent(provider)}`,
    );
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data?.scopes)
      ? data.scopes.map((scope: unknown) => String(scope))
      : [];
  } catch {
    return [];
  }
}

export async function fetchRequiredScopesMap(providerIds: string[]): Promise<ProviderScopesMap> {
  const normalizedProviderIds = [...new Set(
    providerIds.map((provider) => normalizeProviderId(provider)).filter(Boolean),
  )];
  const entries = await Promise.all(
    normalizedProviderIds.map(async (provider) => [provider, await fetchRequiredScopesForProvider(provider)] as const),
  );
  return Object.fromEntries(entries);
}

export async function fetchRequiredScopesByCatalogUrl(
  catalogUrl = '/api/esp/providers',
): Promise<ProviderScopesMap> {
  try {
    const res = await fetch(catalogUrl);
    if (!res.ok) return {};
    const payload = await res.json().catch(() => ({ providers: [] }));
    const entries = extractProviderCatalog(payload as ProviderCatalogPayload);
    const oauthProviders = collectOAuthProviderIds(entries);
    return fetchRequiredScopesMap(oauthProviders);
  } catch {
    return {};
  }
}
