import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import { parseTemplate } from '@/lib/template-parser';
import { serializeTemplate } from '@/lib/template-serializer';
import * as templateService from '@/lib/services/templates';

function extractFrontmatterTitle(content: string): string | undefined {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return undefined;
  const titleMatch = fmMatch[1].match(/^title:\s*(.+)$/m);
  if (!titleMatch) return undefined;
  const normalized = titleMatch[1].trim().replace(/^["']|["']$/g, '');
  return normalized || undefined;
}

export async function GET(req: NextRequest) {
  const { error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  const design = req.nextUrl.searchParams.get('design');
  const format = req.nextUrl.searchParams.get('format'); // 'raw' for raw HTML
  const type = req.nextUrl.searchParams.get('type'); // 'lifecycle' | 'design'

  if (design) {
    // Read specific template by slug
    try {
      const template = await templateService.getTemplate(design);
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      if (format === 'raw') {
        return NextResponse.json({ raw: template.content, id: template.id, slug: template.slug });
      }

      const parsed = parseTemplate(template.content);
      return NextResponse.json({ ...parsed, id: template.id, slug: template.slug });
    } catch {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
  }

  // List all templates
  const templates = await templateService.getTemplatesWithContent(type || undefined);
  return NextResponse.json(
    templates.map((t) => ({
      id: t.id,
      design: t.slug,
      name: extractFrontmatterTitle(t.content) || t.title,
      type: t.type,
      category: t.category,
      updatedAt: t.updatedAt.toISOString(),
      createdBy: t.createdByUser?.name || null,
      createdByAvatar: t.createdByUser?.avatarUrl || null,
      updatedBy: t.updatedByUser?.name || null,
      updatedByAvatar: t.updatedByUser?.avatarUrl || null,
    })),
  );
}

export async function PUT(req: NextRequest) {
  const { session, error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const body = await req.json();
    const { design, template, raw } = body;
    const createSnapshot = body.createSnapshot !== false;

    if (!design) {
      return NextResponse.json({ error: 'Missing design slug' }, { status: 400 });
    }

    let content: string;
    if (raw !== undefined) {
      content = raw;
    } else if (template) {
      content = serializeTemplate(template);
    } else {
      return NextResponse.json({ error: 'Missing template or raw content' }, { status: 400 });
    }

    // Extract title and preheader from content frontmatter
    let title: string | undefined;
    let preheader: string | undefined;
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const titleMatch = fmMatch[1].match(/^title:\s*(.+)$/m);
      if (titleMatch) title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
      const phMatch = fmMatch[1].match(/^preheader:\s*(.+)$/m);
      if (phMatch) preheader = phMatch[1].trim().replace(/^["']|["']$/g, '');
    }

    const updated = await templateService.updateTemplate(
      design,
      { content, title, preheader },
      createSnapshot,
      session!.user.id,
    );

    return NextResponse.json({ success: true, slug: updated.slug });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const { design, type: templateType } = await req.json();

    if (!design) {
      return NextResponse.json({ error: 'Missing design name' }, { status: 400 });
    }

    const safeSlug = design
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!safeSlug) {
      return NextResponse.json({ error: 'Invalid design name' }, { status: 400 });
    }

    const designLabel = safeSlug
      .split('-')
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const starter = `---
title: ${designLabel}
---

<x-base>

  <x-core.header />

  <x-core.hero
    headline="${designLabel}"
    subheadline="Add a brief description that captures your audience's attention."
    fallback-bg="#1a1a2e"
    headline-color="#ffffff"
    subheadline-color="#e0e0e0"
    hero-height="420px"
    text-align="center"
    content-valign="middle"
    primary-button-text="Get Started"
    primary-button-url="#"
    primary-button-bg-color="#4f46e5"
    primary-button-text-color="#ffffff"
    primary-button-radius="8px"
  />

  <x-core.spacer size="40" />

  <x-core.copy
    greeting="Hi {{contact.first_name}},"
    body="Add your email content here."
    align="center"
    padding="20px 40px"
  />

  <x-core.spacer size="24" />

  <x-core.cta
    button-text="Learn More"
    button-url="#"
    button-bg-color="#4f46e5"
    button-text-color="#ffffff"
    button-radius="8px"
    section-padding="20px 40px"
    align="center"
  />

  <x-core.spacer size="40" />

  <x-core.footer />

</x-base>
`;

    await templateService.createTemplate({
      slug: safeSlug,
      title: designLabel,
      type: templateType || 'design',
      content: starter,
      createdByUserId: session!.user.id,
    });

    return NextResponse.json({ design: safeSlug });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'Template already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const design = req.nextUrl.searchParams.get('design');

    if (!design) {
      return NextResponse.json({ error: 'Missing design' }, { status: 400 });
    }

    const template = await templateService.getTemplate(design);
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    await templateService.deleteTemplate(design);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
