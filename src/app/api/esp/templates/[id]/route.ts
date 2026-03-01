import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/esp/templates/[id]
 *
 * Fetch a single template by ID.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const template = await prisma.espTemplate.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const userRole = session!.user.role;
  const userAccountKeys: string[] = session!.user.accountKeys ?? [];
  const hasUnrestrictedAdminAccess =
    userRole === 'developer' || (userRole === 'admin' && userAccountKeys.length === 0);
  if (!hasUnrestrictedAdminAccess && !userAccountKeys.includes(template.accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  return NextResponse.json({ template });
}

/**
 * PUT /api/esp/templates/[id]
 *
 * Update a template locally, optionally push to ESP.
 * Body: { name?, subject?, previewText?, html?, source?, editorType?, syncToRemote?: boolean }
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { name, subject, previewText, html, source, editorType, syncToRemote, accountKey } = body;

  // Find the local template
  const existing = await prisma.espTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // Access check
  const userRole = session!.user.role;
  const userAccountKeys: string[] = session!.user.accountKeys ?? [];
  const hasUnrestrictedAdminAccess = userRole === 'admin' && userAccountKeys.length === 0;
  if (userRole !== 'developer' && !hasUnrestrictedAdminAccess && !userAccountKeys.includes(existing.accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const requestedAccountKey =
    typeof accountKey === 'string' && accountKey.trim() ? accountKey.trim() : null;
  const accountChanged =
    !!requestedAccountKey && requestedAccountKey !== existing.accountKey;

  let targetAccountKey = existing.accountKey;
  let targetProvider = existing.provider;
  if (accountChanged && requestedAccountKey) {
    if (
      userRole !== 'developer' &&
      !hasUnrestrictedAdminAccess &&
      !userAccountKeys.includes(requestedAccountKey)
    ) {
      return NextResponse.json({ error: 'Access denied for selected account' }, { status: 403 });
    }

    const targetAccount = await prisma.account.findUnique({
      where: { key: requestedAccountKey },
      select: { espProvider: true },
    });
    if (!targetAccount) {
      return NextResponse.json({ error: 'Selected account not found' }, { status: 404 });
    }

    targetAccountKey = requestedAccountKey;
    targetProvider = targetAccount.espProvider || existing.provider;
  }

  try {
    // If syncing to remote and we have a remoteId, push update to ESP
    if (syncToRemote && existing.remoteId && !accountChanged) {
      const result = await resolveAdapterAndCredentials(existing.accountKey, {
        requireCapability: 'templates',
      });
      if (!isResolveError(result) && result.adapter.templates) {
        await result.adapter.templates.updateTemplate(
          result.credentials.token,
          result.credentials.locationId,
          existing.remoteId,
          { name, subject, previewText, html },
        );
      }
    }

    // Update locally
    const template = await prisma.espTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(subject !== undefined && { subject }),
        ...(previewText !== undefined && { previewText }),
        ...(html !== undefined && { html }),
        ...(source !== undefined && { source }),
        ...(editorType !== undefined && { editorType }),
        ...(accountChanged && {
          accountKey: targetAccountKey,
          provider: targetProvider,
          remoteId: null,
          status: 'draft',
          lastSyncedAt: null,
        }),
        ...(syncToRemote && !accountChanged && { lastSyncedAt: new Date() }),
      },
    });

    return NextResponse.json({ template, synced: !!syncToRemote });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/esp/templates/[id]?deleteFromRemote=true
 *
 * Delete a template locally, optionally also from the ESP.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const deleteFromRemote = req.nextUrl.searchParams.get('deleteFromRemote') === 'true';

  const existing = await prisma.espTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // Access check
  const userRole = session!.user.role;
  const userAccountKeys: string[] = session!.user.accountKeys ?? [];
  const hasUnrestrictedAdminAccess = userRole === 'admin' && userAccountKeys.length === 0;
  if (userRole !== 'developer' && !hasUnrestrictedAdminAccess && !userAccountKeys.includes(existing.accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    // Delete from remote first if requested
    let remoteDeleted = false;
    if (deleteFromRemote && existing.remoteId) {
      const result = await resolveAdapterAndCredentials(existing.accountKey, {
        requireCapability: 'templates',
      });
      if (!isResolveError(result) && result.adapter.templates) {
        await result.adapter.templates.deleteTemplate(
          result.credentials.token,
          result.credentials.locationId,
          existing.remoteId,
        );
        remoteDeleted = true;
      }
    }

    // Delete locally
    await prisma.espTemplate.delete({ where: { id } });

    return NextResponse.json({ deleted: true, remoteDeleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
