import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';

/**
 * PATCH /api/esp/media/[id]
 *
 * Rename a media file on the connected provider (Klaviyo only).
 * Body: { accountKey, name }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { accountKey, name } = body;

  if (!accountKey) {
    return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
  }
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
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

  if (!adapter.media.renameMedia) {
    return NextResponse.json(
      { error: `${adapter.provider} does not support renaming media files` },
      { status: 501 },
    );
  }

  try {
    const updated = await adapter.media.renameMedia(
      credentials.token,
      credentials.locationId,
      id,
      name.trim(),
    );

    return NextResponse.json({ file: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to rename media';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/esp/media/[id]?accountKey=xxx
 *
 * Delete a media file from the connected provider (GHL only).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
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

  if (!adapter.media.deleteMedia) {
    return NextResponse.json(
      { error: `${adapter.provider} does not support deleting media files` },
      { status: 501 },
    );
  }

  try {
    await adapter.media.deleteMedia(
      credentials.token,
      credentials.locationId,
      id,
    );

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete media';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
