import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';

/**
 * POST /api/esp/campaigns/schedule
 *
 * Provider-agnostic campaign scheduling.
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
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { accountKey, name, subject, html, sendAt, contactIds, previewText } = body;
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
