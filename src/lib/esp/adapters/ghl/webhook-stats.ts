import { prisma } from '@/lib/prisma';

export interface CampaignWebhookStats {
  campaignId: string;
  firstDeliveredAt: Date | null;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  complainedCount: number;
  unsubscribedCount: number;
  lastEventAt: Date | null;
}

/**
 * Fetch all webhook-derived stats for a provider/account pair.
 * Returns a Map keyed by campaignId for efficient lookup during merge.
 */
export async function getWebhookStatsForProviderAccount(
  provider: string,
  accountId: string,
): Promise<Map<string, CampaignWebhookStats>> {
  const rows = await prisma.campaignEmailStats.findMany({
    where: {
      provider: provider.trim().toLowerCase(),
      accountId: accountId.trim(),
    },
  });

  const map = new Map<string, CampaignWebhookStats>();
  for (const row of rows) {
    map.set(row.campaignId, {
      campaignId: row.campaignId,
      firstDeliveredAt: row.firstDeliveredAt,
      deliveredCount: row.deliveredCount,
      openedCount: row.openedCount,
      clickedCount: row.clickedCount,
      bouncedCount: row.bouncedCount,
      complainedCount: row.complainedCount,
      unsubscribedCount: row.unsubscribedCount,
      lastEventAt: row.lastEventAt,
    });
  }

  return map;
}
