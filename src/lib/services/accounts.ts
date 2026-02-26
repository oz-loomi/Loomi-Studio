import { prisma } from '@/lib/prisma';

const ACCOUNT_REP_SELECT = {
  id: true,
  name: true,
  title: true,
  email: true,
  avatarUrl: true,
} as const;

const INTERNAL_ACCOUNT_KEY_PREFIX = '_';

export function isInternalAccountKey(key: string): boolean {
  return key.startsWith(INTERNAL_ACCOUNT_KEY_PREFIX);
}

export async function getAccounts(userAccountKeys?: string[]) {
  if (userAccountKeys && userAccountKeys.length > 0) {
    const visibleKeys = userAccountKeys.filter((key) => !isInternalAccountKey(key));
    if (visibleKeys.length === 0) return [];

    return prisma.account.findMany({
      where: { key: { in: visibleKeys } },
      orderBy: { dealer: 'asc' },
      include: { accountRep: { select: ACCOUNT_REP_SELECT } },
    });
  }
  return prisma.account.findMany({
    where: { NOT: { key: { startsWith: INTERNAL_ACCOUNT_KEY_PREFIX } } },
    orderBy: { dealer: 'asc' },
    include: { accountRep: { select: ACCOUNT_REP_SELECT } },
  });
}

export async function getAccount(key: string) {
  if (isInternalAccountKey(key)) return null;

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
  const accounts = await prisma.account.findMany({
    where: { NOT: { key: { startsWith: INTERNAL_ACCOUNT_KEY_PREFIX } } },
    select: { key: true },
  });
  return accounts.map((a) => a.key);
}
