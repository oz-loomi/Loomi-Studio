import { NextRequest } from 'next/server';
import '@/lib/esp/init';
import {
  handleProviderWebhookGet,
  handleProviderWebhookPost,
} from '@/lib/esp/webhooks/families';

/**
 * Generic provider webhook endpoint by family.
 * Example: /api/webhooks/esp/{provider}/email-stats
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string; family: string }> },
) {
  const { provider, family } = await params;
  return handleProviderWebhookGet({
    provider,
    family,
    endpoint: `/api/webhooks/esp/${provider}/${family}`,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string; family: string }> },
) {
  const { provider, family } = await params;
  return handleProviderWebhookPost(req, { provider, family });
}
