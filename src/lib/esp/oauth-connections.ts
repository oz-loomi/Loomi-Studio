import { prisma } from '@/lib/prisma';
import type { EspProvider } from '@/lib/esp/types';

export interface OAuthConnectionRecord {
  accountKey: string;
  provider: EspProvider;
  locationId: string | null;
  locationName: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  scopes: string;
  installedAt: Date;
  updatedAt: Date;
}

function isMissingEspOAuthTableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes('EspOAuthConnection') &&
    /does not exist|no such table/i.test(err.message)
  );
}

function missingOAuthTableError(): Error {
  return new Error('EspOAuthConnection table is required. Run database migrations.');
}

function mapUnifiedConnection(connection: {
  accountKey: string;
  provider: string;
  locationId: string | null;
  locationName: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  scopes: string;
  installedAt: Date;
  updatedAt: Date;
}): OAuthConnectionRecord {
  return {
    accountKey: connection.accountKey,
    provider: connection.provider as EspProvider,
    locationId: connection.locationId,
    locationName: connection.locationName,
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    tokenExpiresAt: connection.tokenExpiresAt,
    scopes: connection.scopes,
    installedAt: connection.installedAt,
    updatedAt: connection.updatedAt,
  };
}

export async function getOAuthConnection(
  accountKey: string,
  provider: EspProvider,
): Promise<OAuthConnectionRecord | null> {
  try {
    const unified = await prisma.espOAuthConnection.findUnique({
      where: {
        accountKey_provider: {
          accountKey,
          provider,
        },
      },
    });
    if (unified) return mapUnifiedConnection(unified);
    return null;
  } catch (err) {
    if (isMissingEspOAuthTableError(err)) throw missingOAuthTableError();
    throw err;
  }
}

export async function listOAuthConnections(input: {
  provider?: EspProvider;
  accountKeys?: string[];
} = {}): Promise<OAuthConnectionRecord[]> {
  const { provider, accountKeys } = input;
  if (Array.isArray(accountKeys) && accountKeys.length === 0) {
    return [];
  }
  const hasKeyFilter = Array.isArray(accountKeys) && accountKeys.length > 0;

  try {
    const unified = await prisma.espOAuthConnection.findMany({
      where: {
        ...(provider ? { provider } : {}),
        ...(hasKeyFilter ? { accountKey: { in: accountKeys } } : {}),
      },
      orderBy: [{ accountKey: 'asc' }, { provider: 'asc' }],
    });
    return unified.map(mapUnifiedConnection);
  } catch (err) {
    if (isMissingEspOAuthTableError(err)) throw missingOAuthTableError();
    throw err;
  }
}

export async function upsertOAuthConnection(input: {
  accountKey: string;
  provider: EspProvider;
  locationId?: string | null;
  locationName?: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  scopes?: string;
  installedAt?: Date;
}): Promise<void> {
  const {
    accountKey,
    provider,
    locationId,
    locationName,
    accessToken,
    refreshToken,
    tokenExpiresAt,
    scopes,
    installedAt,
  } = input;

  try {
    await prisma.espOAuthConnection.upsert({
      where: {
        accountKey_provider: {
          accountKey,
          provider,
        },
      },
      create: {
        accountKey,
        provider,
        locationId: locationId ?? null,
        locationName: locationName ?? null,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        scopes: scopes ?? '[]',
        ...(installedAt ? { installedAt } : {}),
      },
      update: {
        locationId: locationId ?? null,
        locationName: locationName ?? null,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        scopes: scopes ?? '[]',
      },
    });
    return;
  } catch (err) {
    if (isMissingEspOAuthTableError(err)) throw missingOAuthTableError();
    throw err;
  }
}

export async function removeOAuthConnection(
  accountKey: string,
  provider: EspProvider,
): Promise<boolean> {
  try {
    const unified = await prisma.espOAuthConnection.deleteMany({
      where: { accountKey, provider },
    });
    return unified.count > 0;
  } catch (err) {
    if (isMissingEspOAuthTableError(err)) throw missingOAuthTableError();
    throw err;
  }
}
