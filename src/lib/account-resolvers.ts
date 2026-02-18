export interface AccountResolverInput {
  dealer?: string | null;
  espProvider?: string | null;
  activeEspProvider?: string | null;
  activeLocationId?: string | null;
  activeConnection?: {
    provider?: string | null;
    locationId?: string | null;
  } | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  website?: string | null;
  timezone?: string | null;
}

function pickFirstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function resolveAccountProvider(
  account: AccountResolverInput | null | undefined,
  fallback: string,
): string {
  return (
    pickFirstNonEmpty(
      account?.activeConnection?.provider,
      account?.activeEspProvider,
      account?.espProvider,
      fallback,
    ) || fallback
  );
}

export function resolveAccountLocationId(account: AccountResolverInput | null | undefined): string | null {
  return pickFirstNonEmpty(
    account?.activeLocationId,
    account?.activeConnection?.locationId,
  );
}

export function resolveAccountDealerName(
  account: AccountResolverInput | null | undefined,
  fallback = '',
): string {
  return pickFirstNonEmpty(account?.dealer, fallback) || fallback;
}

export function resolveAccountEmail(account: AccountResolverInput | null | undefined, fallback = ''): string {
  return pickFirstNonEmpty(account?.email, fallback) || fallback;
}

export function resolveAccountPhone(account: AccountResolverInput | null | undefined, fallback = ''): string {
  return pickFirstNonEmpty(account?.phone, fallback) || fallback;
}

export function resolveAccountAddress(
  account: AccountResolverInput | null | undefined,
  fallback = '',
): string {
  return pickFirstNonEmpty(account?.address, fallback) || fallback;
}

export function resolveAccountCity(account: AccountResolverInput | null | undefined, fallback = ''): string {
  return pickFirstNonEmpty(account?.city, fallback) || fallback;
}

export function resolveAccountState(account: AccountResolverInput | null | undefined, fallback = ''): string {
  return pickFirstNonEmpty(account?.state, fallback) || fallback;
}

export function resolveAccountPostalCode(
  account: AccountResolverInput | null | undefined,
  fallback = '',
): string {
  return pickFirstNonEmpty(account?.postalCode, fallback) || fallback;
}

export function resolveAccountWebsite(account: AccountResolverInput | null | undefined, fallback = ''): string {
  return pickFirstNonEmpty(account?.website, fallback) || fallback;
}

export function resolveAccountTimezone(account: AccountResolverInput | null | undefined, fallback = ''): string {
  return pickFirstNonEmpty(account?.timezone, fallback) || fallback;
}

export function formatAccountCityState(account: AccountResolverInput | null | undefined): string | null {
  const city = resolveAccountCity(account);
  const state = resolveAccountState(account);
  const parts = [city, state].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}
