import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { s3PublicUrl, deleteFromS3 } from '@/lib/s3';

// ── Access helpers ──

/** Check access to an asset based on its accountKey. null = admin-level. */
function checkAccess(
  session: { user: { role: string; accountKeys?: string[] } },
  accountKey: string | null,
): boolean {
  const { role, accountKeys = [] } = session.user;
  if (role === 'developer' || role === 'super_admin') return true;
  if (role === 'admin' && accountKeys.length === 0) return true;
  // Admin-level assets: only accessible by devs/unrestricted admins (above)
  if (accountKey === null) return false;
  return accountKeys.includes(accountKey);
}

/**
 * PATCH /api/media/[id]
 *
 * Rename a media asset (metadata only — S3 key is immutable).
 * Body: { name }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { name } = body;

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  if (!checkAccess(session!, asset.accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const updated = await prisma.mediaAsset.update({
    where: { id },
    data: { filename: name.trim() },
  });

  return NextResponse.json({
    file: {
      id: updated.id,
      name: updated.filename,
      url: s3PublicUrl(updated.s3Key),
      type: updated.mimeType,
      size: updated.size,
      width: updated.width,
      height: updated.height,
      thumbnailUrl: updated.thumbnailKey ? s3PublicUrl(updated.thumbnailKey) : undefined,
      category: updated.category,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      source: 's3' as const,
    },
  });
}

/**
 * DELETE /api/media/[id]
 *
 * Delete a media asset from S3 and the database.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  if (!checkAccess(session!, asset.accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Delete from S3 (original + thumbnail)
  await deleteFromS3(asset.s3Key);
  if (asset.thumbnailKey) {
    await deleteFromS3(asset.thumbnailKey);
  }

  // Delete from DB
  await prisma.mediaAsset.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
