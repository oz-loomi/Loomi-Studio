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

    const now = new Date();
    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const remote of remoteTemplates) {
      if (!remote.id) continue;

      const existing = await prisma.espTemplate.findUnique({
        where: {
          accountKey_provider_remoteId: {
            accountKey,
            provider: adapter.provider,
            remoteId: remote.id,
          },
        },
      });

      if (existing) {
        // Update if name or html changed
        const nameChanged = remote.name && remote.name !== existing.name;
        const htmlChanged = remote.html && remote.html !== existing.html;
        const thumbChanged = remote.thumbnailUrl && remote.thumbnailUrl !== existing.thumbnailUrl;

        if (nameChanged || htmlChanged || thumbChanged) {
          await prisma.espTemplate.update({
            where: { id: existing.id },
            data: {
              ...(nameChanged && { name: remote.name }),
              ...(htmlChanged && { html: remote.html }),
              ...(thumbChanged && { thumbnailUrl: remote.thumbnailUrl }),
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
