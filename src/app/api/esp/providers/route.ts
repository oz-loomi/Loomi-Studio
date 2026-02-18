import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import '@/lib/esp/init';
import { getAdapter, getRegisteredProviders } from '@/lib/esp/registry';
import { getEspConnectionsStatus } from '@/lib/esp/connections';
import { listWebhookEndpointsForProvider } from '@/lib/esp/webhooks/families';

/**
 * GET /api/esp/providers
 * GET /api/esp/providers?accountKey=xxx
 *
 * Returns registered ESP providers and adapter capabilities.
 * If `accountKey` is provided, also includes per-provider connection status
 * for that account, plus provider webhook endpoints by supported family.
 */
export async function GET(req: NextRequest) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  try {
    const accountKey = req.nextUrl.searchParams.get('accountKey')?.trim()
      || '';
    const status = accountKey
      ? await getEspConnectionsStatus(accountKey)
      : null;

    const providers = getRegisteredProviders().map((provider) => {
      const adapter = getAdapter(provider);
      const providerStatus = status?.providers?.[provider];
      const webhookEndpoints = listWebhookEndpointsForProvider(provider);
      const oauthConnected = providerStatus?.oauthConnected === true
        || (providerStatus?.connected === true && providerStatus?.connectionType === 'oauth');
      const scopes = Array.isArray(providerStatus?.scopes)
        ? providerStatus.scopes
        : undefined;

      return {
        provider,
        capabilities: adapter.capabilities,
        oauthSupported: Boolean(adapter.oauth),
        credentialConnectSupported: Boolean(adapter.connection && adapter.capabilities.auth !== 'oauth'),
        validationSupported: Boolean(adapter.validation),
        businessDetailsRefreshSupported: Boolean(adapter.validation && adapter.capabilities.auth === 'oauth'),
        businessDetailsSyncSupported: Boolean(adapter.accountDetailsSync),
        connected: providerStatus?.connected === true,
        connectionType: providerStatus?.connectionType || 'none',
        oauthConnected,
        locationId: providerStatus?.locationId || undefined,
        locationName: providerStatus?.locationName || undefined,
        scopes,
        tokenExpiresAt: providerStatus?.tokenExpiresAt || undefined,
        accountId: providerStatus?.accountId || undefined,
        accountName: providerStatus?.accountName || undefined,
        activeForAccount: accountKey ? status?.accountProvider === provider : undefined,
        webhookEndpoints,
      };
    });

    return NextResponse.json({
      providers,
      ...(accountKey
        ? { accountKey, accountProvider: status?.accountProvider || null }
        : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list ESP providers';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
