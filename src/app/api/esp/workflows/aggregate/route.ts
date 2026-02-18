import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { getAdapterForAccount } from '@/lib/esp/registry';
import { readAccounts, withConcurrencyLimit } from '@/lib/esp/utils';
import type { EspWorkflow } from '@/lib/esp/types';
import '@/lib/esp/init';

/**
 * GET /api/esp/workflows/aggregate
 *
 * Provider-agnostic aggregate workflows/flows across ALL connected accounts.
 */
export async function GET() {
  const { session, error } = await requireRole('developer', 'admin');
  if (error) return error;

  try {
    const accounts = await readAccounts();
    const allKeys = Object.keys(accounts).filter(k => !k.startsWith('_'));

    const userRole = session!.user.role;
    const userAccountKeys: string[] = session!.user.accountKeys ?? [];
    const allowedKeys = userRole === 'developer'
      ? allKeys
      : allKeys.filter(k => userAccountKeys.includes(k));

    const allWorkflows: (EspWorkflow & { accountKey: string; dealer: string; provider: string })[] = [];
    const perAccount: Record<string, { dealer: string; count: number; connected: boolean; provider: string }> = {};
    const errors: Record<string, string> = {};

    const tasks = allowedKeys.map((accountKey) => async () => {
      const account = accounts[accountKey];
      const dealer = account?.dealer || accountKey;

      try {
        const adapter = await getAdapterForAccount(accountKey);
        if (!adapter.campaigns || !adapter.contacts) {
          perAccount[accountKey] = { dealer, count: 0, connected: false, provider: adapter.provider };
          return;
        }

        const credentials = await adapter.contacts.resolveCredentials(accountKey);
        if (!credentials) {
          perAccount[accountKey] = { dealer, count: 0, connected: false, provider: adapter.provider };
          return;
        }

        const workflows = await adapter.campaigns.fetchWorkflows(credentials.token, credentials.locationId);
        const tagged = workflows.map((workflow) => ({
          ...workflow,
          accountKey: workflow.accountKey || accountKey,
          dealer,
          provider: adapter.provider,
        }));
        allWorkflows.push(...tagged);
        perAccount[accountKey] = { dealer, count: workflows.length, connected: true, provider: adapter.provider };
      } catch (err) {
        errors[accountKey] = err instanceof Error ? err.message : 'Failed to fetch';
        perAccount[accountKey] = { dealer, count: 0, connected: true, provider: 'unknown' };
      }
    });

    await withConcurrencyLimit(tasks, 3);

    return NextResponse.json({
      workflows: allWorkflows,
      perAccount,
      errors,
      meta: { totalWorkflows: allWorkflows.length, accountsFetched: Object.keys(perAccount).length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch aggregate workflows';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
