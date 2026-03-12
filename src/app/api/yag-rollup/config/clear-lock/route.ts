import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { ELEVATED_ROLES } from '@/lib/auth';
import { clearStaleRunLock } from '@/lib/services/yag-rollup';

export async function POST(req: NextRequest) {
  const { error } = await requireRole(...ELEVATED_ROLES);
  if (error) return error;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const jobKey = typeof body.jobKey === 'string' ? body.jobKey : undefined;
    await clearStaleRunLock(jobKey);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to clear stale lock';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
