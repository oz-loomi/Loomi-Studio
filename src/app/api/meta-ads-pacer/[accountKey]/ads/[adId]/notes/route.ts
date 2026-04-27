import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { canAccessPacer } from '@/lib/meta-ads-pacer';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ accountKey: string; adId: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { accountKey, adId } = await params;
  if (!canAccessPacer(session, accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const ad = await prisma.metaAdsPacerAd.findUnique({
    where: { id: adId },
    select: { plan: { select: { accountKey: true } } },
  });
  if (!ad || ad.plan.accountKey !== accountKey) {
    return NextResponse.json({ error: 'Ad not found' }, { status: 404 });
  }

  const body = (await req.json()) as { text?: string };
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'Text is required' }, { status: 400 });
  }

  const note = await prisma.metaAdsPacerDesignNote.create({
    data: {
      adId,
      text,
      authorUserId: session!.user.id,
    },
  });
  return NextResponse.json(note, { status: 201 });
}
