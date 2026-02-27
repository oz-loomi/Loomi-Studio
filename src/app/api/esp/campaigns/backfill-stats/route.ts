import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { getAdapterForAccount } from '@/lib/esp/registry';
import { readAccounts, withConcurrencyLimit } from '@/lib/esp/utils';
import {
  fetchCampaigns,
  fetchCampaignAnalytics,
  type GhlCampaign,
  type GhlCampaignAnalytics,
} from '@/lib/esp/adapters/ghl/campaigns';
import '@/lib/esp/init';

/**
 * POST /api/esp/campaigns/backfill-stats
 *
 * One-time backfill of campaign engagement stats from GHL.
 * Iterates all connected GHL accounts, fetches campaigns,
 * probes the analytics endpoints for each sent campaign,
 * and upserts results into CampaignEmailStats.
 *
 * Developer-only endpoint.
 */
export async function POST() {
  const { error } = await requireRole('developer');
  if (error) return error;

  const accounts = await readAccounts();
  const accountKeys = Object.keys(accounts).filter((k) => !k.startsWith('_'));

  const results: {
    account: string;
    locationId: string;
    campaignsTotal: number;
    campaignsProbed: number;
    statsFound: number;
    upserted: number;
    errors: string[];
  }[] = [];

  const tasks = accountKeys.map((accountKey) => async () => {
    const accountResult = {
      account: accountKey,
      locationId: '',
      campaignsTotal: 0,
      campaignsProbed: 0,
      statsFound: 0,
      upserted: 0,
      errors: [] as string[],
    };

    try {
      const adapter = await getAdapterForAccount(accountKey);
      if (adapter.provider !== 'ghl' || !adapter.contacts) {
        accountResult.errors.push('Not a GHL account or no contacts adapter');
        results.push(accountResult);
        return;
      }

      const credentials = await adapter.contacts.resolveCredentials(accountKey);
      if (!credentials) {
        accountResult.errors.push('No credentials');
        results.push(accountResult);
        return;
      }

      const { token, locationId } = credentials;
      accountResult.locationId = locationId;

      let campaigns: GhlCampaign[];
      try {
        campaigns = await fetchCampaigns(token, locationId);
      } catch (err) {
        accountResult.errors.push(`fetchCampaigns: ${err instanceof Error ? err.message : String(err)}`);
        results.push(accountResult);
        return;
      }

      accountResult.campaignsTotal = campaigns.length;

      // Only probe "sent" campaigns — drafts/scheduled won't have engagement
      const sentCampaigns = campaigns.filter(
        (c) => c.status.toLowerCase() === 'sent' || c.status.toLowerCase() === 'completed',
      );

      // Process campaigns sequentially to avoid hammering GHL
      for (const campaign of sentCampaigns) {
        accountResult.campaignsProbed += 1;

        try {
          const analytics = await fetchCampaignAnalytics(token, locationId, {
            scheduleId: campaign.scheduleId,
            campaignId: campaign.campaignId,
            recordId: campaign.id,
          });

          if (!hasEngagement(analytics)) continue;
          accountResult.statsFound += 1;

          // Determine which campaign ID to store — prefer scheduleId for consistency
          // with the merge logic in fetchCampaigns
          const storeIds = [campaign.scheduleId, campaign.campaignId, campaign.id].filter(Boolean) as string[];
          if (storeIds.length === 0) continue;

          for (const campaignId of storeIds) {
            try {
              await prisma.campaignEmailStats.upsert({
                where: {
                  provider_accountId_campaignId: {
                    provider: 'ghl',
                    accountId: locationId,
                    campaignId: campaignId.trim(),
                  },
                },
                create: {
                  provider: 'ghl',
                  accountId: locationId,
                  campaignId: campaignId.trim(),
                  deliveredCount: safeCount(analytics.deliveredCount ?? analytics.sentCount),
                  openedCount: safeCount(analytics.openedCount),
                  clickedCount: safeCount(analytics.clickedCount),
                  bouncedCount: safeCount(analytics.bouncedCount),
                  complainedCount: 0,
                  unsubscribedCount: safeCount(analytics.unsubscribedCount),
                  firstDeliveredAt: campaign.sentAt ? new Date(campaign.sentAt) : null,
                  lastEventAt: new Date(),
                },
                update: {
                  deliveredCount: safeCount(analytics.deliveredCount ?? analytics.sentCount),
                  openedCount: safeCount(analytics.openedCount),
                  clickedCount: safeCount(analytics.clickedCount),
                  bouncedCount: safeCount(analytics.bouncedCount),
                  unsubscribedCount: safeCount(analytics.unsubscribedCount),
                  lastEventAt: new Date(),
                },
              });
              accountResult.upserted += 1;
            } catch (err) {
              accountResult.errors.push(
                `upsert ${campaignId}: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
        } catch (err) {
          // Analytics fetch failed for this campaign — not fatal, continue
          accountResult.errors.push(
            `analytics ${campaign.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      accountResult.errors.push(err instanceof Error ? err.message : String(err));
    }

    results.push(accountResult);
  });

  // Process accounts with limited concurrency
  await withConcurrencyLimit(tasks, 3);

  const totalUpserted = results.reduce((sum, r) => sum + r.upserted, 0);
  const totalStatsFound = results.reduce((sum, r) => sum + r.statsFound, 0);
  const totalProbed = results.reduce((sum, r) => sum + r.campaignsProbed, 0);

  return NextResponse.json({
    ok: true,
    summary: {
      accountsProcessed: results.length,
      campaignsProbed: totalProbed,
      campaignsWithStats: totalStatsFound,
      rowsUpserted: totalUpserted,
    },
    results,
  });
}

function safeCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

function hasEngagement(analytics: GhlCampaignAnalytics): boolean {
  return (
    (analytics.deliveredCount ?? 0) > 0 ||
    (analytics.openedCount ?? 0) > 0 ||
    (analytics.clickedCount ?? 0) > 0 ||
    (analytics.bouncedCount ?? 0) > 0 ||
    (analytics.unsubscribedCount ?? 0) > 0 ||
    (analytics.sentCount ?? 0) > 0
  );
}
