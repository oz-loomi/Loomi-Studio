import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import '@/lib/esp/init';
import { getAdapter } from '@/lib/esp/registry';
import {
  parseEspProvider,
  providerValidationMessage,
} from '@/lib/esp/provider-utils';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';

/**
 * GET /api/esp/connections/required-scopes?provider=xxx
 *
 * Provider-agnostic required OAuth scopes endpoint.
 */
export async function GET(req: NextRequest) {
  const { error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  const providerRaw = req.nextUrl.searchParams.get('provider');
  const provider = parseEspProvider(providerRaw);

  if (!provider) {
    return NextResponse.json(
      { error: providerValidationMessage('provider') },
      { status: 400 },
    );
  }

  try {
    const adapter = getAdapter(provider);
    if (!adapter.oauth) {
      return NextResponse.json(
        {
          scopes: [],
          ...unsupportedCapabilityPayload(provider, 'OAuth scopes'),
        },
        { status: 501 },
      );
    }

    return NextResponse.json({
      provider,
      scopes: adapter.oauth.requiredScopes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch required scopes';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
