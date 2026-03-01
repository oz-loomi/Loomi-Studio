import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import { completeEspOAuthCallback } from '@/lib/esp/oauth-callback';
import { parseEspProvider, providerValidationMessage } from '@/lib/esp/provider-utils';
import { resolveOAuthProviderFromState } from '@/lib/esp/oauth-provider-resolution';

/**
 * GET /api/esp/connections/callback?provider=provider-id&code=...&state=...
 * GET /api/esp/connections/callback?code=...&state=...
 *
 * Provider-agnostic OAuth callback entrypoint.
 * If `provider` is omitted, provider is inferred from signed OAuth state.
 */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (!MANAGEMENT_ROLES.includes(session.user.role)) {
    return NextResponse.redirect(new URL('/?error=forbidden', req.url));
  }

  const providerRaw = req.nextUrl.searchParams.get('provider');
  const providerFromQuery = parseEspProvider(providerRaw);
  if (providerRaw && !providerFromQuery) {
    return NextResponse.json(
      { error: providerValidationMessage('provider') },
      { status: 400 },
    );
  }

  const providerFromState = resolveOAuthProviderFromState(req.nextUrl.searchParams.get('state'));
  const provider = providerFromQuery || providerFromState;
  if (!provider) {
    return NextResponse.json(
      { error: 'Unable to resolve OAuth provider from callback state' },
      { status: 400 },
    );
  }

  return completeEspOAuthCallback(req, provider);
}
