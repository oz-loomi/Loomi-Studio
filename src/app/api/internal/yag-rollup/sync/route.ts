import { NextRequest, NextResponse } from 'next/server';
import { requireInternalJobAuth } from '@/lib/internal-jobs';
import { runYagRollupSync } from '@/lib/services/yag-rollup';

function parseOptionalInt(value: unknown, fallback: number | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

export async function POST(req: NextRequest) {
  const authError = requireInternalJobAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const dryRun = body.dryRun === true;
    const fullSync = body.fullSync === true;
    const sourceAccountLimit = parseOptionalInt(body.sourceAccountLimit, undefined);
    const maxUpserts = parseOptionalInt(body.maxUpserts, undefined);

    const result = await runYagRollupSync({
      dryRun,
      fullSync,
      sourceAccountLimit,
      maxUpserts,
    });

    const statusCode = result.status === 'failed' ? 500 : 200;
    return NextResponse.json(result, { status: statusCode });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to run YAG rollup sync';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
