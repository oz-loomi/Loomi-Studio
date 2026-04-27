import type { Session } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { s3PublicUrl } from '@/lib/s3';

function attachUrl<T extends { attachmentKey: string | null }>(entry: T): T & { attachmentUrl: string | null } {
  let attachmentUrl: string | null = null;
  if (entry.attachmentKey) {
    try {
      attachmentUrl = s3PublicUrl(entry.attachmentKey);
    } catch {
      attachmentUrl = null;
    }
  }
  return { ...entry, attachmentUrl };
}

export const PACER_DEPARTMENTS = [
  'Design',
  'Account Management',
  'Development',
  'Leadership',
  'Marketing',
  'Sales',
  'Operations',
] as const;

export type PacerDepartment = (typeof PACER_DEPARTMENTS)[number];

/**
 * Allow developers, super_admins, and admins to use the pacer.
 * Admin access is further scoped by their assigned accountKeys.
 */
export function canAccessPacer(
  session: Session | null,
  accountKey: string,
): boolean {
  if (!session?.user) return false;
  const { role, accountKeys = [] } = session.user;
  if (role !== 'developer' && role !== 'super_admin' && role !== 'admin') return false;
  if (role === 'developer' || role === 'super_admin') return true;
  // Unrestricted admin (no assigned accounts) = full access
  if (accountKeys.length === 0) return true;
  return accountKeys.includes(accountKey);
}

/**
 * Find or create the plan row for a given account key.
 */
export async function getOrCreatePlan(accountKey: string) {
  const existing = await prisma.metaAdsPacerPlan.findUnique({
    where: { accountKey },
  });
  if (existing) return existing;
  return prisma.metaAdsPacerPlan.create({
    data: { accountKey },
  });
}

/**
 * Pull the full plan with ads + nested children, ordered for the UI.
 */
export async function fetchPlanWithRelations(planId: string) {
  return prisma.metaAdsPacerPlan.findUnique({
    where: { id: planId },
    include: {
      ads: {
        orderBy: { position: 'asc' },
        include: {
          designNotes: { orderBy: { createdAt: 'asc' } },
          activityLog: { orderBy: { createdAt: 'asc' } },
        },
      },
    },
  });
}

/** Validates a YYYY-MM string. */
export function isValidPeriod(period: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return false;
  const year = Number(period.slice(0, 4));
  return year >= 2000 && year <= 2100;
}

/** Pull the budget + ads for a single period. */
export async function fetchPeriodPlan(planId: string, period: string) {
  const [budget, ads] = await Promise.all([
    prisma.metaAdsPacerPeriodBudget.findUnique({
      where: { planId_period: { planId, period } },
    }),
    prisma.metaAdsPacerAd.findMany({
      where: { planId, period },
      orderBy: { position: 'asc' },
      include: {
        designNotes: { orderBy: { createdAt: 'asc' } },
        activityLog: { orderBy: { createdAt: 'asc' } },
      },
    }),
  ]);
  return {
    baseBudgetGoal: budget?.baseBudgetGoal ?? null,
    addedBudgetGoal: budget?.addedBudgetGoal ?? null,
    ads: ads.map((ad) => ({
      ...ad,
      activityLog: ad.activityLog.map(attachUrl),
    })),
  };
}

/** Add the attachment URL to an activity entry before returning it to the client. */
export function decorateActivityEntry<T extends { attachmentKey: string | null }>(entry: T) {
  return attachUrl(entry);
}

/**
 * Returns the list of account keys this user can pace for. Mirrors the same
 * gating logic as `canAccessPacer` but in plural form.
 */
export function accessibleAccountKeys(
  session: Session | null,
  allAccountKeys: string[],
): string[] {
  if (!session?.user) return [];
  const { role, accountKeys = [] } = session.user;
  if (role !== 'developer' && role !== 'super_admin' && role !== 'admin') return [];
  if (role === 'developer' || role === 'super_admin') return allAccountKeys;
  if (accountKeys.length === 0) return allAccountKeys;
  return allAccountKeys.filter((k) => accountKeys.includes(k));
}

/**
 * Build the admin overview payload for a single period across many accounts.
 * One row per account: dealer name + period budgets + ads (with notes/log).
 */
export async function fetchOverview(accountKeys: string[], period: string) {
  if (accountKeys.length === 0) return [];

  const [accounts, plans] = await Promise.all([
    prisma.account.findMany({
      where: { key: { in: accountKeys } },
      select: { key: true, dealer: true },
    }),
    prisma.metaAdsPacerPlan.findMany({
      where: { accountKey: { in: accountKeys } },
      select: { id: true, accountKey: true },
    }),
  ]);

  const planByKey = new Map(plans.map((p) => [p.accountKey, p.id]));
  const planIds = plans.map((p) => p.id);

  const [budgets, ads] = await Promise.all([
    planIds.length > 0
      ? prisma.metaAdsPacerPeriodBudget.findMany({
          where: { planId: { in: planIds }, period },
        })
      : Promise.resolve([]),
    planIds.length > 0
      ? prisma.metaAdsPacerAd.findMany({
          where: { planId: { in: planIds }, period },
          orderBy: { position: 'asc' },
          include: {
            designNotes: { orderBy: { createdAt: 'asc' } },
            activityLog: { orderBy: { createdAt: 'asc' } },
          },
        })
      : Promise.resolve([]),
  ]);

  const budgetByPlanId = new Map(budgets.map((b) => [b.planId, b]));
  const adsByPlanId = new Map<string, typeof ads>();
  for (const ad of ads) {
    const arr = adsByPlanId.get(ad.planId) ?? [];
    arr.push(ad);
    adsByPlanId.set(ad.planId, arr);
  }

  return accounts
    .map((acct) => {
      const planId = planByKey.get(acct.key);
      const budget = planId ? budgetByPlanId.get(planId) : null;
      const acctAds = planId ? (adsByPlanId.get(planId) ?? []) : [];
      return {
        accountKey: acct.key,
        dealer: acct.dealer,
        baseBudgetGoal: budget?.baseBudgetGoal ?? null,
        addedBudgetGoal: budget?.addedBudgetGoal ?? null,
        ads: acctAds.map((ad) => ({
          ...ad,
          activityLog: ad.activityLog.map(attachUrl),
        })),
      };
    })
    .sort((a, b) => a.dealer.localeCompare(b.dealer));
}

/** Lists periods that have at least one ad or one budget row. */
export async function listPeriods(planId: string) {
  const [adGroups, budgets] = await Promise.all([
    prisma.metaAdsPacerAd.groupBy({
      by: ['period'],
      where: { planId, period: { not: '' } },
      _count: { _all: true },
    }),
    prisma.metaAdsPacerPeriodBudget.findMany({
      where: { planId },
      select: { period: true },
    }),
  ]);
  const counts = new Map<string, number>();
  adGroups.forEach((g) => counts.set(g.period, g._count._all));
  budgets.forEach((b) => {
    if (!counts.has(b.period)) counts.set(b.period, 0);
  });
  return [...counts.entries()]
    .map(([period, adCount]) => ({ period, adCount }))
    .sort((a, b) => (a.period < b.period ? 1 : -1));
}
