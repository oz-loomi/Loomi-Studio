import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import { listAgencyLocations } from '@/lib/esp/adapters/ghl/oauth';

/**
 * GET /api/esp/connections/ghl/locations?search=&limit=
 *
 * Lists locations available to the connected GHL agency credential.
 */
export async function GET(req: NextRequest) {
  const { error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  const search = req.nextUrl.searchParams.get('search')?.trim() || '';
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limitRaw && !Number.isFinite(limit)) {
    return NextResponse.json({ error: 'limit must be a number' }, { status: 400 });
  }

  try {
    const locations = await listAgencyLocations({ search, limit });
    return NextResponse.json({
      provider: 'ghl',
      total: locations.length,
      locations,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list GHL locations';
    const status =
      message.includes('not connected') ? 404 :
      message.includes('(401)') ? 401 :
      message.includes('(403)') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
