import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * PUT /api/changelog/[id]
 *
 * Update a changelog entry.
 * Developer and admin only.
 * Body: { title?, content?, type? }
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  const { id } = await params;

  try {
    const existing = await prisma.changelogEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    const body = await req.json();
    const { title, content, type } = body;

    const entry = await prisma.changelogEntry.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(content !== undefined && { content: content.trim() }),
        ...(type !== undefined && { type }),
      },
    });

    return NextResponse.json({ entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update changelog entry';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/changelog/[id]
 *
 * Delete a changelog entry.
 * Developer and admin only.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  const { id } = await params;

  try {
    const existing = await prisma.changelogEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    await prisma.changelogEntry.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete changelog entry';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
