import { prisma } from '@/lib/prisma';

export async function getTags() {
  return prisma.templateTag.findMany({
    orderBy: { name: 'asc' },
    include: {
      assignments: {
        select: { templateId: true },
      },
    },
  });
}

export async function createTag(name: string) {
  return prisma.templateTag.create({ data: { name } });
}

export async function deleteTag(id: string) {
  return prisma.templateTag.delete({ where: { id } });
}

export async function getTagAssignments() {
  return prisma.templateTagAssignment.findMany({
    include: {
      tag: { select: { name: true } },
      template: { select: { slug: true } },
    },
  });
}

export async function setTagAssignments(templateId: string, tagNames: string[]) {
  // Delete existing assignments for this template
  await prisma.templateTagAssignment.deleteMany({ where: { templateId } });

  if (tagNames.length === 0) return [];

  // Ensure all tags exist
  const tags = await Promise.all(
    tagNames.map(async (name) => {
      return prisma.templateTag.upsert({
        where: { name },
        create: { name },
        update: {},
      });
    }),
  );

  // Create new assignments
  return Promise.all(
    tags.map((tag) =>
      prisma.templateTagAssignment.create({
        data: { templateId, tagId: tag.id },
      }),
    ),
  );
}
