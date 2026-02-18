import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import * as accountService from '@/lib/services/accounts';
import { prisma } from '@/lib/prisma';

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
 * Merge global defaults with per-account overrides.
 * Per-account values take priority over global defaults.
 */
function mergeCustomValues(
  defaults: Record<string, CustomValueDef>,
  overrides?: Record<string, CustomValueDef>,
): Record<string, CustomValueDef> {
  const merged = { ...defaults };
  if (overrides) {
    for (const [key, def] of Object.entries(overrides)) {
      merged[key] = def;
    }
  }
  return merged;
}

/**
 * GET /api/custom-values/[key]
 *
 * Returns the merged custom values for a specific account
 * (global defaults + per-account overrides).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { error } = await requireRole('developer');
  if (error) return error;

  try {
    const { key } = await params;
    const account = await accountService.getAccount(key);

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const defaults = await readDefaults();
    let overrides: Record<string, CustomValueDef> | undefined;
    if (account.customValues) {
      try {
        overrides = JSON.parse(account.customValues);
      } catch {
        overrides = undefined;
      }
    }
    const merged = mergeCustomValues(defaults, overrides);

    return NextResponse.json({
      merged,
      defaults,
      overrides: overrides || {},
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * PUT /api/custom-values/[key]
 *
 * Saves per-account custom value overrides.
 * Body: Record<string, { name: string; value: string }>
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { error } = await requireRole('developer');
  if (error) return error;

  try {
    const { key } = await params;
    const account = await accountService.getAccount(key);

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const body = await req.json() as Record<string, CustomValueDef>;

    // Validate
    for (const [fieldKey, def] of Object.entries(body)) {
      if (!fieldKey || typeof fieldKey !== 'string') {
        return NextResponse.json({ error: `Invalid field key: ${fieldKey}` }, { status: 400 });
      }
      if (!def || typeof def.name !== 'string' || typeof def.value !== 'string') {
        return NextResponse.json({ error: `Invalid definition for key "${fieldKey}"` }, { status: 400 });
      }
    }

    await accountService.updateAccount(key, { customValues: JSON.stringify(body) });

    // Return merged result
    const defaults = await readDefaults();
    const merged = mergeCustomValues(defaults, body);

    return NextResponse.json({
      merged,
      defaults,
      overrides: body,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
