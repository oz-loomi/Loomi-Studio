import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import {
  type EspAuthorizationMode,
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

  const modeRaw = req.nextUrl.searchParams.get('mode');
  const mode: EspAuthorizationMode = modeRaw?.trim().toLowerCase() === 'agency'
    ? 'agency'
    : 'account';
  const accountKey = req.nextUrl.searchParams.get('accountKey')?.trim()
    || '';
  const providerRaw = req.nextUrl.searchParams.get('provider');
  const provider = parseEspProvider(providerRaw) || undefined;

  if (mode === 'account' && !accountKey) {
    return NextResponse.json({ error: 'accountKey query parameter is required' }, { status: 400 });
  }

  if (modeRaw && modeRaw.trim() && modeRaw.trim().toLowerCase() !== 'agency' && modeRaw.trim().toLowerCase() !== 'account') {
    return NextResponse.json({ error: 'mode must be "account" or "agency"' }, { status: 400 });
  }

  if (providerRaw && !provider) {
    return NextResponse.json(
      { error: providerValidationMessage() },
      { status: 400 },
    );
  }

  try {
    const { provider: resolvedProvider, url, mode: resolvedMode } = await resolveEspAuthorizationUrl({
      accountKey,
      provider,
      mode,
    });
    const response = NextResponse.redirect(url);
    response.headers.set('x-esp-provider', resolvedProvider);
    response.headers.set('x-esp-auth-mode', resolvedMode);
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
