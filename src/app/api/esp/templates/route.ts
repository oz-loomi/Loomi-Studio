import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getAdapterForAccount } from '@/lib/esp/registry';
import { prisma } from '@/lib/prisma';
import {
  resolveTemplateSyncProviders,
  serializePublishedToMapping,
  syncTemplateToProviders,
} from '@/lib/esp/template-sync';

function normalizeTemplateProvider<
  T extends {
    provider: string;
    account?: { espProvider: string } | null;
  },
>(template: T) {
  const resolvedProvider =
    template.provider && template.provider !== 'unknown'
      ? template.provider
      : template.account?.espProvider || template.provider || 'unknown';

  return { ...template, provider: resolvedProvider };
}

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
        where: { accountKey, status: { not: 'deleted-local' } },
        orderBy: { updatedAt: 'desc' },
        include: {
          account: {
            select: { espProvider: true },
          },
        },
      });
      const normalized = templates.map((template) => {
        const withProvider = normalizeTemplateProvider(template);
        const { account: _account, ...rest } = withProvider;
        return rest;
      });
      return NextResponse.json({
        templates: normalized,
        meta: { total: normalized.length, accountKey },
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
        where: { accountKey: { in: userAccountKeys }, status: { not: 'deleted-local' } },
        orderBy: { updatedAt: 'desc' },
        include: {
          account: {
            select: { espProvider: true },
          },
        },
      });
      const normalized = templates.map((template) => {
        const withProvider = normalizeTemplateProvider(template);
        const { account: _account, ...rest } = withProvider;
        return rest;
      });
      return NextResponse.json({
        templates: normalized,
        meta: { total: normalized.length },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch templates';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Unrestricted: return all templates
  try {
    const templates = await prisma.espTemplate.findMany({
      where: { status: { not: 'deleted-local' } },
      orderBy: { updatedAt: 'desc' },
      include: {
        account: {
          select: { espProvider: true },
        },
      },
    });
    const normalized = templates.map((template) => {
      const withProvider = normalizeTemplateProvider(template);
      const { account: _account, ...rest } = withProvider;
      return rest;
    });
    return NextResponse.json({
      templates: normalized,
      meta: { total: normalized.length },
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
  const {
    accountKey,
    name,
    subject,
    previewText,
    html,
    source,
    editorType,
    syncToRemote,
    providers,
  } = body;

  if (!accountKey || !name) {
    return NextResponse.json({ error: 'accountKey and name are required' }, { status: 400 });
  }

  const userRole = session!.user.role;
  const userAccountKeys: string[] = session!.user.accountKeys ?? [];
  const hasUnrestrictedAdminAccess = userRole === 'admin' && userAccountKeys.length === 0;
  if (userRole !== 'developer' && !hasUnrestrictedAdminAccess && !userAccountKeys.includes(accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Determine provider for local record creation without requiring valid credentials.
  let providerName = 'unknown';
  try {
    const adapter = await getAdapterForAccount(accountKey);
    providerName = adapter.provider;
  } catch {
    providerName = 'unknown';
  }

  try {
    const preferredProviders = Array.isArray(providers)
      ? providers.filter((provider): provider is string => typeof provider === 'string' && provider.trim().length > 0)
      : [];
    const syncProviders = syncToRemote
      ? await resolveTemplateSyncProviders({
        accountKey,
        preferredProviders,
        primaryProvider: providerName,
      })
      : [];

    let remoteId: string | null = null;
    let publishedTo: string | null = null;
    let syncResults: Record<string, { success: boolean; remoteId?: string; error?: string }> = {};
    let syncFailedProviders: string[] = [];

    if (syncProviders.length > 0) {
      const syncResult = await syncTemplateToProviders({
        accountKey,
        primaryProvider: providerName,
        providers: syncProviders,
        name,
        subject,
        previewText,
        html: html || '',
        editorType,
      });
      remoteId = syncResult.primaryRemoteId;
      publishedTo = serializePublishedToMapping(syncResult.publishedTo);
      syncResults = syncResult.results;
      syncFailedProviders = syncResult.failedProviders;
    }

    // Create locally — always works even without ESP connection
    const template = await prisma.espTemplate.create({
      data: {
        accountKey,
        provider: providerName,
        remoteId,
        publishedTo,
        name,
        subject: subject || null,
        previewText: previewText || null,
        html: html || '',
        source: source || null,
        status: 'draft',
        editorType: editorType || null,
        lastSyncedAt: syncProviders.length > syncFailedProviders.length ? new Date() : null,
      },
    });

    return NextResponse.json(
      {
        template,
        synced: syncProviders.length > syncFailedProviders.length,
        syncAttempted: syncProviders.length > 0,
        syncProviders,
        syncFailedProviders,
        syncResults,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
