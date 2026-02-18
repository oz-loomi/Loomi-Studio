// ── ESP Adapter Registry ──
// Maps account keys to the correct adapter based on the account's espProvider field.

import { prisma } from '@/lib/prisma';
import type { EspAdapter, EspProvider, EspCredentials } from './types';

// ── Internal state ──

const adapters = new Map<EspProvider, EspAdapter>();

// ── Public API ──

/**
 * Register an ESP adapter. Called once per provider at app startup.
 */
export function registerAdapter(adapter: EspAdapter): void {
  adapters.set(adapter.provider, adapter);
}

/**
 * Get the adapter for a specific provider.
 */
export function getAdapter(provider: EspProvider): EspAdapter {
  const adapter = adapters.get(provider);
  if (!adapter) {
    throw new Error(`No ESP adapter registered for provider "${provider}"`);
  }
  return adapter;
}

/**
 * List all registered providers.
 */
export function getRegisteredProviders(): EspProvider[] {
  return Array.from(adapters.keys());
}

/**
 * Resolve the default provider when an account has no explicit espProvider.
 * Resolution order:
 * 1) `LOOMI_DEFAULT_ESP_PROVIDER` / `DEFAULT_ESP_PROVIDER` env (if registered)
 * 2) first registered provider
 */
export function getDefaultEspProvider(): EspProvider {
  const providers = getRegisteredProviders();

  const configured = (
    process.env.LOOMI_DEFAULT_ESP_PROVIDER ||
    process.env.DEFAULT_ESP_PROVIDER ||
    ''
  ).trim().toLowerCase() as EspProvider;

  if (configured) {
    if (adapters.has(configured)) {
      return configured;
    }
    throw new Error(
      `Configured default ESP provider "${configured}" is not registered. Registered providers: ${providers.join(', ') || '(none)'}`,
    );
  }

  if (providers.length > 0) {
    return providers[0];
  }

  throw new Error(
    'No ESP adapters are registered. Import "@/lib/esp/init" before resolving default provider.',
  );
}

async function resolveMostRecentConnectedProvider(accountKey: string): Promise<EspProvider | null> {
  try {
    const [oauthConnection, apiKeyConnection] = await Promise.all([
      prisma.espOAuthConnection.findFirst({
        where: { accountKey },
        select: { provider: true, installedAt: true },
        orderBy: { installedAt: 'desc' },
      }),
      prisma.espConnection.findFirst({
        where: { accountKey },
        select: { provider: true, installedAt: true },
        orderBy: { installedAt: 'desc' },
      }),
    ]);

    const candidates = [oauthConnection, apiKeyConnection]
      .filter((candidate): candidate is { provider: string; installedAt: Date } => Boolean(candidate))
      .map((candidate) => ({
        provider: candidate.provider.trim().toLowerCase() as EspProvider,
        installedAt: candidate.installedAt,
      }))
      .filter((candidate) => adapters.has(candidate.provider))
      .sort((a, b) => b.installedAt.getTime() - a.installedAt.getTime());

    return candidates[0]?.provider || null;
  } catch {
    // If connection tables are not available yet, fall back to configured default provider.
    return null;
  }
}

/**
 * Look up which ESP provider an account uses.
 * Resolution order:
 * 1) account.espProvider (when present and registered)
 * 2) most recently installed connected provider for that account
 * 3) configured/default provider
 */
export async function getAccountProvider(accountKey: string): Promise<EspProvider> {
  const account = await prisma.account.findUnique({
    where: { key: accountKey },
    select: { espProvider: true },
  });

  const explicitProvider = (account?.espProvider || '').trim().toLowerCase() as EspProvider;
  if (explicitProvider) {
    if (adapters.has(explicitProvider)) {
      return explicitProvider;
    }
    throw new Error(
      `Account "${accountKey}" is configured with unregistered ESP provider "${explicitProvider}"`,
    );
  }

  const connectedProvider = await resolveMostRecentConnectedProvider(accountKey);
  return connectedProvider || getDefaultEspProvider();
}

/**
 * Get the adapter for a specific account (resolves provider from DB).
 */
export async function getAdapterForAccount(accountKey: string): Promise<EspAdapter> {
  const provider = await getAccountProvider(accountKey);
  return getAdapter(provider);
}

/**
 * Resolve ESP credentials for a given account key.
 * Looks up the account's provider, then delegates to the correct adapter.
 */
export async function resolveEspCredentials(
  accountKey: string,
): Promise<EspCredentials | null> {
  const provider = await getAccountProvider(accountKey);
  const adapter = adapters.get(provider);
  if (!adapter?.contacts) {
    throw new Error(`ESP adapter "${provider}" is not registered or missing contacts capability`);
  }
  return adapter.contacts.resolveCredentials(accountKey);
}
