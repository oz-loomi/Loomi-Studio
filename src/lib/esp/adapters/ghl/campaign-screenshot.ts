import { fetchCampaignPreviewHtml } from './campaigns';
import { resolveGhlCredentials } from './contacts';
import { getConnection } from './oauth';
import { renderCampaignScreenshotFromHtml } from '@/lib/esp/screenshot-render';

function parseScopes(scopesRaw: string | null | undefined): string[] {
  if (!scopesRaw) return [];
  try {
    const parsed = JSON.parse(scopesRaw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export class GhlCampaignScreenshotError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'GhlCampaignScreenshotError';
    this.status = status;
  }
}

export async function generateGhlCampaignScreenshot(params: {
  accountKey: string;
  scheduleId: string;
}): Promise<{ image: Buffer; contentType: string; filename: string }> {
  const { scheduleId } = params;
  const accountKey = params.accountKey.trim();
  if (!accountKey) {
    throw new GhlCampaignScreenshotError('accountKey is required', 400);
  }

  const credentials = await resolveGhlCredentials(accountKey);
  if (!credentials) {
    throw new GhlCampaignScreenshotError('GHL not connected for this account', 404);
  }

  const connection = await getConnection(accountKey);
  if (connection) {
    const scopes = parseScopes(connection.scopes);
    if (scopes.length > 0 && !scopes.includes('emails/schedule.readonly')) {
      throw new GhlCampaignScreenshotError(
        'Missing required GHL scope "emails/schedule.readonly".',
        403,
      );
    }
  }

  let html: string;
  try {
    const preview = await fetchCampaignPreviewHtml(
      credentials.token,
      credentials.locationId,
      scheduleId,
    );
    html = preview.html;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch campaign preview';
    throw new GhlCampaignScreenshotError(message, 500);
  }

  if (!html.trim()) {
    throw new GhlCampaignScreenshotError('Preview HTML is empty', 404);
  }

  try {
    return await renderCampaignScreenshotFromHtml({
      html,
      filename: 'campaign-screenshot.png',
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Screenshot generation failed';
    throw new GhlCampaignScreenshotError(message, 500);
  }
}
