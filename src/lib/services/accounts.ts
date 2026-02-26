import { prisma } from '@/lib/prisma';

const ACCOUNT_REP_SELECT = {
  id: true,
  name: true,
  title: true,
  email: true,
  avatarUrl: true,
} as const;

/**
 * Internal account keys (e.g. `_customValueDefaults`) start with `_`.
 * NOTE: Do NOT use Prisma `startsWith('_')` to filter these — SQL LIKE treats
 * `_` as a single-character wildcard, so `NOT LIKE '_%'` excludes ALL rows.
 * Always filter in JS instead.
 */
const INTERNAL_KEY_PREFIX = '_';
function excludeInternal<T extends { key: string }>(accounts: T[]): T[] {
  return accounts.filter((a) => !a.key.startsWith(INTERNAL_KEY_PREFIX));
}

export async function getAccounts(userAccountKeys?: string[]) {
  if (userAccountKeys && userAccountKeys.length > 0) {
    const accounts = await prisma.account.findMany({
      where: { key: { in: userAccountKeys } },
      orderBy: { dealer: 'asc' },
      include: { accountRep: { select: ACCOUNT_REP_SELECT } },
    });
    return excludeInternal(accounts);
  }
  const accounts = await prisma.account.findMany({
    orderBy: { dealer: 'asc' },
    include: { accountRep: { select: ACCOUNT_REP_SELECT } },
  });
  return excludeInternal(accounts);
}

export async function getAccount(key: string) {
  return prisma.account.findUnique({
    where: { key },
    include: { accountRep: { select: ACCOUNT_REP_SELECT } },
  });
}

export async function createAccount(data: {
  key: string;
  dealer: string;
  espProvider: string;
  category?: string;
  oem?: string;
  oems?: string;
  email?: string;
  phone?: string;
  salesPhone?: string;
  servicePhone?: string;
  partsPhone?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  website?: string;
  timezone?: string;
  logos?: string;
  branding?: string;
  customValues?: string;
  accountRepId?: string;
}) {
  return prisma.account.create({ data });
}

export async function updateAccount(
  key: string,
  data: Partial<{
    dealer: string;
    category: string;
    oem: string;
    oems: string;
    espProvider: string;
    email: string;
    phone: string;
    salesPhone: string;
    servicePhone: string;
    partsPhone: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    website: string;
    timezone: string;
    logos: string;
    branding: string;
    customValues: string;
    accountRepId: string | null;
  }>,
) {
  return prisma.account.update({ where: { key }, data });
}

export async function deleteAccount(key: string) {
  return prisma.account.delete({ where: { key } });
}

export async function getAllAccountKeys() {
  const accounts = await prisma.account.findMany({ select: { key: true } });
  return excludeInternal(accounts).map((a) => a.key);
}
