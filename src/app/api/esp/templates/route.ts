import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';
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

  // Resolve adapter to get provider info
  const result = await resolveAdapterAndCredentials(accountKey, {
    requireCapability: 'templates',
  });
  if (isResolveError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { adapter, credentials } = result;
  if (!adapter.templates) {
    return NextResponse.json(
      unsupportedCapabilityPayload(adapter.provider, 'templates'),
      { status: 501 },
    );
  }

  try {
    let remoteId: string | null = null;

    // If user wants to sync to remote, create on ESP first
    if (syncToRemote) {
      const remoteTemplate = await adapter.templates.createTemplate(
        credentials.token,
        credentials.locationId,
        { name, subject, previewText, html: html || '', editorType },
      );
      remoteId = remoteTemplate.id;
    }

    // Create locally
    const template = await prisma.espTemplate.create({
      data: {
        accountKey,
        provider: adapter.provider,
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
