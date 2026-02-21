import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import '@/lib/esp/init';
import { getAdapter } from '@/lib/esp/registry';
import type { EspProvider, EspCredentials } from '@/lib/esp/types';

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

  // Parse existing publishedTo mapping
  let publishedTo: Record<string, string> = {};
  if (template.publishedTo) {
    try {
      publishedTo = JSON.parse(template.publishedTo);
    } catch {
      publishedTo = {};
    }
  }

  // Also carry over legacy remoteId if present
  if (template.remoteId && template.provider && !publishedTo[template.provider]) {
    publishedTo[template.provider] = template.remoteId;
  }

  const results: Record<
    string,
    { success: boolean; remoteId?: string; error?: string }
  > = {};

  for (const providerName of providers) {
    try {
      const adapter = getAdapter(providerName as EspProvider);
      if (!adapter.templates) {
        results[providerName] = {
          success: false,
          error: `${providerName} does not support templates`,
        };
        continue;
      }

      // Resolve credentials for this specific provider
      let credentials: EspCredentials | null = null;
      if (adapter.resolveCredentials) {
        credentials = await adapter.resolveCredentials(template.accountKey);
      } else if (adapter.contacts) {
        credentials = await adapter.contacts.resolveCredentials(template.accountKey);
      }

      if (!credentials) {
        results[providerName] = {
          success: false,
          error: `${providerName} is not connected for this account`,
        };
        continue;
      }

      const existingRemoteId = publishedTo[providerName];

      if (existingRemoteId) {
        // Update existing remote template
        await adapter.templates.updateTemplate(
          credentials.token,
          credentials.locationId,
          existingRemoteId,
          {
            name: template.name,
            subject: template.subject ?? undefined,
            previewText: template.previewText ?? undefined,
            html: template.html,
          },
        );
        results[providerName] = { success: true, remoteId: existingRemoteId };
      } else {
        // Create new remote template
        const created = await adapter.templates.createTemplate(
          credentials.token,
          credentials.locationId,
          {
            name: template.name,
            subject: template.subject ?? undefined,
            previewText: template.previewText ?? undefined,
            html: template.html,
            editorType: template.editorType ?? undefined,
          },
        );
        publishedTo[providerName] = created.id;
        results[providerName] = { success: true, remoteId: created.id };
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `Failed to publish to ${providerName}`;
      results[providerName] = { success: false, error: message };
    }
  }

  // Persist updated publishedTo mapping
  await prisma.espTemplate.update({
    where: { id },
    data: {
      publishedTo: JSON.stringify(publishedTo),
      lastSyncedAt: new Date(),
    },
  });

  return NextResponse.json({ results, publishedTo });
}
