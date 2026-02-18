export interface ProviderScopedRecord {
  provider?: string | null;
  locationId?: string | null;
  accountKey?: string | null;
}

export interface AccountLocationRef {
  locationId?: string | null;
}

export function normalizeProviderId(provider: string | null | undefined): string {
  return (provider || '').trim().toLowerCase();
}

export function resolveProviderId(
  record: ProviderScopedRecord,
  accountProviders?: Record<string, string>,
  fallback = '',
): string {
  const direct = normalizeProviderId(record.provider);
  if (direct) return direct;

  const accountKey = record.accountKey;
  if (accountKey) {
    const fromAccount = normalizeProviderId(accountProviders?.[accountKey]);
    if (fromAccount) return fromAccount;
  }

  return fallback;
}

export function resolveLocationId(
  record: ProviderScopedRecord,
  accountMeta?: Record<string, AccountLocationRef | undefined>,
): string | null {
  if (record.locationId) return record.locationId;
  const accountKey = record.accountKey;
  if (accountKey) {
    return accountMeta?.[accountKey]?.locationId || null;
  }
  return null;
}
