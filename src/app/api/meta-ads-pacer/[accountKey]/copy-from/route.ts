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
  /** When present, only copies these ad IDs from the source period. */
  adIds?: string[];
}

/**
 * Shift an ISO date (YYYY-MM-DD) to the equivalent day in `toPeriod` (YYYY-MM).
 * Days that don't exist in the target month (e.g. Jan 31 → Feb) clamp to the
 * last day of the target month. Returns null if input is malformed.
 */
function shiftDate(iso: string | null, toPeriod: string): string | null {
  if (!iso) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [, , dayStr] = iso.split('-');
  const day = Number(dayStr);
  if (!day) return null;

  const [ty, tm] = toPeriod.split('-').map(Number);
  if (!ty || !tm) return null;

  const lastDayOfTarget = new Date(ty, tm, 0).getDate();
  const clampedDay = Math.min(day, lastDayOfTarget);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ty}-${pad(tm)}-${pad(clampedDay)}`;
}

/**
 * Duplicate ads from one period into another.
 *
 * Per-field handling for the copy:
 *  - Preserved as-is: name, owner, designer, account rep, action needed,
 *    recurring, co-op, budget type, budget source, creative link, client name,
 *    design status, design due date.
 *  - Date-shifted to the equivalent day of the target month: flightStart,
 *    flightEnd, liveDate, creativeDueDate, dueDate.
 *  - Reset to defaults: adStatus ("Working on it"), internalApproval,
 *    clientApproval, dateCompleted, allocation, pacerActual, pacerDailyBudget,
 *    pacerTodayDate, pacerEndDate.
 *  - Dropped: design notes, activity log.
 *
 * Optionally accepts `adIds` to restrict the copy to a subset of source ads;
 * if omitted, copies every ad in the source period.
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
  const adIds = Array.isArray(body.adIds)
    ? body.adIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : null;
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
      where: {
        planId: plan.id,
        period: from,
        ...(adIds && adIds.length > 0 ? { id: { in: adIds } } : {}),
      },
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
          // Preserved
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
          designStatus: src.designStatus,
          // Date-shifted to the target month
          flightStart: shiftDate(src.flightStart, to),
          flightEnd: shiftDate(src.flightEnd, to),
          liveDate: shiftDate(src.liveDate, to),
          creativeDueDate: shiftDate(src.creativeDueDate, to),
          dueDate: shiftDate(src.dueDate, to),
          // Reset
          dateCompleted: null,
          adStatus: 'Working on it',
          internalApproval: 'Pending Approval',
          clientApproval: 'Pending Approval',
          allocation: null,
          pacerActual: null,
          pacerDailyBudget: null,
          pacerTodayDate: null,
          pacerEndDate: null,
        },
      });
    }
  });

  const payload = await fetchPeriodPlan(plan.id, to);
  return NextResponse.json({ accountKey, period: to, ...payload });
}
