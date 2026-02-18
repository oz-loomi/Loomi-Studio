import '@/lib/esp/init';

import { NextRequest, NextResponse } from 'next/server';
import { getAdapter } from '@/lib/esp/registry';
import type { EspProvider } from '@/lib/esp/types';
import * as accountService from '@/lib/services/accounts';

function redirectAccountsError(req: NextRequest, provider: EspProvider, message: string): NextResponse {
  const url = new URL('/accounts', req.url);
  url.searchParams.set('esp_error', message);
  url.searchParams.set('esp_provider', provider);
  return NextResponse.redirect(url);
}

function redirectAccountConnected(req: NextRequest, accountKey: string, provider: EspProvider): NextResponse {
  const url = new URL(`/accounts/${accountKey}`, req.url);
  url.searchParams.set('esp_connected', 'true');
  url.searchParams.set('esp_provider', provider);
  return NextResponse.redirect(url);
}

function redirectAccountError(
  req: NextRequest,
  accountKey: string,
  provider: EspProvider,
  message: string,
): NextResponse {
  const url = new URL(`/accounts/${accountKey}`, req.url);
  url.searchParams.set('esp_error', message);
  url.searchParams.set('esp_provider', provider);
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

  if (errorParam) {
    const desc = req.nextUrl.searchParams.get('error_description') || errorParam;
    return redirectAccountsError(req, provider, desc);
  }

  if (!code || !state) {
    return redirectAccountsError(req, provider, 'Missing authorization code');
  }

  const statePayload = adapter.oauth.verifyState(state);
  if (!statePayload) {
    return redirectAccountsError(req, provider, 'Invalid or expired state parameter');
  }

  const accountKey = statePayload.accountKey;

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

    try {
      await updateAccountAfterOauth(accountKey, provider);
    } catch (err) {
      console.warn(`Failed to update account ${provider} OAuth data:`, err);
    }

    return redirectAccountConnected(req, accountKey, provider);
  } catch (err) {
    console.error(`${provider} OAuth callback error:`, err);
    const message = err instanceof Error ? err.message : 'OAuth flow failed';
    return redirectAccountError(req, accountKey, provider, message);
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
