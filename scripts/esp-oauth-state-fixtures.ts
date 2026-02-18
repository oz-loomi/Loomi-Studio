import crypto from 'crypto';
import '@/lib/esp/init';
import { getAdapter, getRegisteredProviders } from '@/lib/esp/registry';
import { resolveOAuthProviderFromState } from '@/lib/esp/oauth-provider-resolution';
import { verifyEspOAuthState } from '@/lib/esp/oauth-state';

const FIXTURE_ACCOUNT_KEY = '__oauth-state-fixture__';

function ensureStateSecrets() {
  const tokenSecret = (process.env.ESP_TOKEN_SECRET || '').trim();
  const stateSecret = (process.env.ESP_OAUTH_STATE_SECRET || '').trim();
  if (!tokenSecret && !stateSecret) {
    process.env.ESP_OAUTH_STATE_SECRET = crypto.randomBytes(32).toString('hex');
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function tamperState(state: string): string {
  if (!state.includes('.')) return `${state}x`;
  const [payloadB64, sig] = state.split('.');
  // Mutate the first signature character to avoid base64url trailing-bit collisions.
  const tamperedSig = sig.length > 0
    ? `${sig[0] === 'A' ? 'B' : 'A'}${sig.slice(1)}`
    : 'A';
  return `${payloadB64}.${tamperedSig}`;
}

function validateProviderState(provider: string) {
  const adapter = getAdapter(provider);
  if (!adapter.oauth) return;

  const state = adapter.oauth.signState(FIXTURE_ACCOUNT_KEY);
  const providerFromState = resolveOAuthProviderFromState(state);
  const parsed = verifyEspOAuthState(state, { expectedProvider: provider });
  const verified = adapter.oauth.verifyState(state);

  assert(providerFromState === provider, `State should resolve provider "${provider}"`);
  assert(parsed?.provider === provider, `State payload provider mismatch for "${provider}"`);
  assert(parsed?.accountKey === FIXTURE_ACCOUNT_KEY, `State payload account mismatch for "${provider}"`);
  assert(verified?.accountKey === FIXTURE_ACCOUNT_KEY, `Adapter verifyState failed for "${provider}"`);

  const tampered = tamperState(state);
  assert(resolveOAuthProviderFromState(tampered) === null, `Tampered state should fail provider resolution for "${provider}"`);
  assert(verifyEspOAuthState(tampered) === null, `Tampered state should fail payload verification for "${provider}"`);
  assert(adapter.oauth.verifyState(tampered) === null, `Tampered state should fail adapter verification for "${provider}"`);
}

function main() {
  ensureStateSecrets();
  const oauthProviders = getRegisteredProviders().filter((provider) => Boolean(getAdapter(provider).oauth));
  assert(oauthProviders.length > 0, 'No OAuth-capable providers are registered');

  for (const provider of oauthProviders) {
    validateProviderState(provider);
  }

  console.log(`OAuth state fixtures passed for providers: ${oauthProviders.join(', ')}`);
}

main();
