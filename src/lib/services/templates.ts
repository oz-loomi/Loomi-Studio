import { prisma } from '@/lib/prisma';
import { createVersion } from './template-versions';

export async function getTemplates(type?: string) {
  return prisma.template.findMany({
    where: type ? { type } : undefined,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      slug: true,
      title: true,
      type: true,
      category: true,
      preheader: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getTemplate(slug: string) {
  return prisma.template.findUnique({ where: { slug } });
}

export async function getTemplateById(id: string) {
  return prisma.template.findUnique({ where: { id } });
}

export async function createTemplate(data: {
  slug: string;
  title: string;
  type: string;
  content: string;
  category?: string;
  preheader?: string;
}) {
  return prisma.template.create({ data });
}

export async function updateTemplate(
  slug: string,
  data: { content?: string; title?: string; preheader?: string; category?: string },
  snapshot = true,
) {
  const existing = await prisma.template.findUnique({ where: { slug } });
  if (!existing) throw new Error(`Template "${slug}" not found`);

  // Create a version snapshot before updating
  if (snapshot && data.content && data.content !== existing.content) {
    await createVersion(existing.id, existing.content);
  }

  return prisma.template.update({
    where: { slug },
    data: { ...data, updatedAt: new Date() },
  });
}

export async function deleteTemplate(slug: string) {
  return prisma.template.delete({ where: { slug } });
}

export async function cloneTemplate(sourceSlug: string, targetSlug?: string) {
  const source = await prisma.template.findUnique({ where: { slug: sourceSlug } });
  if (!source) throw new Error(`Template "${sourceSlug}" not found`);

  // Generate a unique slug if not provided
  let slug = targetSlug || `${sourceSlug}-copy`;
  let attempt = 0;
  while (await prisma.template.findUnique({ where: { slug } })) {
    attempt++;
    slug = `${sourceSlug}-copy-${attempt}`;
  }

  const title = slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return prisma.template.create({
    data: {
      slug,
      title,
      type: source.type,
      category: source.category,
      content: source.content,
      preheader: source.preheader,
    },
  });
}
