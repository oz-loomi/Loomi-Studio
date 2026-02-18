import { prisma } from '@/lib/prisma';

export type EmailStatsColumn =
  | 'deliveredCount'
  | 'openedCount'
  | 'clickedCount'
  | 'bouncedCount'
  | 'complainedCount'
  | 'unsubscribedCount';

export async function incrementEmailStatsCounter(params: {
  provider: string;
  accountId: string;
  campaignId: string;
  column: EmailStatsColumn;
  eventTime: Date;
}): Promise<void> {
  const {
    provider,
    accountId,
    campaignId,
    column,
    eventTime,
  } = params;
  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedAccountId = accountId.trim();
  const normalizedCampaignId = campaignId.trim();

  if (column === 'deliveredCount') {
    await prisma.campaignEmailStats.upsert({
      where: {
        provider_accountId_campaignId: {
          provider: normalizedProvider,
          accountId: normalizedAccountId,
          campaignId: normalizedCampaignId,
        },
      },
      create: {
        provider: normalizedProvider,
        accountId: normalizedAccountId,
        campaignId: normalizedCampaignId,
        deliveredCount: 1,
        firstDeliveredAt: eventTime,
        lastEventAt: eventTime,
      },
      update: {
        deliveredCount: { increment: 1 },
        lastEventAt: eventTime,
      },
    });

    await prisma.campaignEmailStats.updateMany({
      where: {
        provider: normalizedProvider,
        accountId: normalizedAccountId,
        campaignId: normalizedCampaignId,
        firstDeliveredAt: null,
      },
      data: { firstDeliveredAt: eventTime },
    });
    return;
  }

  await prisma.campaignEmailStats.upsert({
    where: {
      provider_accountId_campaignId: {
        provider: normalizedProvider,
        accountId: normalizedAccountId,
        campaignId: normalizedCampaignId,
      },
    },
    create: {
      provider: normalizedProvider,
      accountId: normalizedAccountId,
      campaignId: normalizedCampaignId,
      [column]: 1,
      lastEventAt: eventTime,
    },
    update: {
      [column]: { increment: 1 },
      lastEventAt: eventTime,
    },
  });
}
