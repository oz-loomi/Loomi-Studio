import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';

/**
 * GET /api/esp/campaigns?accountKey=xxx
 *
 * Provider-agnostic campaign list.
 */
export async function GET(req: NextRequest) {
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
    requireCapability: 'campaigns',
  });
  if (isResolveError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { adapter, credentials } = result;
  if (!adapter.campaigns) {
    return NextResponse.json(
      unsupportedCapabilityPayload(adapter.provider, 'campaigns'),
      { status: 501 },
    );
  }

  try {
    const campaigns = await adapter.campaigns.fetchCampaigns(credentials.token, credentials.locationId);
    const taggedCampaigns = campaigns.map((campaign) => ({
      ...campaign,
      accountKey: campaign.accountKey || accountKey,
      provider: adapter.provider,
    }));
    return NextResponse.json({
      campaigns: taggedCampaigns,
      meta: {
        total: campaigns.length,
        accountKey,
        provider: adapter.provider,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch campaigns';
    const status =
      message.includes('(401)') ? 401 :
      message.includes('(403)') ? 403 :
      message.includes('(404)') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
