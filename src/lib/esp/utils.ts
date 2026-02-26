import { prisma } from '@/lib/prisma';
import type { EspProvider, StoredAccount } from './types';
import { getDefaultEspProvider } from './registry';

// ── Concurrency Limiter ──

/**
 * Run async tasks with a concurrency limit.
 */
export async function withConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      try {
        const value = await tasks[index]();
        results[index] = { status: 'fulfilled', value };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => runNext(),
  );
  await Promise.all(workers);

  return results;
}

// ── Read All Accounts ──

/**
 * Read all accounts from the database.
 */
export async function readAccounts(): Promise<Record<string, StoredAccount>> {
  const accounts = await prisma.account.findMany({
    select: { key: true, dealer: true, espProvider: true },
  });
  const result: Record<string, StoredAccount> = {};
  for (const account of accounts) {
    if (account.key.startsWith('_')) continue; // skip internal records
    result[account.key] = {
      dealer: account.dealer,
      espProvider: (account.espProvider as EspProvider) || getDefaultEspProvider(),
    };
  }
  return result;
}
