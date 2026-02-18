import { prisma } from '@/lib/prisma';
import type { EspProvider } from '@/lib/esp/types';

export interface ApiKeyConnectionRecord {
  accountKey: string;
  provider: EspProvider;
  apiKey: string;
  accountId: string | null;
  accountName: string | null;
  metadata: string | null;
  installedAt: Date;
  updatedAt: Date;
}

export interface ApiKeyConnectionSummary {
  accountKey: string;
  provider: EspProvider;
  accountId: string | null;
  accountName: string | null;
  installedAt: Date;
  updatedAt: Date;
}

function isDeprecatedSingleConnectionConstraintError(err: unknown): boolean {
  if (err instanceof Error && /UNIQUE constraint failed: EspConnection\.accountKey/i.test(err.message)) {
    return true;
  }

  const error = err as { code?: unknown; meta?: { target?: unknown } } | null;
  if (!error || error.code !== 'P2002') return false;

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.map(String).includes('accountKey');
  }
  return typeof target === 'string' && target.includes('accountKey');
}

export async function getApiKeyConnection(
  accountKey: string,
  provider: EspProvider,
): Promise<ApiKeyConnectionRecord | null> {
  const row = await prisma.espConnection.findFirst({
    where: { accountKey, provider },
    select: {
      accountKey: true,
      provider: true,
      apiKey: true,
      accountId: true,
      accountName: true,
      metadata: true,
      installedAt: true,
      updatedAt: true,
    },
  });

  if (!row) return null;
  return {
    accountKey: row.accountKey,
    provider: row.provider as EspProvider,
    apiKey: row.apiKey,
    accountId: row.accountId,
    accountName: row.accountName,
    metadata: row.metadata,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
  };
}

export async function listApiKeyConnections(input: {
  provider?: EspProvider;
  accountKeys?: string[];
} = {}): Promise<ApiKeyConnectionSummary[]> {
  const { provider, accountKeys } = input;
  if (Array.isArray(accountKeys) && accountKeys.length === 0) {
    return [];
  }
  const hasKeyFilter = Array.isArray(accountKeys) && accountKeys.length > 0;

  const rows = await prisma.espConnection.findMany({
    where: {
      ...(provider ? { provider } : {}),
      ...(hasKeyFilter ? { accountKey: { in: accountKeys } } : {}),
    },
    select: {
      accountKey: true,
      provider: true,
      accountId: true,
      accountName: true,
      installedAt: true,
      updatedAt: true,
    },
    orderBy: [{ accountKey: 'asc' }, { provider: 'asc' }],
  });

  return rows.map((row) => ({
    accountKey: row.accountKey,
    provider: row.provider as EspProvider,
    accountId: row.accountId,
    accountName: row.accountName,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
  }));
}

export async function upsertApiKeyConnection(input: {
  accountKey: string;
  provider: EspProvider;
  apiKey: string;
  accountId?: string | null;
  accountName?: string | null;
  metadata?: string | null;
  installedAt?: Date;
}): Promise<void> {
  const {
    accountKey,
    provider,
    apiKey,
    accountId,
    accountName,
    metadata,
    installedAt,
  } = input;

  const existing = await prisma.espConnection.findFirst({
    where: { accountKey, provider },
    select: { id: true },
  });

  if (existing) {
    await prisma.espConnection.update({
      where: { id: existing.id },
      data: {
        apiKey,
        accountId: accountId ?? null,
        accountName: accountName ?? null,
        metadata: metadata ?? null,
        updatedAt: new Date(),
      },
    });
    return;
  }

  try {
    await prisma.espConnection.create({
      data: {
        accountKey,
        provider,
        apiKey,
        accountId: accountId ?? null,
        accountName: accountName ?? null,
        metadata: metadata ?? null,
        ...(installedAt ? { installedAt } : {}),
      },
    });
  } catch (err) {
    if (isDeprecatedSingleConnectionConstraintError(err)) {
      throw new Error(
        'EspConnection table still uses single-row-per-account constraints. Run database migrations.',
      );
    }
    throw err;
  }
}

export async function removeApiKeyConnection(
  accountKey: string,
  provider: EspProvider,
): Promise<boolean> {
  const result = await prisma.espConnection.deleteMany({
    where: { accountKey, provider },
  });
  return result.count > 0;
}
