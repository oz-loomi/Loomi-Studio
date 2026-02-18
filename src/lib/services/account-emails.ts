import { prisma } from '@/lib/prisma';

export async function getAccountEmails(accountKey: string) {
  return prisma.accountEmail.findMany({
    where: { accountKey },
    include: {
      template: { select: { slug: true, title: true, type: true } },
      folder: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getAllEmails() {
  return prisma.accountEmail.findMany({
    include: {
      template: { select: { slug: true, title: true, type: true } },
      account: { select: { key: true, dealer: true } },
      folder: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getAccountEmail(id: string) {
  return prisma.accountEmail.findUnique({
    where: { id },
    include: {
      template: true,
      account: true,
    },
  });
}

export async function createAccountEmail(data: {
  accountKey: string;
  templateId: string;
  name: string;
  content?: string;
  status?: string;
  folderId?: string;
}) {
  return prisma.accountEmail.create({ data });
}

export async function updateAccountEmail(
  id: string,
  data: Partial<{
    name: string;
    content: string | null;
    status: string;
    folderId: string | null;
  }>,
) {
  return prisma.accountEmail.update({ where: { id }, data });
}

export async function deleteAccountEmail(id: string) {
  return prisma.accountEmail.delete({ where: { id } });
}
