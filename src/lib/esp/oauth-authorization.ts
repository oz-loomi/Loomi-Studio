import '@/lib/esp/init';

import { getAdapter, getAdapterForAccount } from '@/lib/esp/registry';
import type { EspProvider } from '@/lib/esp/types';

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
}): Promise<{ provider: EspProvider; url: string }> {
  const accountKey = (input.accountKey || '').trim();
  if (!accountKey) {
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

  try {
    const url = adapter.oauth.getAuthorizationUrl(accountKey);
    return { provider: adapter.provider, url };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build OAuth authorization URL';
    throw new EspAuthorizationError(message, 500, adapter.provider);
  }
}
