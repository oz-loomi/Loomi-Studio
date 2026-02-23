import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import {
  disconnectAgencyConnection,
  getAgencyConnectionStatus,
} from '@/lib/esp/adapters/ghl/oauth';

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
