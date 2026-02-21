import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/changelog
 *
 * List all changelog entries (newest first).
 * All authenticated users can read.
 */
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const entries = await prisma.changelogEntry.findMany({
      orderBy: { publishedAt: 'desc' },
    });
    return NextResponse.json({ entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch changelog';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/changelog
 *
 * Create a new changelog entry.
 * Developer and admin only.
 * Body: { title, content, type?, createdBy? }
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireRole('developer', 'admin');
  if (error) return error;

  try {
    const body = await req.json();
    const { title, content, type, createdBy } = body;

    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
    }

    const entry = await prisma.changelogEntry.create({
      data: {
        title: title.trim(),
        content: content.trim(),
        type: type || 'improvement',
        createdBy: createdBy || session!.user.name || 'Unknown',
      },
    });

    return NextResponse.json({ entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create changelog entry';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
