import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';

/**
 * GET /api/esp/campaigns/preview?accountKey=xxx&scheduleId=yyy
 * GET /api/esp/campaigns/preview?accountKey=xxx&campaignId=yyy
 *
 * Provider-agnostic campaign preview HTML.
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const accountKey = req.nextUrl.searchParams.get('accountKey');
  const scheduleId = req.nextUrl.searchParams.get('scheduleId');
  const campaignId = req.nextUrl.searchParams.get('campaignId');
  const identifier = scheduleId || campaignId;
  if (!accountKey || !identifier) {
    return NextResponse.json({ error: 'accountKey and (scheduleId or campaignId) are required' }, { status: 400 });
  }

  const userRole = session!.user.role;
  const userAccountKeys: string[] = session!.user.accountKeys ?? [];
  const hasUnrestrictedAdminAccess = userRole === 'admin' && userAccountKeys.length === 0;
  if (userRole !== 'developer' && !hasUnrestrictedAdminAccess && !userAccountKeys.includes(accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
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
      unsupportedCapabilityPayload(adapter.provider, 'campaign previews'),
      { status: 501 },
    );
  }

  try {
    const preview = await adapter.campaigns.fetchCampaignPreviewHtml(
      credentials.token,
      credentials.locationId,
      identifier,
    );
    return NextResponse.json({
      id: identifier,
      ...(scheduleId ? { scheduleId } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...preview,
      provider: adapter.provider,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch preview';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
