import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';
import type { EspMediaFolder } from '@/lib/esp/types';

/**
 * GET /api/esp/media?accountKey=xxx&cursor=xxx&limit=50&parentId=xxx
 *
 * List media files (and folders) from the connected provider.
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const accountKey = req.nextUrl.searchParams.get('accountKey');
  if (!accountKey) {
    return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
  }

  // Access check
  const userRole = session!.user.role;
  const userAccountKeys: string[] = session!.user.accountKeys ?? [];
  const hasUnrestrictedAdminAccess =
    userRole === 'developer' || (userRole === 'admin' && userAccountKeys.length === 0);
  if (!hasUnrestrictedAdminAccess && !userAccountKeys.includes(accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Resolve adapter + credentials
  const result = await resolveAdapterAndCredentials(accountKey, {
    requireCapability: 'media',
  });
  if (isResolveError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { adapter, credentials } = result;
  if (!adapter.media) {
    return NextResponse.json(
      unsupportedCapabilityPayload(adapter.provider, 'media'),
      { status: 501 },
    );
  }

  try {
    const cursor = req.nextUrl.searchParams.get('cursor') || undefined;
    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : undefined;
    const parentId = req.nextUrl.searchParams.get('parentId') || undefined;

    const media = await adapter.media.listMedia(
      credentials.token,
      credentials.locationId,
      { cursor, limit, parentId },
    );

    // Fetch folders for this level if adapter supports it
    let folders: EspMediaFolder[] = [];
    if (adapter.media.listFolders) {
      const folderResult = await adapter.media.listFolders(
        credentials.token,
        credentials.locationId,
        parentId,
      );
      folders = folderResult.folders;
    }

    return NextResponse.json({
      files: media.files,
      folders,
      nextCursor: media.nextCursor,
      total: media.total,
      provider: adapter.provider,
      capabilities: adapter.media.mediaCapabilities,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list media';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/esp/media
 *
 * Upload a media file to the connected provider.
 * Expects multipart/form-data with:
 *   - accountKey (text field)
 *   - file (file field)
 *   - parentId (optional text field — upload into a folder)
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const accountKey = formData.get('accountKey') as string | null;
  const file = formData.get('file') as File | null;
  const parentId = formData.get('parentId') as string | null;

  if (!accountKey) {
    return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  // Access check
  const userRole = session!.user.role;
  const userAccountKeys: string[] = session!.user.accountKeys ?? [];
  const hasUnrestrictedAdminAccess =
    userRole === 'developer' || (userRole === 'admin' && userAccountKeys.length === 0);
  if (!hasUnrestrictedAdminAccess && !userAccountKeys.includes(accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Resolve adapter + credentials
  const result = await resolveAdapterAndCredentials(accountKey, {
    requireCapability: 'media',
  });
  if (isResolveError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { adapter, credentials } = result;
  if (!adapter.media) {
    return NextResponse.json(
      unsupportedCapabilityPayload(adapter.provider, 'media'),
      { status: 501 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await adapter.media.uploadMedia(
      credentials.token,
      credentials.locationId,
      {
        file: buffer,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        parentId: parentId || undefined,
      },
    );

    return NextResponse.json({ file: uploaded }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upload media';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
