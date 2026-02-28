import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { renderCampaignScreenshotFromHtml } from '@/lib/esp/screenshot-render';

function sanitizeFileName(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const safe = trimmed
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe || 'template';
}

/**
 * GET /api/esp/templates/screenshot?accountKey=xxx&templateId=yyy
 *
 * Download a high-resolution PNG screenshot of an ESP template.
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const accountKey = req.nextUrl.searchParams.get('accountKey');
  const templateId = req.nextUrl.searchParams.get('templateId');
  if (!accountKey || !templateId) {
    return NextResponse.json(
      { error: 'accountKey and templateId are required' },
      { status: 400 },
    );
  }

  const userRole = session!.user.role;
  const userAccountKeys: string[] = session!.user.accountKeys ?? [];
  const hasUnrestrictedAccess =
    userRole === 'developer' ||
    userRole === 'super_admin' ||
    (userRole === 'admin' && userAccountKeys.length === 0);
  if (!hasUnrestrictedAccess && !userAccountKeys.includes(accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const template = await prisma.espTemplate.findFirst({
    where: { id: templateId, accountKey },
    select: { id: true, name: true, html: true },
  });
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  if (!template.html?.trim()) {
    return NextResponse.json({ error: 'Template HTML is empty' }, { status: 400 });
  }

  try {
    const screenshot = await renderCampaignScreenshotFromHtml({
      html: template.html,
      filename: `${sanitizeFileName(template.name || 'template')}.png`,
    });

    return new NextResponse(screenshot.image as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': screenshot.contentType,
        'Content-Disposition': `attachment; filename="${screenshot.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate screenshot';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
