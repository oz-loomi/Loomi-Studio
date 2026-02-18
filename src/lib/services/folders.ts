import { prisma } from '@/lib/prisma';

export async function getFolders(accountKey?: string) {
  return prisma.emailFolder.findMany({
    where: accountKey ? { accountKey } : undefined,
    include: {
      emails: { select: { id: true } },
    },
    orderBy: { name: 'asc' },
  });
}

export async function createFolder(name: string, accountKey?: string) {
  return prisma.emailFolder.create({
    data: { name, accountKey: accountKey || null },
  });
}

export async function renameFolder(id: string, name: string) {
  return prisma.emailFolder.update({ where: { id }, data: { name } });
}

export async function deleteFolder(id: string) {
  // Unfile all emails in this folder first (set folderId to null)
  await prisma.accountEmail.updateMany({
    where: { folderId: id },
    data: { folderId: null },
  });
  return prisma.emailFolder.delete({ where: { id } });
}
