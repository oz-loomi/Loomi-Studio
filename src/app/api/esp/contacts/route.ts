import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';

/**
 * GET /api/esp/contacts?accountKey=xxx
 *
 * Provider-agnostic contact list. Resolves the adapter from the account's
 * espProvider and delegates to the correct contacts adapter.
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireRole('developer', 'admin', 'client');
  if (error) return error;

  try {
    const accountKey = req.nextUrl.searchParams.get('accountKey')?.trim()
      || '';
    if (!accountKey) {
      return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
    }

    // Client-role users can only access their assigned accounts
    if (session!.user.role === 'client') {
      const userAccountKeys = session!.user.accountKeys ?? [];
      if (!userAccountKeys.includes(accountKey)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const result = await resolveAdapterAndCredentials(accountKey, {
      requireCapability: 'contacts',
    });
    if (isResolveError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { adapter, credentials } = result;
    const contacts = adapter.contacts!;

    const fetchAll = req.nextUrl.searchParams.get('all') === 'true';
    const limitRaw = Number(req.nextUrl.searchParams.get('limit') || '25');
    const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 25));
    const search = (req.nextUrl.searchParams.get('search') || '').trim();

    if (fetchAll) {
      const rawContacts = await contacts.fetchAllContacts(credentials.token, credentials.locationId);
      const normalized = rawContacts.map(c => contacts.normalizeContact(c));
      return NextResponse.json({
        contacts: normalized,
        meta: {
          total: normalized.length,
          provider: adapter.provider,
          accountKey,
        },
      });
    }

    const page = await contacts.requestContacts({
      token: credentials.token,
      locationId: credentials.locationId,
      limit,
      search,
    });

    const normalized = page.contacts.map(c => contacts.normalizeContact(c));
    return NextResponse.json({
      contacts: normalized,
      meta: {
        total: page.total,
        provider: adapter.provider,
        accountKey,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch contacts';
    const status =
      message.includes('401') ? 401 :
      message.includes('403') ? 403 :
      message.includes('404') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
