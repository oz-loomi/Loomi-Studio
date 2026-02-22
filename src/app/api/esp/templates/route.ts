import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/esp/templates?accountKey=xxx
 * GET /api/esp/templates                (admin/developer: returns all accessible)
 *
 * Provider-agnostic template list. Returns locally-cached templates.
 * Use POST /api/esp/templates/sync to pull latest from ESP first.
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const accountKey = req.nextUrl.searchParams.get('accountKey');
  const userRole = session!.user.role;
  const userAccountKeys: string[] = session!.user.accountKeys ?? [];
  const hasUnrestrictedAdminAccess =
    userRole === 'developer' || (userRole === 'admin' && userAccountKeys.length === 0);

  // Single-account fetch
  if (accountKey) {
    if (!hasUnrestrictedAdminAccess && !userAccountKeys.includes(accountKey)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    try {
      const templates = await prisma.espTemplate.findMany({
        where: { accountKey },
        orderBy: { updatedAt: 'desc' },
      });
      return NextResponse.json({
        templates,
        meta: { total: templates.length, accountKey },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch templates';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Multi-account fetch (admin/developer only)
  if (!hasUnrestrictedAdminAccess) {
    // Restricted admin/client — require accountKey
    if (userAccountKeys.length === 0) {
      return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
    }
    try {
      const templates = await prisma.espTemplate.findMany({
        where: { accountKey: { in: userAccountKeys } },
        orderBy: { updatedAt: 'desc' },
      });
      return NextResponse.json({
        templates,
        meta: { total: templates.length },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch templates';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Unrestricted: return all templates
  try {
    const templates = await prisma.espTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json({
      templates,
      meta: { total: templates.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch templates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/esp/templates
 *
 * Create a new template locally, optionally also on the ESP.
 * Body: { accountKey, name, subject?, previewText?, html, editorType?, syncToRemote?: boolean }
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const { accountKey, name, subject, previewText, html, source, editorType, syncToRemote } = body;

  if (!accountKey || !name) {
    return NextResponse.json({ error: 'accountKey and name are required' }, { status: 400 });
  }

  const userRole = session!.user.role;
  const userAccountKeys: string[] = session!.user.accountKeys ?? [];
  const hasUnrestrictedAdminAccess = userRole === 'admin' && userAccountKeys.length === 0;
  if (userRole !== 'developer' && !hasUnrestrictedAdminAccess && !userAccountKeys.includes(accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Resolve adapter — best-effort for provider name; only required when syncing to remote
  const resolved = await resolveAdapterAndCredentials(accountKey, {});
  const adapterAvailable = !isResolveError(resolved);
  const providerName = adapterAvailable ? resolved.adapter.provider : 'unknown';

  try {
    let remoteId: string | null = null;

    // If user wants to sync to remote, create on ESP first (requires connected adapter)
    if (syncToRemote) {
      if (!adapterAvailable || !resolved.adapter.templates) {
        return NextResponse.json(
          { error: 'ESP connection with templates support required to sync to remote' },
          { status: 400 },
        );
      }
      const remoteTemplate = await resolved.adapter.templates.createTemplate(
        resolved.credentials.token,
        resolved.credentials.locationId,
        { name, subject, previewText, html: html || '', editorType },
      );
      remoteId = remoteTemplate.id;
    }

    // Create locally — always works even without ESP connection
    const template = await prisma.espTemplate.create({
      data: {
        accountKey,
        provider: providerName,
        remoteId,
        name,
        subject: subject || null,
        previewText: previewText || null,
        html: html || '',
        source: source || null,
        status: 'draft',
        editorType: editorType || null,
        lastSyncedAt: syncToRemote ? new Date() : null,
      },
    });

    return NextResponse.json({ template, synced: !!syncToRemote }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
