import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import {
  EspAuthorizationError,
  resolveEspAuthorizationUrl,
} from '@/lib/esp/oauth-authorization';
import { parseEspProvider, providerValidationMessage } from '@/lib/esp/provider-utils';

/**
 * GET /api/esp/connections/authorize?accountKey=xxx&provider=provider-id
 *
 * Starts an OAuth flow for providers that support OAuth.
 * If provider is omitted, the account's configured provider is used.
 */
export async function GET(req: NextRequest) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  const accountKey = req.nextUrl.searchParams.get('accountKey')?.trim()
    || '';
  const providerRaw = req.nextUrl.searchParams.get('provider');
  const provider = parseEspProvider(providerRaw) || undefined;

  if (!accountKey) {
    return NextResponse.json({ error: 'accountKey query parameter is required' }, { status: 400 });
  }

  if (providerRaw && !provider) {
    return NextResponse.json(
      { error: providerValidationMessage() },
      { status: 400 },
    );
  }

  try {
    const { provider: resolvedProvider, url } = await resolveEspAuthorizationUrl({
      accountKey,
      provider,
    });
    const response = NextResponse.redirect(url);
    response.headers.set('x-esp-provider', resolvedProvider);
    return response;
  } catch (err) {
    if (err instanceof EspAuthorizationError) {
      return NextResponse.json(
        {
          error: err.message,
          ...(err.provider ? { provider: err.provider } : {}),
          ...(err.status === 501 ? { unsupported: true } : {}),
        },
        { status: err.status },
      );
    }
    const message = err instanceof Error ? err.message : 'Failed to start OAuth flow';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
