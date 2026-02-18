// ── ESP Route Helpers ──
// Shared utilities for provider-agnostic API routes.

import '@/lib/esp/init'; // Ensure adapters are registered

import { getAdapterForAccount } from './registry';
import { providerUnsupportedMessage } from './provider-display';
import type { EspAdapter, EspCapabilities, EspCredentials } from './types';

type ResolveSuccess = { adapter: EspAdapter; credentials: EspCredentials };
type ResolveError = { error: string; status: number };
type ResolveOptions = {
  requireCapability?: keyof EspCapabilities;
};

/**
 * Resolve the adapter and credentials for a given account key.
 * Handles provider lookup, optional capability gating, credential resolution,
 * and error formatting in one call.
 */
export async function resolveAdapterAndCredentials(
  accountKey: string,
  options: ResolveOptions = {},
): Promise<ResolveSuccess | ResolveError> {
  try {
    const adapter = await getAdapterForAccount(accountKey);

    if (options.requireCapability && !adapter.capabilities[options.requireCapability]) {
      return {
        error: providerUnsupportedMessage(adapter.provider, String(options.requireCapability)),
        status: 501,
      };
    }

    const credentials = adapter.resolveCredentials
      ? await adapter.resolveCredentials(accountKey)
      : adapter.contacts
        ? await adapter.contacts.resolveCredentials(accountKey)
        : null;

    if (!adapter.resolveCredentials && !adapter.contacts) {
      return {
        error: `${adapter.provider} adapter cannot resolve credentials`,
        status: 501,
      };
    }

    if (!credentials) {
      return { error: `ESP not connected for this account (${adapter.provider})`, status: 404 };
    }

    return { adapter, credentials };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve ESP adapter';
    return { error: message, status: 500 };
  }
}

/**
 * Type guard to check if the resolve result is an error.
 */
export function isResolveError(
  result: ResolveSuccess | ResolveError,
): result is ResolveError {
  return 'error' in result;
}
