import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { canAccessPacer, decorateActivityEntry } from '@/lib/meta-ads-pacer';
import { deleteFromS3 } from '@/lib/s3';

export async function DELETE(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ accountKey: string; adId: string; entryId: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { accountKey, adId, entryId } = await params;
  if (!canAccessPacer(session, accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const entry = await prisma.metaAdsPacerActivityLog.findUnique({
    where: { id: entryId },
    select: {
      adId: true,
      attachmentKey: true,
      ad: { select: { plan: { select: { accountKey: true } } } },
    },
  });
  if (!entry || entry.adId !== adId || entry.ad.plan.accountKey !== accountKey) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  await prisma.metaAdsPacerActivityLog.delete({ where: { id: entryId } });

  // Best-effort: drop the attachment from S3. Don't fail the request if it fails.
  if (entry.attachmentKey) {
    deleteFromS3(entry.attachmentKey).catch(() => {});
  }

  return NextResponse.json({ success: true });
}

/**
 * PATCH /api/meta-ads-pacer/[accountKey]/ads/[adId]/activity/[entryId]
 * Body: { text: string }
 *
 * Lets a user edit the text of an update they authored. Anyone else who
 * has access to the pacer can read entries but only the author can edit
 * their own. Attachments aren't editable here — to swap a file the user
 * deletes the entry and posts a new one.
 */
export async function PATCH(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ accountKey: string; adId: string; entryId: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { accountKey, adId, entryId } = await params;
  if (!canAccessPacer(session, accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { text?: string } | null;
  const text = body?.text?.trim() ?? '';
  if (!text) {
    return NextResponse.json(
      { error: 'Update text cannot be empty' },
      { status: 400 },
    );
  }

  const existing = await prisma.metaAdsPacerActivityLog.findUnique({
    where: { id: entryId },
    select: {
      adId: true,
      authorUserId: true,
      ad: { select: { plan: { select: { accountKey: true } } } },
    },
  });
  if (
    !existing ||
    existing.adId !== adId ||
    existing.ad.plan.accountKey !== accountKey
  ) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }
  if (existing.authorUserId !== session!.user.id) {
    return NextResponse.json(
      { error: 'You can only edit updates you authored' },
      { status: 403 },
    );
  }

  const updated = await prisma.metaAdsPacerActivityLog.update({
    where: { id: entryId },
    data: { text },
  });
  return NextResponse.json(decorateActivityEntry(updated));
}
