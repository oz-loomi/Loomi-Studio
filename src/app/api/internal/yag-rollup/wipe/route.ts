import { NextRequest, NextResponse } from 'next/server';
import { requireInternalJobAuth } from '@/lib/internal-jobs';
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
  const authError = requireInternalJobAuth(req);
  if (authError) return authError;

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
      jobKey: typeof body.jobKey === 'string' ? body.jobKey : undefined,
      dryRun,
      mode,
      maxDeletes: parseOptionalInt(body.maxDeletes),
      triggerSource: 'internal-job',
    });

    const statusCode = result.status === 'failed' ? 500 : 200;
    return NextResponse.json(result, { status: statusCode });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to run YAG rollup wipe';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
