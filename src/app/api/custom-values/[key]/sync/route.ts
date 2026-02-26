import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { type CustomValueInput } from '@/lib/esp/types';
import * as accountService from '@/lib/services/accounts';
import { prisma } from '@/lib/prisma';
import {
  isResolveError,
  resolveAdapterAndCredentials,
} from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';

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

/**
 * POST /api/custom-values/[key]/sync
 *
 * Pushes merged custom values for a specific account to its connected ESP,
 * when that provider supports custom value syncing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { error } = await requireRole('developer', 'super_admin');
  if (error) return error;

  try {
    const { key } = await params;
    const account = await accountService.getAccount(key);

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const resolved = await resolveAdapterAndCredentials(key, {
      requireCapability: 'customValues',
    });
    if (isResolveError(resolved)) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const { adapter, credentials } = resolved;
    if (!adapter.capabilities.customValues || !adapter.customValues) {
      return NextResponse.json(
        unsupportedCapabilityPayload(adapter.provider, 'custom value sync'),
        { status: 501 },
      );
    }

    // Parse optional body
    let deleteManaged = false;
    try {
      const body = await req.json();
      deleteManaged = body?.deleteManaged === true;
    } catch {
      // No body or invalid JSON — use defaults
    }

    // Build merged custom values
    const defaults = await readDefaults();
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

    const result = await adapter.customValues.syncCustomValues(
      credentials.token,
      credentials.locationId,
      desired,
      deleteManaged ? managedNames : undefined,
    );

    const hasErrors = result.errors.length > 0;
    const parts: string[] = [];
    if (result.created.length > 0) parts.push(`${result.created.length} created`);
    if (result.updated.length > 0) parts.push(`${result.updated.length} updated`);
    if (result.deleted.length > 0) parts.push(`${result.deleted.length} deleted`);
    if (result.skipped.length > 0) parts.push(`${result.skipped.length} unchanged`);

    return NextResponse.json({
      synced: !hasErrors,
      provider: adapter.provider,
      result,
      message: hasErrors
        ? `Sync completed with ${result.errors.length} error(s).`
        : parts.length > 0
          ? `Synced: ${parts.join(', ')}.`
          : 'No custom values with non-empty values to sync.',
    });
  } catch (err) {
    console.error('Custom values sync error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Custom values sync failed' },
      { status: 500 },
    );
  }
}
