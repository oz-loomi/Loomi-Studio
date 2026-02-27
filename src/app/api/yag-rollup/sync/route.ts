import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import { runYagRollupSync } from '@/lib/services/yag-rollup';

function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed);
}

export async function POST(req: NextRequest) {
  const { error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const result = await runYagRollupSync({
      dryRun: body.dryRun === true,
      fullSync: body.fullSync === true,
      sourceAccountLimit: parseOptionalInt(body.sourceAccountLimit),
      maxUpserts: parseOptionalInt(body.maxUpserts),
    });

    const statusCode = result.status === 'failed' ? 500 : 200;
    return NextResponse.json(result, { status: statusCode });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to run YAG rollup sync';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
