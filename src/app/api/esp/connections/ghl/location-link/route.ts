import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import * as accountService from '@/lib/services/accounts';
import { getAccountProviderLink } from '@/lib/esp/account-provider-links';
import {
  linkAccountToLocation,
  unlinkAccountLocation,
} from '@/lib/esp/adapters/ghl/oauth';

/**
 * GET /api/esp/connections/ghl/location-link?accountKey=xxx
 *
 * Returns account -> GHL location link for one account.
 */
export async function GET(req: NextRequest) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  const accountKey = req.nextUrl.searchParams.get('accountKey')?.trim() || '';
  if (!accountKey) {
    return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
  }

  try {
    const link = await getAccountProviderLink(accountKey, 'ghl');
    return NextResponse.json({
      accountKey,
      provider: 'ghl',
      linked: Boolean(link?.locationId),
      link: link
        ? {
          locationId: link.locationId,
          locationName: link.locationName,
          linkedAt: link.linkedAt.toISOString(),
          updatedAt: link.updatedAt.toISOString(),
        }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch location link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/esp/connections/ghl/location-link
 *
 * Body: { accountKey: string, locationId: string, locationName?: string }
 */
export async function POST(req: NextRequest) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  let body: { accountKey?: string; locationId?: string; locationName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const accountKey = typeof body.accountKey === 'string' ? body.accountKey.trim() : '';
  const locationId = typeof body.locationId === 'string' ? body.locationId.trim() : '';
  const locationName = typeof body.locationName === 'string' ? body.locationName.trim() : '';

  if (!accountKey) {
    return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
  }
  if (!locationId) {
    return NextResponse.json({ error: 'locationId is required' }, { status: 400 });
  }

  const account = await accountService.getAccount(accountKey);
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  try {
    const link = await linkAccountToLocation({
      accountKey,
      locationId,
      ...(locationName ? { locationName } : {}),
    });
    return NextResponse.json({
      success: true,
      provider: 'ghl',
      link,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to link account location';
    const status =
      message.includes('not connected') ? 404 :
      message.includes('required') ? 400 :
      message.includes('(401)') ? 401 :
      message.includes('(403)') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/esp/connections/ghl/location-link
 *
 * Body: { accountKey: string }
 */
export async function DELETE(req: NextRequest) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  let body: { accountKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const accountKey = typeof body.accountKey === 'string' ? body.accountKey.trim() : '';
  if (!accountKey) {
    return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
  }

  try {
    const removed = await unlinkAccountLocation(accountKey);
    return NextResponse.json({
      success: true,
      provider: 'ghl',
      removed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to unlink account location';
    const status = message.includes('required') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
