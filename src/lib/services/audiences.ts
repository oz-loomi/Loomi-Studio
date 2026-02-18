import { prisma } from '@/lib/prisma';

export async function getAudiences(accountKeys?: string[]) {
  const where = accountKeys
    ? { OR: [{ accountKey: null }, { accountKey: { in: accountKeys } }] }
    : undefined;

  return prisma.audience.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function createAudience(data: {
  name: string;
  description?: string;
  accountKey?: string | null;
  createdByUserId?: string;
  filters: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
}) {
  return prisma.audience.create({ data });
}
