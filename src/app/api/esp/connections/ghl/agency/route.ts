import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import {
  disconnectAgencyConnection,
  getAgencyConnectionStatus,
  refreshAccessToken,
  encryptToken,
  decryptToken,
  REQUIRED_SCOPES,
} from '@/lib/esp/adapters/ghl/oauth';
import { getProviderOAuthCredential, upsertProviderOAuthCredential } from '@/lib/esp/provider-oauth-credentials';
import { parseScopes } from '@/lib/esp/scope-utils';

/**
 * GET /api/esp/connections/ghl/agency
 *
 * Returns GHL agency OAuth connection status.
 */
export async function GET() {
  const { error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const status = await getAgencyConnectionStatus();
    return NextResponse.json({
      provider: 'ghl',
      ...status,
      connectUrl: '/api/esp/connections/authorize?provider=ghl&mode=agency',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch agency status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/esp/connections/ghl/agency
 *
 * Force-refresh the stored agency OAuth token using the refresh token.
 * This picks up any new scopes that were added to the GHL marketplace app
 * since the original authorization, without requiring a full re-auth flow.
 */
export async function POST() {
  const { error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const credential = await getProviderOAuthCredential('ghl');
    if (!credential) {
      return NextResponse.json(
        { error: 'No GHL agency OAuth credential found. Please connect agency OAuth first.' },
        { status: 404 },
      );
    }

    let decryptedRefreshToken: string;
    try {
      decryptedRefreshToken = decryptToken(credential.refreshToken);
    } catch {
      return NextResponse.json(
        { error: 'Failed to decrypt stored refresh token. Please re-authorize agency OAuth.' },
        { status: 500 },
      );
    }

    const oldScopes = parseScopes(credential.scopes);

    console.info('[ghl-agency] Force-refreshing agency token...', {
      oldScopesCount: oldScopes.length,
      tokenExpiresAt: credential.tokenExpiresAt.toISOString(),
    });

    const refreshed = await refreshAccessToken(decryptedRefreshToken);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    const newScopes = refreshed.scope ? refreshed.scope.split(' ').filter(Boolean) : [];
    const newScopesJson = JSON.stringify(newScopes);

    // Encode the refreshed token's userType into subjectType for diagnostics
    const refreshedUserType = refreshed.userType || 'unknown';
    const updatedSubjectType = `agency:${refreshedUserType}`;

    await upsertProviderOAuthCredential({
      provider: 'ghl',
      subjectType: updatedSubjectType,
      subjectId: credential.subjectId,
      accessToken: encryptToken(refreshed.access_token),
      refreshToken: encryptToken(refreshed.refresh_token),
      tokenExpiresAt: newExpiresAt,
      scopes: newScopesJson,
      installedAt: credential.installedAt,
    });

    const addedScopes = newScopes.filter((scope) => !oldScopes.includes(scope));
    const removedScopes = oldScopes.filter((scope) => !newScopes.includes(scope));
    const missingRequired = REQUIRED_SCOPES.filter((scope) => !newScopes.includes(scope));

    console.info('[ghl-agency] Agency token force-refreshed successfully:', {
      newScopesCount: newScopes.length,
      addedScopes,
      removedScopes,
      missingRequiredScopes: missingRequired,
      tokenExpiresAt: newExpiresAt.toISOString(),
    });

    return NextResponse.json({
      success: true,
      scopes: newScopes,
      addedScopes,
      removedScopes,
      missingRequiredScopes: missingRequired,
      allScopesGranted: missingRequired.length === 0,
      tokenExpiresAt: newExpiresAt.toISOString(),
    });
  } catch (err) {
    console.error('[ghl-agency] Force token refresh failed:', err);
    const message = err instanceof Error ? err.message : 'Token refresh failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/esp/connections/ghl/agency
 *
 * Disconnects stored GHL agency OAuth credentials.
 */
export async function DELETE() {
  const { error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const removed = await disconnectAgencyConnection();
    const envTokenConfigured = Boolean(process.env.GHL_AGENCY_TOKEN?.trim());
    return NextResponse.json({
      success: true,
      removed,
      envTokenConfigured,
      ...(envTokenConfigured
        ? {
          warning: 'GHL_AGENCY_TOKEN is set in environment; agency access may still be available until removed from env.',
        }
        : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to disconnect agency OAuth';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
