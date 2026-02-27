import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import * as accountService from '@/lib/services/accounts';
import { getAdapterForAccount } from '@/lib/esp/registry';
import { withConcurrencyLimit } from '@/lib/esp/utils';
import type { NormalizedContact } from '@/lib/esp/types';
import { isYagRollupAccount } from '@/lib/accounts/rollup';
import '@/lib/esp/init';

/**
 * GET /api/esp/contacts/aggregate
 *
 * Provider-agnostic sampled contacts across connected accounts.
 * Resolves each account's ESP adapter dynamically and fetches a capped page
 * per account for responsiveness.
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const limitRaw = Number(req.nextUrl.searchParams.get('limitPerAccount') || '120');
    const limitPerAccount = Number.isFinite(limitRaw)
      ? Math.max(25, Math.min(250, limitRaw))
      : 120;
    const requestedKeys = (req.nextUrl.searchParams.get('accountKeys') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const excludeYagRollup = req.nextUrl.searchParams.get('excludeYagRollup') === 'true';

    const allAccounts = await accountService.getAccounts();
    const accountMap = new Map(allAccounts.map(a => [a.key, a]));
    const allKeys = allAccounts.filter(a => !a.key.startsWith('_')).map(a => a.key);

    const userRole = session!.user.role;
    const userAccountKeys: string[] = session!.user.accountKeys ?? [];
    const hasUnrestrictedAccess =
      userRole === 'developer'
      || userRole === 'super_admin'
      || (userRole === 'admin' && userAccountKeys.length === 0);
    const allowedKeys = hasUnrestrictedAccess
      ? allKeys
      : allKeys.filter(k => userAccountKeys.includes(k));
    let selectedKeys = requestedKeys.length > 0
      ? requestedKeys.filter((key) => allowedKeys.includes(key))
      : allowedKeys;
    if (excludeYagRollup) {
      selectedKeys = selectedKeys.filter((key) => !isYagRollupAccount(key, accountMap.get(key)?.dealer));
    }

    const allContacts: (NormalizedContact & { _accountKey: string; _dealer: string })[] = [];
    const perAccount: Record<string, { dealer: string; count: number; connected: boolean; provider: string }> = {};
    const errors: Record<string, string> = {};

    const tasks = selectedKeys.map((accountKey) => async () => {
      const account = accountMap.get(accountKey);
      const dealer = account?.dealer || accountKey;

      try {
        const adapter = await getAdapterForAccount(accountKey);
        if (!adapter.contacts) {
          perAccount[accountKey] = { dealer, count: 0, connected: false, provider: adapter.provider };
          return;
        }

        const credentials = await adapter.contacts.resolveCredentials(accountKey);
        if (!credentials) {
          perAccount[accountKey] = { dealer, count: 0, connected: false, provider: adapter.provider };
          return;
        }

        const page = await adapter.contacts.requestContacts({
          token: credentials.token,
          locationId: credentials.locationId,
          limit: limitPerAccount,
          search: '',
        });
        const normalized = page.contacts.map(c => ({
          ...adapter.contacts!.normalizeContact(c),
          _accountKey: accountKey,
          _dealer: dealer,
        }));
        allContacts.push(...normalized);
        perAccount[accountKey] = {
          dealer,
          count: typeof page.total === 'number' ? page.total : normalized.length,
          connected: true,
          provider: adapter.provider,
        };
      } catch (err) {
        errors[accountKey] = err instanceof Error ? err.message : 'Failed to fetch';
        perAccount[accountKey] = { dealer, count: 0, connected: true, provider: 'unknown' };
      }
    });

    await withConcurrencyLimit(tasks, 5);

    return NextResponse.json({
      contacts: allContacts,
      perAccount,
      errors,
      meta: {
        accountsRequested: selectedKeys.length,
        totalContacts: Object.values(perAccount).reduce((sum, entry) => sum + entry.count, 0),
        accountsFetched: Object.keys(perAccount).length,
        sampledContacts: allContacts.length,
        sampled: true,
        limitPerAccount,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch aggregate contacts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
