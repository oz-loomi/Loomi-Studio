import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  canAccessPacer,
  getOrCreatePlan,
  listPeriods,
} from '@/lib/meta-ads-pacer';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ accountKey: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { accountKey } = await params;
  if (!canAccessPacer(session, accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const plan = await getOrCreatePlan(accountKey);
  const periods = await listPeriods(plan.id);
  return NextResponse.json({ accountKey, periods });
}
