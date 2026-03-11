import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import {
  serializePublishedToMapping,
  syncTemplateToProviders,
} from '@/lib/esp/template-sync';

/**
 * POST /api/esp/templates/[id]/publish
 *
 * Publish a template to one or more connected ESPs.
 * Body: { providers: string[] }
 *
 * Returns per-provider results:
 *   { results: { [provider]: { success, remoteId?, error? } }, publishedTo }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const providers: string[] = body.providers;

  if (!Array.isArray(providers) || providers.length === 0) {
    return NextResponse.json(
      { error: 'providers array is required' },
      { status: 400 },
    );
  }

  // Load the template
  const template = await prisma.espTemplate.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // Access check
  const userRole = session!.user.role;
  const userAccountKeys: string[] = session!.user.accountKeys ?? [];
  const hasUnrestrictedAdminAccess =
    userRole === 'developer' || (userRole === 'admin' && userAccountKeys.length === 0);
  if (!hasUnrestrictedAdminAccess && !userAccountKeys.includes(template.accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  if (!template.html) {
    return NextResponse.json(
      { error: 'Template has no HTML content to publish' },
      { status: 400 },
    );
  }

  const syncResult = await syncTemplateToProviders({
    accountKey: template.accountKey,
    primaryProvider: template.provider,
    remoteId: template.remoteId,
    publishedTo: template.publishedTo,
    providers,
    name: template.name,
    subject: template.subject,
    previewText: template.previewText,
    html: template.html,
    editorType: template.editorType,
  });

  await prisma.espTemplate.update({
    where: { id },
    data: {
      publishedTo: serializePublishedToMapping(syncResult.publishedTo),
      remoteId: syncResult.primaryRemoteId,
      ...(syncResult.syncedProviders.length > 0 ? { lastSyncedAt: new Date() } : {}),
    },
  });

  return NextResponse.json({
    results: syncResult.results,
    publishedTo: syncResult.publishedTo,
  });
}
