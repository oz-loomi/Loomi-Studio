import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';

/**
 * POST /api/esp/media/folders
 *
 * Create a new media folder on the connected provider.
 * Body: { accountKey, name, parentId? }
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const { accountKey, name, parentId } = body;

  if (!accountKey) {
    return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
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

  if (!adapter.media.createFolder) {
    return NextResponse.json(
      { error: `${adapter.provider} does not support creating folders` },
      { status: 501 },
    );
  }

  try {
    const folder = await adapter.media.createFolder(
      credentials.token,
      credentials.locationId,
      { name: name.trim(), parentId: parentId || undefined },
    );

    return NextResponse.json({ folder }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create folder';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
