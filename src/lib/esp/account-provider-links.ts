import { prisma } from '@/lib/prisma';
import type { EspProvider } from '@/lib/esp/types';

export interface AccountProviderLinkRecord {
  accountKey: string;
  provider: EspProvider;
  locationId: string | null;
  locationName: string | null;
  metadata: string | null;
  linkedAt: Date;
  updatedAt: Date;
}

function isMissingAccountProviderLinkTableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes('EspAccountProviderLink')
    && /does not exist|no such table/i.test(err.message)
  );
}

function missingAccountProviderLinkTableError(): Error {
  return new Error('EspAccountProviderLink table is required. Run database migrations.');
}

function mapAccountProviderLink(connection: {
  accountKey: string;
  provider: string;
  locationId: string | null;
  locationName: string | null;
  metadata: string | null;
  linkedAt: Date;
  updatedAt: Date;
}): AccountProviderLinkRecord {
  return {
    accountKey: connection.accountKey,
    provider: connection.provider as EspProvider,
    locationId: connection.locationId,
    locationName: connection.locationName,
    metadata: connection.metadata,
    linkedAt: connection.linkedAt,
    updatedAt: connection.updatedAt,
  };
}

export async function getAccountProviderLink(
  accountKey: string,
  provider: EspProvider,
): Promise<AccountProviderLinkRecord | null> {
  try {
    const row = await prisma.espAccountProviderLink.findUnique({
      where: {
        accountKey_provider: {
          accountKey,
          provider,
        },
      },
    });
    return row ? mapAccountProviderLink(row) : null;
  } catch (err) {
    if (isMissingAccountProviderLinkTableError(err)) throw missingAccountProviderLinkTableError();
    throw err;
  }
}

export async function listAccountProviderLinks(input: {
  provider?: EspProvider;
  accountKeys?: string[];
} = {}): Promise<AccountProviderLinkRecord[]> {
  const { provider, accountKeys } = input;
  if (Array.isArray(accountKeys) && accountKeys.length === 0) {
    return [];
  }
  const hasKeyFilter = Array.isArray(accountKeys) && accountKeys.length > 0;

  try {
    const rows = await prisma.espAccountProviderLink.findMany({
      where: {
        ...(provider ? { provider } : {}),
        ...(hasKeyFilter ? { accountKey: { in: accountKeys } } : {}),
      },
      orderBy: [{ accountKey: 'asc' }, { provider: 'asc' }],
    });
    return rows.map(mapAccountProviderLink);
  } catch (err) {
    if (isMissingAccountProviderLinkTableError(err)) throw missingAccountProviderLinkTableError();
    throw err;
  }
}

export async function upsertAccountProviderLink(input: {
  accountKey: string;
  provider: EspProvider;
  locationId?: string | null;
  locationName?: string | null;
  metadata?: string | null;
  linkedAt?: Date;
}): Promise<void> {
  const {
    accountKey,
    provider,
    locationId,
    locationName,
    metadata,
    linkedAt,
  } = input;

  try {
    await prisma.espAccountProviderLink.upsert({
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
        metadata: metadata ?? null,
        ...(linkedAt ? { linkedAt } : {}),
      },
      update: {
        locationId: locationId ?? null,
        locationName: locationName ?? null,
        metadata: metadata ?? null,
      },
    });
    return;
  } catch (err) {
    if (isMissingAccountProviderLinkTableError(err)) throw missingAccountProviderLinkTableError();
    throw err;
  }
}

export async function removeAccountProviderLink(
  accountKey: string,
  provider: EspProvider,
): Promise<boolean> {
  try {
    const row = await prisma.espAccountProviderLink.deleteMany({
      where: { accountKey, provider },
    });
    return row.count > 0;
  } catch (err) {
    if (isMissingAccountProviderLinkTableError(err)) throw missingAccountProviderLinkTableError();
    throw err;
  }
}
