import { prisma } from '@/lib/prisma';
import type { EspProvider } from '@/lib/esp/types';

export interface ProviderOAuthCredentialRecord {
  provider: EspProvider;
  subjectType: string | null;
  subjectId: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  scopes: string;
  installedAt: Date;
  updatedAt: Date;
}

function isMissingProviderOAuthTableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes('EspProviderOAuthCredential')
    && /does not exist|no such table/i.test(err.message)
  );
}

function missingProviderOAuthTableError(): Error {
  return new Error('EspProviderOAuthCredential table is required. Run database migrations.');
}

function mapProviderCredential(connection: {
  provider: string;
  subjectType: string | null;
  subjectId: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  scopes: string;
  installedAt: Date;
  updatedAt: Date;
}): ProviderOAuthCredentialRecord {
  return {
    provider: connection.provider as EspProvider,
    subjectType: connection.subjectType,
    subjectId: connection.subjectId,
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    tokenExpiresAt: connection.tokenExpiresAt,
    scopes: connection.scopes,
    installedAt: connection.installedAt,
    updatedAt: connection.updatedAt,
  };
}

export async function getProviderOAuthCredential(
  provider: EspProvider,
): Promise<ProviderOAuthCredentialRecord | null> {
  try {
    const row = await prisma.espProviderOAuthCredential.findUnique({
      where: { provider },
    });
    return row ? mapProviderCredential(row) : null;
  } catch (err) {
    if (isMissingProviderOAuthTableError(err)) throw missingProviderOAuthTableError();
    throw err;
  }
}

export async function listProviderOAuthCredentials(input: {
  providers?: EspProvider[];
} = {}): Promise<ProviderOAuthCredentialRecord[]> {
  const providers = input.providers;
  if (Array.isArray(providers) && providers.length === 0) {
    return [];
  }
  const hasProviderFilter = Array.isArray(providers) && providers.length > 0;

  try {
    const rows = await prisma.espProviderOAuthCredential.findMany({
      where: {
        ...(hasProviderFilter ? { provider: { in: providers } } : {}),
      },
      orderBy: { provider: 'asc' },
    });
    return rows.map(mapProviderCredential);
  } catch (err) {
    if (isMissingProviderOAuthTableError(err)) throw missingProviderOAuthTableError();
    throw err;
  }
}

export async function upsertProviderOAuthCredential(input: {
  provider: EspProvider;
  subjectType?: string | null;
  subjectId?: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  scopes?: string;
  installedAt?: Date;
}): Promise<void> {
  const {
    provider,
    subjectType,
    subjectId,
    accessToken,
    refreshToken,
    tokenExpiresAt,
    scopes,
    installedAt,
  } = input;

  try {
    await prisma.espProviderOAuthCredential.upsert({
      where: { provider },
      create: {
        provider,
        subjectType: subjectType ?? null,
        subjectId: subjectId ?? null,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        scopes: scopes ?? '[]',
        ...(installedAt ? { installedAt } : {}),
      },
      update: {
        subjectType: subjectType ?? null,
        subjectId: subjectId ?? null,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        scopes: scopes ?? '[]',
      },
    });
    return;
  } catch (err) {
    if (isMissingProviderOAuthTableError(err)) throw missingProviderOAuthTableError();
    throw err;
  }
}

export async function removeProviderOAuthCredential(
  provider: EspProvider,
): Promise<boolean> {
  try {
    const row = await prisma.espProviderOAuthCredential.deleteMany({
      where: { provider },
    });
    return row.count > 0;
  } catch (err) {
    if (isMissingProviderOAuthTableError(err)) throw missingProviderOAuthTableError();
    throw err;
  }
}
