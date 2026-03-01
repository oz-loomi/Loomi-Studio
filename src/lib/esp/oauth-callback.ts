import '@/lib/esp/init';

import { NextRequest, NextResponse } from 'next/server';
import { getAdapter } from '@/lib/esp/registry';
import type { EspProvider } from '@/lib/esp/types';
import * as accountService from '@/lib/services/accounts';

const GHL_AGENCY_ACCOUNT_KEY = '__ghl_agency__';

/**
 * Best-effort extraction of accountKey from an OAuth state string without
 * full cryptographic verification.  Used only to determine redirect target
 * when the signed verification itself has failed (e.g. expired state).
 */
function peekAccountKeyFromState(state: string | null | undefined): string {
  try {
    const raw = (state || '').trim();
    if (!raw) return '';
    const payloadB64 = raw.split('.')[0];
    if (!payloadB64) return '';
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    return typeof payload?.accountKey === 'string' ? payload.accountKey.trim() : '';
  } catch {
    return '';
  }
}

function resolveAppBaseUrl(req: NextRequest): string {
  const fromEnv = (process.env.NEXTAUTH_URL || '').trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '');
  }

  const forwardedHost = req.headers.get('x-forwarded-host')?.trim();
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, '');
  }

  const host = req.headers.get('host')?.trim();
  if (host) {
    const proto = req.nextUrl.protocol.replace(/:$/, '') || 'http';
    return `${proto}://${host}`.replace(/\/+$/, '');
  }

  return req.nextUrl.origin.replace(/\/+$/, '');
}

function buildRedirectUrl(req: NextRequest, pathname: string): URL {
  return new URL(pathname, `${resolveAppBaseUrl(req)}/`);
}

function redirectAccountsError(req: NextRequest, provider: EspProvider, message: string): NextResponse {
  const url = buildRedirectUrl(req, '/subaccounts');
  url.searchParams.set('esp_error', message);
  url.searchParams.set('esp_provider', provider);
  return NextResponse.redirect(url);
}

function redirectSettingsConnected(req: NextRequest, provider: EspProvider): NextResponse {
  const url = buildRedirectUrl(req, '/settings');
  url.searchParams.set('esp_connected', 'true');
  url.searchParams.set('esp_provider', provider);
  url.searchParams.set('esp_auth_mode', 'agency');
  url.searchParams.set('tab', 'custom-values');
  return NextResponse.redirect(url);
}

function redirectSettingsError(req: NextRequest, provider: EspProvider, message: string): NextResponse {
  const url = buildRedirectUrl(req, '/settings');
  url.searchParams.set('esp_error', message);
  url.searchParams.set('esp_provider', provider);
  url.searchParams.set('esp_auth_mode', 'agency');
  url.searchParams.set('tab', 'custom-values');
  return NextResponse.redirect(url);
}

function redirectAccountConnected(req: NextRequest, accountKey: string, provider: EspProvider): NextResponse {
  const url = buildRedirectUrl(req, `/settings/subaccounts/${accountKey}`);
  url.searchParams.set('esp_connected', 'true');
  url.searchParams.set('esp_provider', provider);
  url.searchParams.set('tab', 'integration');
  return NextResponse.redirect(url);
}

function redirectAccountError(
  req: NextRequest,
  accountKey: string,
  provider: EspProvider,
  message: string,
): NextResponse {
  const url = buildRedirectUrl(req, `/settings/subaccounts/${accountKey}`);
  url.searchParams.set('esp_error', message);
  url.searchParams.set('esp_provider', provider);
  url.searchParams.set('tab', 'integration');
  return NextResponse.redirect(url);
}

/**
 * Complete an ESP OAuth callback flow and return the final redirect response.
 * Auth/role checks should be performed by the caller.
 */
export async function completeEspOAuthCallback(
  req: NextRequest,
  provider: EspProvider,
): Promise<NextResponse> {
  let adapter;
  try {
    adapter = getAdapter(provider);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid ESP provider';
    return redirectAccountsError(req, provider, message);
  }

  if (!adapter.oauth) {
    return redirectAccountsError(req, provider, `${provider} does not support OAuth`);
  }

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const errorParam = req.nextUrl.searchParams.get('error');
  const statePayload = state ? adapter.oauth.verifyState(state) : null;
  const accountKey = statePayload?.accountKey || '';
  const isAgencyFlow = provider === 'ghl' && accountKey === GHL_AGENCY_ACCOUNT_KEY;

  // For error/missing-param paths where statePayload is null, peek into the
  // raw state to determine if this was an agency flow so we redirect correctly.
  const fallbackIsAgency = () => {
    if (isAgencyFlow) return true;
    const peeked = peekAccountKeyFromState(state);
    return provider === 'ghl' && peeked === GHL_AGENCY_ACCOUNT_KEY;
  };

  if (errorParam) {
    const desc = req.nextUrl.searchParams.get('error_description') || errorParam;
    const agency = fallbackIsAgency();
    console.error(`[esp-oauth] ${provider} callback error from provider:`, {
      error: errorParam,
      description: desc,
      isAgencyFlow: agency,
      hasState: Boolean(state),
      stateValid: Boolean(statePayload),
    });
    return agency
      ? redirectSettingsError(req, provider, desc)
      : redirectAccountsError(req, provider, desc);
  }

  if (!code || !state) {
    const agency = fallbackIsAgency();
    console.error(`[esp-oauth] ${provider} callback missing params:`, {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      isAgencyFlow: agency,
    });
    return agency
      ? redirectSettingsError(req, provider, 'Missing authorization code')
      : redirectAccountsError(req, provider, 'Missing authorization code');
  }

  if (!statePayload) {
    // State verification failed — detect agency flow from raw payload so we
    // redirect to /settings (not /subaccounts) for agency re-auth attempts.
    const peekedAccountKey = peekAccountKeyFromState(state);
    const looksLikeAgencyFlow = provider === 'ghl' && peekedAccountKey === GHL_AGENCY_ACCOUNT_KEY;

    console.error(`[esp-oauth] ${provider} callback state verification failed:`, {
      stateLength: state?.length,
      peekedAccountKey: looksLikeAgencyFlow ? '(agency)' : peekedAccountKey || '(empty)',
      looksLikeAgencyFlow,
    });

    const errorMessage = 'Invalid or expired state parameter — please try again';
    return looksLikeAgencyFlow
      ? redirectSettingsError(req, provider, errorMessage)
      : redirectAccountsError(req, provider, errorMessage);
  }

  try {
    const tokens = await adapter.oauth.exchangeCodeForTokens(code);

    const locationId = tokens.locationId;
    let locationName = '';
    if (locationId) {
      try {
        const locationDetails = await adapter.oauth.fetchLocationDetails(tokens.access_token, locationId);
        locationName = locationDetails.name || '';
      } catch (err) {
        console.warn(`Failed to fetch ${provider} location details after OAuth:`, err);
      }
    }

    await adapter.oauth.storeConnection({
      accountKey,
      locationId: locationId || '',
      locationName,
      tokens,
    });

    const grantedScopes = tokens.scope ? tokens.scope.split(' ').filter(Boolean) : [];
    console.info(`[esp-oauth] ${provider} OAuth success:`, {
      isAgencyFlow,
      accountKey: isAgencyFlow ? '(agency)' : accountKey,
      locationId: locationId || '(none)',
      grantedScopesCount: grantedScopes.length,
      grantedScopes,
    });

    if (isAgencyFlow) {
      return redirectSettingsConnected(req, provider);
    }

    try {
      await updateAccountAfterOauth(accountKey, provider);
    } catch (err) {
      console.warn(`Failed to update account ${provider} OAuth data:`, err);
    }

    return redirectAccountConnected(req, accountKey, provider);
  } catch (err) {
    console.error(`${provider} OAuth callback error:`, err);
    const message = err instanceof Error ? err.message : 'OAuth flow failed';
    return isAgencyFlow
      ? redirectSettingsError(req, provider, message)
      : redirectAccountError(req, accountKey, provider, message);
  }
}

async function updateAccountAfterOauth(
  accountKey: string,
  provider: EspProvider,
) {
  const account = await accountService.getAccount(accountKey);
  if (!account) return;

  const update: Parameters<typeof accountService.updateAccount>[1] = {
    espProvider: provider,
  };

  await accountService.updateAccount(accountKey, update);
}
