import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import * as accountService from '@/lib/services/accounts';
import { linkAccountToLocation } from '@/lib/esp/adapters/ghl/oauth';

type BulkLocationLinkMappingInput = {
  line?: number;
  accountKey?: string;
  locationId?: string;
  locationName?: string;
};

type BulkLocationLinkResultRow = {
  line: number;
  accountKey: string;
  locationId: string;
  locationName: string | null;
  success: boolean;
  error?: string;
};

/**
 * POST /api/esp/connections/ghl/location-link/bulk
 *
 * Body: {
 *   mappings: Array<{ line?: number; accountKey: string; locationId: string; locationName?: string }>
 * }
 */
export async function POST(req: NextRequest) {
  const { error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  let body: { mappings?: BulkLocationLinkMappingInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const mappings = Array.isArray(body.mappings) ? body.mappings : [];
  if (mappings.length === 0) {
    return NextResponse.json({ error: 'mappings array is required' }, { status: 400 });
  }
  if (mappings.length > 500) {
    return NextResponse.json({ error: 'mappings cannot exceed 500 rows per request' }, { status: 400 });
  }

  const resultsByLine = new Map<number, BulkLocationLinkResultRow>();
  const pendingRows: Array<{ line: number; accountKey: string; locationId: string; locationName?: string }> = [];
  const seenAccountKeys = new Set<string>();

  for (const [index, mapping] of mappings.entries()) {
    const line =
      typeof mapping?.line === 'number' && Number.isFinite(mapping.line) && mapping.line > 0
        ? Math.floor(mapping.line)
        : index + 1;
    const accountKey = typeof mapping?.accountKey === 'string' ? mapping.accountKey.trim() : '';
    const locationId = typeof mapping?.locationId === 'string' ? mapping.locationId.trim() : '';
    const locationName = typeof mapping?.locationName === 'string' ? mapping.locationName.trim() : '';

    if (!accountKey) {
      resultsByLine.set(line, {
        line,
        accountKey: '',
        locationId,
        locationName: locationName || null,
        success: false,
        error: 'accountKey is required',
      });
      continue;
    }
    if (!locationId) {
      resultsByLine.set(line, {
        line,
        accountKey,
        locationId: '',
        locationName: locationName || null,
        success: false,
        error: 'locationId is required',
      });
      continue;
    }
    if (seenAccountKeys.has(accountKey)) {
      resultsByLine.set(line, {
        line,
        accountKey,
        locationId,
        locationName: locationName || null,
        success: false,
        error: 'Duplicate accountKey in batch',
      });
      continue;
    }

    seenAccountKeys.add(accountKey);
    pendingRows.push({
      line,
      accountKey,
      locationId,
      ...(locationName ? { locationName } : {}),
    });
  }

  if (pendingRows.length > 0) {
    const accountKeys = Array.from(new Set(pendingRows.map((row) => row.accountKey)));
    const existingAccounts = await accountService.getAccounts(accountKeys);
    const existingAccountKeys = new Set(existingAccounts.map((account) => account.key));

    for (const row of pendingRows) {
      if (!existingAccountKeys.has(row.accountKey)) {
        resultsByLine.set(row.line, {
          line: row.line,
          accountKey: row.accountKey,
          locationId: row.locationId,
          locationName: row.locationName || null,
          success: false,
          error: 'Account not found',
        });
      }
    }

    const actionableRows = pendingRows.filter((row) => !resultsByLine.has(row.line));
    for (const row of actionableRows) {
      try {
        const linked = await linkAccountToLocation({
          accountKey: row.accountKey,
          locationId: row.locationId,
          ...(row.locationName ? { locationName: row.locationName } : {}),
        });
        resultsByLine.set(row.line, {
          line: row.line,
          accountKey: row.accountKey,
          locationId: linked.locationId,
          locationName: linked.locationName,
          success: true,
        });
      } catch (err) {
        resultsByLine.set(row.line, {
          line: row.line,
          accountKey: row.accountKey,
          locationId: row.locationId,
          locationName: row.locationName || null,
          success: false,
          error: err instanceof Error ? err.message : 'Failed to link account',
        });
      }
    }
  }

  const results = Array.from(resultsByLine.values()).sort((a, b) => a.line - b.line);
  const linked = results.filter((row) => row.success).length;
  const failed = results.length - linked;

  return NextResponse.json({
    success: failed === 0,
    total: results.length,
    linked,
    failed,
    results,
  });
}
