import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import { runYagRollupWipe, type YagRollupWipeMode } from '@/lib/services/yag-rollup';

function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed);
}

function parseMode(value: unknown): YagRollupWipeMode {
  return value === 'all' ? 'all' : 'tagged';
}

export async function POST(req: NextRequest) {
  const { error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const dryRun = body.dryRun === true;
    const mode = parseMode(body.mode);
    const confirmAll = body.confirmAll === true;
    if (!dryRun && mode === 'all' && !confirmAll) {
      return NextResponse.json(
        { error: 'confirmAll=true is required for non-dry all-contact wipes' },
        { status: 400 },
      );
    }

    const result = await runYagRollupWipe({
      dryRun,
      mode,
      maxDeletes: parseOptionalInt(body.maxDeletes),
    });

    const statusCode = result.status === 'failed' ? 500 : 200;
    return NextResponse.json(result, { status: statusCode });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to run YAG rollup wipe';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

