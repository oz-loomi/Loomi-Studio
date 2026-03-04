import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/esp/templates/sync?accountKey=xxx
 *
 * Pull latest templates from the ESP and upsert into local EspTemplate table.
 * Returns a sync summary.
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const accountKey = req.nextUrl.searchParams.get('accountKey');
  if (!accountKey) {
    return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
  }

  const userRole = session!.user.role;
  const userAccountKeys: string[] = session!.user.accountKeys ?? [];
  const hasUnrestrictedAdminAccess = userRole === 'admin' && userAccountKeys.length === 0;
  if (userRole !== 'developer' && !hasUnrestrictedAdminAccess && !userAccountKeys.includes(accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

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
    // Fetch all templates from ESP
    const remoteTemplates = await adapter.templates.fetchTemplates(
      credentials.token,
      credentials.locationId,
    );

    // Back-compat: templates published via `publishedTo` may not have legacy `remoteId` populated.
    // Build a lookup so sync updates those rows instead of creating duplicates.
    const publishedCandidates = await prisma.espTemplate.findMany({
      where: {
        accountKey,
        provider: adapter.provider,
        publishedTo: { not: null },
      },
    });
    const publishedLookup = new Map<string, (typeof publishedCandidates)[number]>();
    for (const candidate of publishedCandidates) {
      if (!candidate.publishedTo) continue;
      try {
        const parsed = JSON.parse(candidate.publishedTo) as Record<string, unknown>;
        const mappedId = parsed?.[adapter.provider];
        if (typeof mappedId === 'string' && mappedId.trim()) {
          publishedLookup.set(mappedId.trim(), candidate);
        }
      } catch {
        // Ignore malformed mappings and continue with direct remoteId matching.
      }
    }

    const now = new Date();
    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const remote of remoteTemplates) {
      if (!remote.id) continue;

      let existing = await prisma.espTemplate.findUnique({
        where: {
          accountKey_provider_remoteId: {
            accountKey,
            provider: adapter.provider,
            remoteId: remote.id,
          },
        },
      });

      if (!existing) {
        existing = publishedLookup.get(remote.id) ?? null;
      }

      if (existing) {
        // Skip templates that the user intentionally deleted locally
        if (existing.status === 'deleted-local') {
          unchanged++;
          continue;
        }

        const nextName = remote.name?.trim() || 'Untitled';
        const nextSubject = remote.subject?.trim() || null;
        const nextPreviewText = remote.previewText?.trim() || null;
        const nextHtml = remote.html || '';
        const nextStatus = remote.status || existing.status || 'active';
        const nextEditorType = remote.editorType || null;
        const nextThumbnailUrl = remote.thumbnailUrl || null;

        const nameChanged = nextName !== existing.name;
        const subjectChanged = nextSubject !== existing.subject;
        const previewTextChanged = nextPreviewText !== existing.previewText;
        const htmlChanged = nextHtml !== existing.html;
        const statusChanged = nextStatus !== existing.status;
        const editorTypeChanged = nextEditorType !== existing.editorType;
        const thumbChanged = nextThumbnailUrl !== existing.thumbnailUrl;
        const remoteIdChanged = existing.remoteId !== remote.id;

        if (
          nameChanged ||
          subjectChanged ||
          previewTextChanged ||
          htmlChanged ||
          statusChanged ||
          editorTypeChanged ||
          thumbChanged ||
          remoteIdChanged
        ) {
          await prisma.espTemplate.update({
            where: { id: existing.id },
            data: {
              ...(nameChanged && { name: nextName }),
              ...(subjectChanged && { subject: nextSubject }),
              ...(previewTextChanged && { previewText: nextPreviewText }),
              ...(htmlChanged && { html: nextHtml }),
              ...(statusChanged && { status: nextStatus }),
              ...(editorTypeChanged && { editorType: nextEditorType }),
              ...(thumbChanged && { thumbnailUrl: nextThumbnailUrl }),
              ...(remoteIdChanged && { remoteId: remote.id }),
              lastSyncedAt: now,
            },
          });
          updated++;
        } else {
          // Touch lastSyncedAt even if nothing changed
          await prisma.espTemplate.update({
            where: { id: existing.id },
            data: { lastSyncedAt: now },
          });
          unchanged++;
        }
      } else {
        // Create new local record
        await prisma.espTemplate.create({
          data: {
            accountKey,
            provider: adapter.provider,
            remoteId: remote.id,
            name: remote.name || 'Untitled',
            subject: remote.subject || null,
            previewText: remote.previewText || null,
            html: remote.html || '',
            status: remote.status || 'active',
            editorType: remote.editorType || null,
            thumbnailUrl: remote.thumbnailUrl || null,
            lastSyncedAt: now,
          },
        });
        created++;
      }
    }

    return NextResponse.json({
      sync: {
        provider: adapter.provider,
        accountKey,
        total: remoteTemplates.length,
        created,
        updated,
        unchanged,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sync templates';
    const status =
      message.includes('(401)') ? 401 :
      message.includes('(403)') ? 403 :
      message.includes('(404)') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
