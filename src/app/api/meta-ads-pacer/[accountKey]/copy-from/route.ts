import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import {
  canAccessPacer,
  fetchPeriodPlan,
  getOrCreatePlan,
  isValidPeriod,
} from '@/lib/meta-ads-pacer';

interface CopyFromBody {
  from?: string;
  to?: string;
}

/**
 * Duplicate ads from one period into another.
 *
 * Carries over: name, owner, designer, account rep, action needed,
 * recurring, co-op, budget type, budget source, creative link.
 *
 * Resets (per user request — budgets and timing change month over month):
 * allocation, flight dates, live date, due date, status, design status,
 * approvals, date completed.
 *
 * Drops: design notes, activity log, pacer actuals, pacer daily budget.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ accountKey: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { accountKey } = await params;
  if (!canAccessPacer(session, accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const body = (await req.json()) as CopyFromBody;
  const from = typeof body.from === 'string' ? body.from : '';
  const to = typeof body.to === 'string' ? body.to : '';
  if (!isValidPeriod(from) || !isValidPeriod(to)) {
    return NextResponse.json(
      { error: 'Both from and to must be YYYY-MM strings' },
      { status: 400 },
    );
  }
  if (from === to) {
    return NextResponse.json(
      { error: 'Source and target periods are the same' },
      { status: 400 },
    );
  }

  const plan = await getOrCreatePlan(accountKey);

  await prisma.$transaction(async (tx) => {
    const sourceAds = await tx.metaAdsPacerAd.findMany({
      where: { planId: plan.id, period: from },
      orderBy: { position: 'asc' },
    });
    if (sourceAds.length === 0) return;

    // Append to any existing ads in the target period
    const existing = await tx.metaAdsPacerAd.count({
      where: { planId: plan.id, period: to },
    });

    for (let i = 0; i < sourceAds.length; i++) {
      const src = sourceAds[i];
      await tx.metaAdsPacerAd.create({
        data: {
          planId: plan.id,
          position: existing + i,
          period: to,
          name: src.name,
          ownerUserId: src.ownerUserId,
          designerUserId: src.designerUserId,
          accountRepUserId: src.accountRepUserId,
          actionNeeded: src.actionNeeded,
          recurring: src.recurring,
          coop: src.coop,
          budgetType: src.budgetType,
          budgetSource: src.budgetSource,
          creativeLink: src.creativeLink,
          clientName: src.clientName,
          // Reset
          allocation: null,
          flightStart: null,
          flightEnd: null,
          liveDate: null,
          creativeDueDate: null,
          dueDate: null,
          dateCompleted: null,
          adStatus: 'In Draft',
          designStatus: 'Not Started',
          internalApproval: 'Pending Approval',
          clientApproval: 'Pending Approval',
          pacerActual: null,
          pacerDailyBudget: null,
        },
      });
    }
  });

  const payload = await fetchPeriodPlan(plan.id, to);
  return NextResponse.json({ accountKey, period: to, ...payload });
}
