import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { type CustomValueInput, type SyncResult } from '@/lib/esp/types';
import * as accountService from '@/lib/services/accounts';
import { prisma } from '@/lib/prisma';
import {
  isResolveError,
  resolveAdapterAndCredentials,
} from '@/lib/esp/route-helpers';
import { providerUnsupportedMessage } from '@/lib/esp/provider-display';
import { providerCustomValuesSyncDelayMs } from '@/lib/esp/provider-runtime';

type CustomValueDef = { name: string; value: string };

const DEFAULTS_KEY = '_customValueDefaults';
/**
 * Read the global custom value defaults from the special Account record.
 */
async function readDefaults(): Promise<Record<string, CustomValueDef>> {
  const record = await prisma.account.findUnique({ where: { key: DEFAULTS_KEY } });
  if (!record?.customValues) return {};
  try {
    return JSON.parse(record.customValues);
  } catch {
    return {};
  }
}

/** Small provider-specific delay to avoid API burst/rate-limit errors during bulk sync. */
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * POST /api/custom-values/sync-all
 *
 * Bulk sync custom values across multiple accounts/providers.
 * Loomi-managed values that have been cleared/removed will be deleted from the connected ESP.
 * Values created directly in the ESP (outside Loomi) are never touched.
 *
 * Body: { accountKeys?: string[] }
 * - accountKeys: optional filter — if omitted, syncs all non-internal accounts
 *
 * Returns: Record<accountKey, SyncResult | { error: string; skipped: true }>
 */
export async function POST(req: NextRequest) {
  const { error } = await requireRole('developer');
  if (error) return error;

  try {
    let accountKeys: string[] | undefined;
    let deleteManaged = false;

    try {
      const body = await req.json();
      accountKeys = Array.isArray(body?.accountKeys)
        ? body.accountKeys
        : undefined;
      deleteManaged = body?.deleteManaged === true;
    } catch {
      // No body — sync all
    }

    const defaults = await readDefaults();

    // Get all accounts (or filtered set)
    const allAccounts = accountKeys
      ? await accountService.getAccounts(accountKeys)
      : await accountService.getAccounts();

    // Build the list of accounts to sync (skip internal records)
    const accountsToSync = allAccounts.filter((account) => !account.key.startsWith('_'));

    const results: Record<string, SyncResult | { error: string; skipped: true }> = {};

    for (const account of accountsToSync) {
      const key = account.key;
      const resolved = await resolveAdapterAndCredentials(key, {
        requireCapability: 'customValues',
      });
      if (isResolveError(resolved)) {
        results[key] = { error: resolved.error, skipped: true };
        continue;
      }
      const { adapter, credentials } = resolved;
      if (!adapter.capabilities.customValues || !adapter.customValues) {
        results[key] = {
          error: providerUnsupportedMessage(adapter.provider, 'custom value sync'),
          skipped: true,
        };
        continue;
      }

      // Merge defaults + per-account overrides
      let overrides: Record<string, CustomValueDef> = {};
      if (account.customValues) {
        try {
          overrides = JSON.parse(account.customValues);
        } catch {
          overrides = {};
        }
      }
      const merged: Record<string, CustomValueDef> = { ...defaults };
      for (const [k, v] of Object.entries(overrides)) {
        merged[k] = v;
      }

      // Build desired list (non-empty values) and managed names (all Loomi-defined names)
      const desired: CustomValueInput[] = [];
      const managedNames: string[] = [];
      for (const [fieldKey, def] of Object.entries(merged)) {
        managedNames.push(def.name); // Track all names Loomi manages
        if (def.value) {
          desired.push({ fieldKey, name: def.name, value: def.value });
        }
      }

      try {
        results[key] = await adapter.customValues.syncCustomValues(
          credentials.token,
          credentials.locationId,
          desired,
          deleteManaged ? managedNames : undefined,
        );
      } catch (err) {
        results[key] = {
          error: err instanceof Error ? err.message : 'Sync failed',
          skipped: true,
        };
      }

      const providerDelay = providerCustomValuesSyncDelayMs(adapter.provider);
      if (providerDelay > 0) {
        await delay(providerDelay);
      }
    }

    return NextResponse.json({
      total: accountsToSync.length,
      results,
    });
  } catch (err) {
    console.error('Bulk custom values sync error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Bulk sync failed' },
      { status: 500 },
    );
  }
}
