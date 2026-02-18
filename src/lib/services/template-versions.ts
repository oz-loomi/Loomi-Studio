import { prisma } from '@/lib/prisma';

const MAX_VERSIONS = 5;

export async function createVersion(templateId: string, content: string) {
  // Check if latest version has the same content (skip duplicate snapshots)
  const latest = await prisma.templateVersion.findFirst({
    where: { templateId },
    orderBy: { createdAt: 'desc' },
  });
  if (latest && latest.content === content) return latest;

  // Create the new version
  const version = await prisma.templateVersion.create({
    data: { templateId, content },
  });

  // Prune old versions beyond the limit
  const allVersions = await prisma.templateVersion.findMany({
    where: { templateId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (allVersions.length > MAX_VERSIONS) {
    const toDelete = allVersions.slice(MAX_VERSIONS).map((v) => v.id);
    await prisma.templateVersion.deleteMany({
      where: { id: { in: toDelete } },
    });
  }

  return version;
}

export async function getVersions(templateId: string) {
  return prisma.templateVersion.findMany({
    where: { templateId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
    },
  });
}

export async function getVersion(versionId: string) {
  return prisma.templateVersion.findUnique({ where: { id: versionId } });
}

export async function restoreVersion(templateId: string, versionId: string) {
  const version = await prisma.templateVersion.findUnique({
    where: { id: versionId },
  });
  if (!version) throw new Error('Version not found');
  if (version.templateId !== templateId) throw new Error('Version does not belong to template');

  // Snapshot current content before restoring
  const current = await prisma.template.findUnique({ where: { id: templateId } });
  if (current) {
    await createVersion(templateId, current.content);
  }

  // Update template with the restored version's content
  return prisma.template.update({
    where: { id: templateId },
    data: { content: version.content, updatedAt: new Date() },
  });
}
