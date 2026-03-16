import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import * as accountService from '@/lib/services/accounts';
import { getAdapterForAccount } from '@/lib/esp/registry';
import { withConcurrencyLimit } from '@/lib/esp/utils';
import { filterAccountKeysByAccess } from '@/lib/roles';
import '@/lib/esp/init';

/**
 * GET /api/esp/contacts/stats
 *
 * Provider-agnostic contact count stats across all accounts.
 */
export async function GET(req: Request) {
  const { session, error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const allAccounts = await accountService.getAccounts();
    const accountMap = new Map(allAccounts.map((account) => [account.key, account]));
    const allKeys = allAccounts.filter(a => !a.key.startsWith('_')).map(a => a.key);
    const requestedKeys = (searchParams.get('accountKeys') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const userRole = session!.user.role;
    const userAccountKeys: string[] = session!.user.accountKeys ?? [];
    const allowedKeys = filterAccountKeysByAccess(allKeys, userRole, userAccountKeys);
    const selectedKeys = requestedKeys.length > 0
      ? requestedKeys.filter((key) => allowedKeys.includes(key))
      : allowedKeys;

    const stats: Record<string, { dealer: string; count: number; connected: boolean; cached: boolean; provider: string }> = {};
    const errors: Record<string, string> = {};

    const tasks = selectedKeys.map((accountKey) => async () => {
      const account = accountMap.get(accountKey);
      const dealer = account?.dealer || accountKey;

      try {
        const adapter = await getAdapterForAccount(accountKey);
        if (!adapter.contacts) {
          stats[accountKey] = { dealer, count: 0, connected: false, cached: false, provider: adapter.provider };
          return;
        }

        // Check cache first
        const cached = adapter.contacts.getCachedContactCount(accountKey);
        if (cached !== null) {
          stats[accountKey] = { dealer, count: cached, connected: true, cached: true, provider: adapter.provider };
          return;
        }

        const credentials = await adapter.contacts.resolveCredentials(accountKey);
        if (!credentials) {
          stats[accountKey] = { dealer, count: 0, connected: false, cached: false, provider: adapter.provider };
          return;
        }

        const count = await adapter.contacts.fetchContactCount(credentials.token, credentials.locationId);
        adapter.contacts.setCachedContactCount(accountKey, count);
        stats[accountKey] = { dealer, count, connected: true, cached: false, provider: adapter.provider };
      } catch (err) {
        errors[accountKey] = err instanceof Error ? err.message : 'Failed to fetch count';
        stats[accountKey] = { dealer, count: 0, connected: true, cached: false, provider: 'unknown' };
      }
    });

    await withConcurrencyLimit(tasks, 5);

    const totalContacts = Object.values(stats).reduce((sum, s) => sum + s.count, 0);
    const connectedAccounts = Object.values(stats).filter(s => s.connected).length;

    return NextResponse.json({
      stats,
      errors,
      meta: { totalContacts, connectedAccounts, accountsFetched: selectedKeys.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch contact stats';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
