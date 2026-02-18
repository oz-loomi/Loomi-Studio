import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import * as accountService from '@/lib/services/accounts';
import { getAdapterForAccount } from '@/lib/esp/registry';
import { withConcurrencyLimit } from '@/lib/esp/utils';
import type { NormalizedContact } from '@/lib/esp/types';
import '@/lib/esp/init';

/**
 * GET /api/esp/contacts/aggregate
 *
 * Provider-agnostic aggregate contacts across ALL connected accounts.
 * Resolves each account's ESP adapter dynamically.
 */
export async function GET() {
  const { session, error } = await requireRole('developer', 'admin');
  if (error) return error;

  try {
    const allAccounts = await accountService.getAccounts();
    const accountMap = new Map(allAccounts.map(a => [a.key, a]));
    const allKeys = allAccounts.filter(a => !a.key.startsWith('_')).map(a => a.key);

    const userRole = session!.user.role;
    const userAccountKeys: string[] = session!.user.accountKeys ?? [];
    const allowedKeys = userRole === 'developer'
      ? allKeys
      : allKeys.filter(k => userAccountKeys.includes(k));

    const allContacts: (NormalizedContact & { _accountKey: string; _dealer: string })[] = [];
    const perAccount: Record<string, { dealer: string; count: number; connected: boolean; provider: string }> = {};
    const errors: Record<string, string> = {};

    const tasks = allowedKeys.map((accountKey) => async () => {
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

        const raw = await adapter.contacts.fetchAllContacts(credentials.token, credentials.locationId);
        const normalized = raw.map(c => ({
          ...adapter.contacts!.normalizeContact(c),
          _accountKey: accountKey,
          _dealer: dealer,
        }));
        allContacts.push(...normalized);
        perAccount[accountKey] = { dealer, count: normalized.length, connected: true, provider: adapter.provider };
      } catch (err) {
        errors[accountKey] = err instanceof Error ? err.message : 'Failed to fetch';
        perAccount[accountKey] = { dealer, count: 0, connected: true, provider: 'unknown' };
      }
    });

    await withConcurrencyLimit(tasks, 3);

    return NextResponse.json({
      contacts: allContacts,
      perAccount,
      errors,
      meta: {
        totalContacts: allContacts.length,
        accountsFetched: Object.keys(perAccount).length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch aggregate contacts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
