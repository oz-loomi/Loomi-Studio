import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { prisma } from '@/lib/prisma';
import {
  resolveTemplateSyncProviders,
  serializePublishedToMapping,
  syncTemplateToProviders,
} from '@/lib/esp/template-sync';

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
  const {
    name,
    subject,
    previewText,
    html,
    source,
    editorType,
    syncToRemote,
    accountKey,
    providers,
  } = body;

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
    const preferredProviders = Array.isArray(providers)
      ? providers.filter((provider): provider is string => typeof provider === 'string' && provider.trim().length > 0)
      : [];
    const resolvedName = typeof name === 'string' && name.trim() ? name.trim() : existing.name;
    const resolvedSubject = subject !== undefined ? subject : existing.subject;
    const resolvedPreviewText = previewText !== undefined ? previewText : existing.previewText;
    const resolvedHtml = typeof html === 'string' ? html : existing.html;
    const resolvedEditorType = typeof editorType === 'string' ? editorType : existing.editorType;

    let syncProviders: string[] = [];
    let syncResults: Record<string, { success: boolean; remoteId?: string; error?: string }> = {};
    let syncFailedProviders: string[] = [];
    let publishedTo = existing.publishedTo;
    let remoteId = existing.remoteId;
    let lastSyncedAt = existing.lastSyncedAt;

    if (syncToRemote && !accountChanged) {
      syncProviders = await resolveTemplateSyncProviders({
        accountKey: existing.accountKey,
        preferredProviders,
        publishedTo: existing.publishedTo,
        remoteId: existing.remoteId,
        primaryProvider: existing.provider,
      });

      if (syncProviders.length > 0) {
        const syncResult = await syncTemplateToProviders({
          accountKey: existing.accountKey,
          primaryProvider: existing.provider,
          remoteId: existing.remoteId,
          publishedTo: existing.publishedTo,
          providers: syncProviders,
          name: resolvedName,
          subject: resolvedSubject,
          previewText: resolvedPreviewText,
          html: resolvedHtml,
          editorType: resolvedEditorType,
        });
        syncResults = syncResult.results;
        syncFailedProviders = syncResult.failedProviders;
        publishedTo = serializePublishedToMapping(syncResult.publishedTo);
        remoteId = syncResult.primaryRemoteId;
        if (syncResult.syncedProviders.length > 0) {
          lastSyncedAt = new Date();
        }
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
        ...(!accountChanged && syncToRemote && {
          publishedTo,
          remoteId,
          lastSyncedAt,
        }),
        ...(accountChanged && {
          accountKey: targetAccountKey,
          provider: targetProvider,
          remoteId: null,
          publishedTo: null,
          status: 'draft',
          lastSyncedAt: null,
        }),
      },
    });

    return NextResponse.json({
      template,
      synced: syncToRemote && syncProviders.length > 0 && syncFailedProviders.length < syncProviders.length,
      syncAttempted: syncToRemote && !accountChanged && syncProviders.length > 0,
      syncProviders,
      syncFailedProviders,
      syncResults,
    });
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

    if (deleteFromRemote || !existing.remoteId) {
      // Hard-delete: template removed from ESP too, or was never synced
      await prisma.espTemplate.delete({ where: { id } });
    } else {
      // Soft-delete: hide locally but keep the row so sync won't recreate it
      await prisma.espTemplate.update({
        where: { id },
        data: { status: 'deleted-local' },
      });
    }

    return NextResponse.json({ deleted: true, remoteDeleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
