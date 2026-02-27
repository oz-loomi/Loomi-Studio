import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import * as accountService from '@/lib/services/accounts';
import { getAdapterForAccount } from '@/lib/esp/registry';
import { withConcurrencyLimit } from '@/lib/esp/utils';
import {
  isLikelyDeliverableEmail,
  normalizeEmailAddress,
} from '@/lib/contact-hygiene';
import '@/lib/esp/init';

type DuplicateEntry = {
  accountKey: string;
  contactId: string;
  fullName: string;
};

type AccountHygiene = {
  dealer: string;
  connected: boolean;
  provider: string;
  sampledContacts: number;
  validEmailCount: number;
  invalidEmailCount: number;
  duplicateEmailCount: number;
};

/**
 * GET /api/esp/contacts/hygiene
 *
 * Returns a sampled hygiene report (invalid + duplicate emails) across
 * selected accounts for cleanup workflows.
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const limitRaw = Number(req.nextUrl.searchParams.get('limitPerAccount') || '200');
    const limitPerAccount = Number.isFinite(limitRaw)
      ? Math.max(25, Math.min(500, limitRaw))
      : 200;

    const requestedKeys = (req.nextUrl.searchParams.get('accountKeys') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const allAccounts = await accountService.getAccounts();
    const accountMap = new Map(allAccounts.map((account) => [account.key, account]));
    const allKeys = allAccounts
      .filter((account) => !account.key.startsWith('_'))
      .map((account) => account.key);

    const userRole = session!.user.role;
    const userAccountKeys: string[] = session!.user.accountKeys ?? [];
    const hasUnrestrictedAccess =
      userRole === 'developer'
      || userRole === 'super_admin'
      || (userRole === 'admin' && userAccountKeys.length === 0);

    const allowedKeys = hasUnrestrictedAccess
      ? allKeys
      : allKeys.filter((key) => userAccountKeys.includes(key));

    const selectedKeys = requestedKeys.length > 0
      ? requestedKeys.filter((key) => allowedKeys.includes(key))
      : allowedKeys;

    const perAccount: Record<string, AccountHygiene> = {};
    const errors: Record<string, string> = {};
    const buckets = new Map<string, DuplicateEntry[]>();

    const tasks = selectedKeys.map((accountKey) => async () => {
      const dealer = accountMap.get(accountKey)?.dealer || accountKey;

      try {
        const adapter = await getAdapterForAccount(accountKey);
        if (!adapter.contacts) {
          perAccount[accountKey] = {
            dealer,
            connected: false,
            provider: adapter.provider,
            sampledContacts: 0,
            validEmailCount: 0,
            invalidEmailCount: 0,
            duplicateEmailCount: 0,
          };
          return;
        }

        const credentials = await adapter.contacts.resolveCredentials(accountKey);
        if (!credentials) {
          perAccount[accountKey] = {
            dealer,
            connected: false,
            provider: adapter.provider,
            sampledContacts: 0,
            validEmailCount: 0,
            invalidEmailCount: 0,
            duplicateEmailCount: 0,
          };
          return;
        }

        const page = await adapter.contacts.requestContacts({
          token: credentials.token,
          locationId: credentials.locationId,
          limit: limitPerAccount,
          search: '',
        });
        const normalized = page.contacts.map((contact) => adapter.contacts!.normalizeContact(contact));

        let validEmailCount = 0;
        let invalidEmailCount = 0;

        for (const contact of normalized) {
          const email = normalizeEmailAddress(contact.email);
          if (!email) continue;

          if (!isLikelyDeliverableEmail(email)) {
            invalidEmailCount += 1;
            continue;
          }

          validEmailCount += 1;
          const entries = buckets.get(email) || [];
          entries.push({
            accountKey,
            contactId: contact.id,
            fullName: contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' '),
          });
          buckets.set(email, entries);
        }

        perAccount[accountKey] = {
          dealer,
          connected: true,
          provider: adapter.provider,
          sampledContacts: normalized.length,
          validEmailCount,
          invalidEmailCount,
          duplicateEmailCount: 0,
        };
      } catch (err) {
        errors[accountKey] = err instanceof Error ? err.message : 'Failed to fetch contacts';
        perAccount[accountKey] = {
          dealer,
          connected: true,
          provider: 'unknown',
          sampledContacts: 0,
          validEmailCount: 0,
          invalidEmailCount: 0,
          duplicateEmailCount: 0,
        };
      }
    });

    await withConcurrencyLimit(tasks, 5);

    const duplicateEmails: Array<{
      email: string;
      occurrences: number;
      accounts: string[];
      contacts: DuplicateEntry[];
    }> = [];

    for (const [email, entries] of buckets.entries()) {
      if (entries.length < 2) continue;
      const accounts = [...new Set(entries.map((entry) => entry.accountKey))];

      duplicateEmails.push({
        email,
        occurrences: entries.length,
        accounts,
        contacts: entries.slice(0, 15),
      });

      for (const accountKey of accounts) {
        const row = perAccount[accountKey];
        if (row) row.duplicateEmailCount += 1;
      }
    }

    duplicateEmails.sort((a, b) => b.occurrences - a.occurrences);

    const totals = Object.values(perAccount).reduce(
      (acc, row) => {
        acc.sampledContacts += row.sampledContacts;
        acc.validEmailCount += row.validEmailCount;
        acc.invalidEmailCount += row.invalidEmailCount;
        return acc;
      },
      { sampledContacts: 0, validEmailCount: 0, invalidEmailCount: 0 },
    );

    return NextResponse.json({
      perAccount,
      duplicateEmails,
      errors,
      meta: {
        accountsRequested: selectedKeys.length,
        accountsFetched: Object.keys(perAccount).length,
        limitPerAccount,
        sampledContacts: totals.sampledContacts,
        validEmailCount: totals.validEmailCount,
        invalidEmailCount: totals.invalidEmailCount,
        duplicateEmailGroups: duplicateEmails.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate hygiene report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
