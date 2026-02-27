import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/esp/campaigns/schedule
 *
 * Provider-agnostic campaign scheduling.
 * Accepts an optional `templateId` (local EspTemplate ID) to resolve
 * an already-published remote template ID, avoiding duplicate creation.
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  let body: {
    accountKey?: string;
    name?: string;
    subject?: string;
    previewText?: string;
    html?: string;
    sendAt?: string;
    contactIds?: string[];
    templateId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { accountKey, name, subject, html, sendAt, contactIds, previewText, templateId } = body;
  if (!accountKey || !name || !subject || !html || !sendAt || !contactIds?.length) {
    return NextResponse.json({
      error: 'accountKey, name, subject, html, sendAt, and contactIds are required',
    }, { status: 400 });
  }

  if (contactIds.length > 3000) {
    return NextResponse.json({ error: 'Maximum 3000 recipients per campaign' }, { status: 400 });
  }

  // Access control
  const userRole = session!.user.role;
  const userAccountKeys: string[] = session!.user.accountKeys ?? [];
  if (userRole === 'client' && !userAccountKeys.includes(accountKey)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (userRole === 'admin' && userAccountKeys.length > 0 && !userAccountKeys.includes(accountKey)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await resolveAdapterAndCredentials(accountKey, {
    requireCapability: 'campaigns',
  });
  if (isResolveError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { adapter, credentials } = result;
  if (!adapter.campaigns) {
    return NextResponse.json(
      unsupportedCapabilityPayload(adapter.provider, 'campaign scheduling'),
      { status: 501 },
    );
  }

  // Resolve remote template ID if a local templateId was provided
  let remoteTemplateId: string | undefined;
  if (templateId) {
    try {
      const espTemplate = await prisma.espTemplate.findUnique({ where: { id: templateId } });
      if (espTemplate?.publishedTo) {
        const published = JSON.parse(espTemplate.publishedTo) as Record<string, string>;
        remoteTemplateId = published[adapter.provider] || undefined;
      }
      if (!remoteTemplateId && espTemplate?.remoteId && espTemplate.provider === adapter.provider) {
        remoteTemplateId = espTemplate.remoteId;
      }
    } catch {
      // Non-critical — adapter will create a new template if needed
    }
  }

  try {
    const scheduled = await adapter.campaigns.scheduleEmailCampaign({
      token: credentials.token,
      locationId: credentials.locationId,
      name,
      subject,
      previewText,
      html,
      sendAt,
      contactIds,
      remoteTemplateId,
    });
    return NextResponse.json({
      ok: true,
      scheduled,
      meta: {
        accountKey,
        locationId: credentials.locationId,
        recipients: contactIds.length,
        provider: adapter.provider,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to schedule campaign';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
