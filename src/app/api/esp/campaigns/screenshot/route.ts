import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { renderCampaignScreenshotFromHtml } from '@/lib/esp/screenshot-render';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';

/**
 * GET /api/esp/campaigns/screenshot?accountKey=xxx&scheduleId=yyy
 * GET /api/esp/campaigns/screenshot?accountKey=xxx&campaignId=yyy
 *
 * Provider-agnostic campaign screenshot download.
 * Uses provider screenshot adapters when implemented.
 * Falls back to rendering campaign preview HTML when campaign previews are available.
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

  try {
    let screenshot:
      | { image: Buffer; contentType: string; filename: string }
      | null = null;

    if (adapter.campaignScreenshots) {
      screenshot = await adapter.campaignScreenshots.generateCampaignScreenshot({
        accountKey,
        identifier,
        credentials,
      });
    } else if (adapter.campaigns) {
      const preview = await adapter.campaigns.fetchCampaignPreviewHtml(
        credentials.token,
        credentials.locationId,
        identifier,
      );
      screenshot = await renderCampaignScreenshotFromHtml({
        html: preview.html,
        filename: 'campaign-screenshot.png',
      });
    }

    if (!screenshot) {
      return NextResponse.json(
        unsupportedCapabilityPayload(adapter.provider, 'campaign screenshot export'),
        { status: 501 },
      );
    }

    return new NextResponse(screenshot.image as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': screenshot.contentType,
        'Content-Disposition': `attachment; filename="${screenshot.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch screenshot';
    const statusRaw = (err as { status?: unknown })?.status;
    const status = typeof statusRaw === 'number' ? statusRaw : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
