import '@/lib/esp/init';

import type { EspProvider } from '@/lib/esp/types';
import { verifyEspOAuthState } from '@/lib/esp/oauth-state';

/**
 * Resolve provider from provider-agnostic signed OAuth state.
 * This allows callback URLs without provider-specific query params.
 */
export function resolveOAuthProviderFromState(state: string | null | undefined): EspProvider | null {
  const rawState = (state || '').trim();
  if (!rawState) return null;

  // Provider-agnostic signed state
  const parsed = verifyEspOAuthState(rawState);
  if (parsed?.provider) return parsed.provider;

  return null;
}
