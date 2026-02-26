import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { downloadFromS3 } from '@/lib/s3';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';

/**
 * POST /api/media/push-to-esp
 *
 * Push S3 (Loomi) media files to sub-account ESPs.
 * Body: { assetIds: string[], accountKeys: string[] }
 *
 * Downloads each asset from S3 and uploads it to each account's ESP.
 * Returns per-file, per-account results.
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  // Only admins / developers can push
  const { role, accountKeys: userAccountKeys = [] } = session!.user;
  const isUnrestricted =
    role === 'developer' || role === 'super_admin' || (role === 'admin' && userAccountKeys.length === 0);
  if (!isUnrestricted) {
    return NextResponse.json({ error: 'Only admins can push media to sub-accounts' }, { status: 403 });
  }

  let body: { assetIds?: string[]; accountKeys?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { assetIds, accountKeys } = body;
  if (!assetIds?.length || !accountKeys?.length) {
    return NextResponse.json(
      { error: 'assetIds and accountKeys arrays are required' },
      { status: 400 },
    );
  }

  // Fetch S3 assets from DB
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: assetIds } },
  });

  if (assets.length === 0) {
    return NextResponse.json({ error: 'No matching assets found' }, { status: 404 });
  }

  // Verify access to target accounts
  for (const key of accountKeys) {
    const hasAccess =
      role === 'developer' || role === 'super_admin' || (role === 'admin' && userAccountKeys.length === 0)
        ? true
        : userAccountKeys.includes(key);
    if (!hasAccess) {
      return NextResponse.json({ error: `Access denied for account: ${key}` }, { status: 403 });
    }
  }

  // Process each asset × account combination
  type PushResult = {
    assetId: string;
    filename: string;
    accountKey: string;
    success: boolean;
    error?: string;
  };

  const results: PushResult[] = [];

  for (const asset of assets) {
    // Download from S3 once per asset
    let fileBuffer: Buffer;
    try {
      fileBuffer = await downloadFromS3(asset.s3Key);
    } catch (err) {
      // If S3 download fails, mark all accounts as failed for this asset
      for (const key of accountKeys) {
        results.push({
          assetId: asset.id,
          filename: asset.filename,
          accountKey: key,
          success: false,
          error: `Failed to download from S3: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
      }
      continue;
    }

    // Upload to each account's ESP in parallel
    const accountResults = await Promise.allSettled(
      accountKeys.map(async (key) => {
        const resolved = await resolveAdapterAndCredentials(key, {
          requireCapability: 'media',
        });
        if (isResolveError(resolved)) {
          throw new Error(resolved.error);
        }

        const { adapter, credentials } = resolved;
        if (!adapter.media) {
          throw new Error(`Media not supported for provider: ${adapter.provider}`);
        }

        await adapter.media.uploadMedia(
          credentials.token,
          credentials.locationId,
          {
            file: fileBuffer,
            name: asset.filename,
            mimeType: asset.mimeType,
          },
        );
      }),
    );

    // Collect results
    accountKeys.forEach((key, i) => {
      const result = accountResults[i];
      results.push({
        assetId: asset.id,
        filename: asset.filename,
        accountKey: key,
        success: result.status === 'fulfilled',
        error: result.status === 'rejected'
          ? (result.reason instanceof Error ? result.reason.message : String(result.reason))
          : undefined,
      });
    });
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return NextResponse.json({
    results,
    summary: { total: results.length, success: successCount, failed: failCount },
  });
}
