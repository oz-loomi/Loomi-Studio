import { prisma } from '@/lib/prisma';

export async function getAccounts(userAccountKeys?: string[]) {
  if (userAccountKeys && userAccountKeys.length > 0) {
    return prisma.account.findMany({
      where: { key: { in: userAccountKeys } },
      orderBy: { dealer: 'asc' },
    });
  }
  return prisma.account.findMany({ orderBy: { dealer: 'asc' } });
}

export async function getAccount(key: string) {
  return prisma.account.findUnique({ where: { key } });
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
  }>,
) {
  return prisma.account.update({ where: { key }, data });
}

export async function deleteAccount(key: string) {
  return prisma.account.delete({ where: { key } });
}

export async function getAllAccountKeys() {
  const accounts = await prisma.account.findMany({ select: { key: true } });
  return accounts.map((a) => a.key);
}
