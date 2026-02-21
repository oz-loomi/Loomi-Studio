import '@/lib/esp/init';

import { getAdapter, getAdapterForAccount } from '@/lib/esp/registry';
import type { EspProvider } from '@/lib/esp/types';

const GHL_AGENCY_ACCOUNT_KEY = '__ghl_agency__';

export type EspAuthorizationMode = 'account' | 'agency';

function normalizeAuthorizationMode(mode: string | null | undefined): EspAuthorizationMode {
  return (mode || '').trim().toLowerCase() === 'agency' ? 'agency' : 'account';
}

export class EspAuthorizationError extends Error {
  readonly status: number;
  readonly provider?: EspProvider;

  constructor(message: string, status = 500, provider?: EspProvider) {
    super(message);
    this.name = 'EspAuthorizationError';
    this.status = status;
    this.provider = provider;
  }
}

export async function resolveEspAuthorizationUrl(input: {
  accountKey?: string;
  provider?: EspProvider;
  mode?: EspAuthorizationMode | string;
}): Promise<{ provider: EspProvider; url: string; mode: EspAuthorizationMode }> {
  const mode = normalizeAuthorizationMode(input.mode);
  let accountKey = (input.accountKey || '').trim();

  if (mode === 'agency' && !input.provider) {
    throw new EspAuthorizationError('provider query parameter is required for agency OAuth', 400);
  }

  if (mode === 'account' && !accountKey) {
    throw new EspAuthorizationError('accountKey query parameter is required', 400);
  }

  let adapter;
  try {
    adapter = input.provider
      ? getAdapter(input.provider)
      : await getAdapterForAccount(accountKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve ESP provider';
    throw new EspAuthorizationError(message, 400);
  }

  if (!adapter.oauth) {
    throw new EspAuthorizationError(
      `${adapter.provider} does not support OAuth authorization`,
      501,
      adapter.provider,
    );
  }

  if (mode === 'agency') {
    if (adapter.provider !== 'ghl') {
      throw new EspAuthorizationError(
        `${adapter.provider} does not support agency OAuth authorization`,
        501,
        adapter.provider,
      );
    }
    accountKey = GHL_AGENCY_ACCOUNT_KEY;
  }

  try {
    const url = adapter.oauth.getAuthorizationUrl(accountKey);
    return { provider: adapter.provider, url, mode };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build OAuth authorization URL';
    throw new EspAuthorizationError(message, 500, adapter.provider);
  }
}
