import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { canAccessPacer } from '@/lib/meta-ads-pacer';

export async function DELETE(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ accountKey: string; adId: string; noteId: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { accountKey, adId, noteId } = await params;
  if (!canAccessPacer(session, accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const note = await prisma.metaAdsPacerDesignNote.findUnique({
    where: { id: noteId },
    select: { adId: true, ad: { select: { plan: { select: { accountKey: true } } } } },
  });
  if (!note || note.adId !== adId || note.ad.plan.accountKey !== accountKey) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }

  await prisma.metaAdsPacerDesignNote.delete({ where: { id: noteId } });
  return NextResponse.json({ success: true });
}
