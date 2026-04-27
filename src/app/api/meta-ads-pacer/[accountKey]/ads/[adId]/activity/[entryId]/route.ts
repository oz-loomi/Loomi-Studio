import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { canAccessPacer } from '@/lib/meta-ads-pacer';
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
