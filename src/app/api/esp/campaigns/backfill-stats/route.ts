import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { getAdapterForAccount } from '@/lib/esp/registry';
import { readAccounts } from '@/lib/esp/utils';
import {
  fetchCampaigns,
  fetchCampaignAnalytics,
  type GhlCampaign,
  type GhlCampaignAnalytics,
} from '@/lib/esp/adapters/ghl/campaigns';
import '@/lib/esp/init';

/**
 * POST /api/esp/campaigns/backfill-stats?account=youngKia
 *
 * One-time backfill of campaign engagement stats from GHL.
 * Streams NDJSON progress lines so the request doesn't timeout.
 *
 * Query params:
 *   account  - (optional) single accountKey to process; omit for all
 *   limit    - (optional) max campaigns to probe per account (default: all)
 *   timeout  - (optional) per-campaign timeout in ms (default: 15000)
 *
 * Developer-only endpoint.
 */
export async function POST(req: NextRequest) {
  const { error } = await requireRole('developer');
  if (error) return error;

  const url = req.nextUrl;
  const accountFilter = url.searchParams.get('account');
  const limitParam = parseInt(url.searchParams.get('limit') || '0', 10) || 0;
  const perCampaignTimeout = parseInt(url.searchParams.get('timeout') || '15000', 10) || 15000;

  const accounts = await readAccounts();
  let accountKeys = Object.keys(accounts).filter((k) => !k.startsWith('_'));

  if (accountFilter) {
    accountKeys = accountKeys.filter((k) => k === accountFilter);
    if (accountKeys.length === 0) {
      return NextResponse.json({ error: `Account "${accountFilter}" not found` }, { status: 404 });
    }
  }

  // Stream NDJSON so the connection stays alive and we see progress
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      };

      send({ type: 'start', accounts: accountKeys.length, timestamp: new Date().toISOString() });

      const summaryTotals = {
        accountsProcessed: 0,
        campaignsProbed: 0,
        campaignsWithStats: 0,
        rowsUpserted: 0,
      };

      for (const accountKey of accountKeys) {
        const accountResult = {
          account: accountKey,
          locationId: '',
          campaignsTotal: 0,
          sentCampaigns: 0,
          campaignsProbed: 0,
          statsFound: 0,
          upserted: 0,
          errors: [] as string[],
        };

        try {
          const adapter = await getAdapterForAccount(accountKey);
          if (adapter.provider !== 'ghl' || !adapter.contacts) {
            accountResult.errors.push('Not a GHL account or no contacts adapter');
            send({ type: 'account', ...accountResult });
            summaryTotals.accountsProcessed += 1;
            continue;
          }

          const credentials = await adapter.contacts.resolveCredentials(accountKey);
          if (!credentials) {
            accountResult.errors.push('No credentials');
            send({ type: 'account', ...accountResult });
            summaryTotals.accountsProcessed += 1;
            continue;
          }

          const { token, locationId } = credentials;
          accountResult.locationId = locationId;

          let campaigns: GhlCampaign[];
          try {
            campaigns = await fetchCampaigns(token, locationId);
          } catch (err) {
            accountResult.errors.push(`fetchCampaigns: ${err instanceof Error ? err.message : String(err)}`);
            send({ type: 'account', ...accountResult });
            summaryTotals.accountsProcessed += 1;
            continue;
          }

          accountResult.campaignsTotal = campaigns.length;
          let sentCampaigns = campaigns.filter((c) => isSentStatus(c.status));
          accountResult.sentCampaigns = sentCampaigns.length;

          if (limitParam > 0) {
            sentCampaigns = sentCampaigns.slice(0, limitParam);
          }

          send({
            type: 'account_start',
            account: accountKey,
            locationId,
            total: campaigns.length,
            sent: sentCampaigns.length,
          });

          for (const campaign of sentCampaigns) {
            accountResult.campaignsProbed += 1;

            try {
              const analytics = await withTimeout(
                fetchCampaignAnalytics(token, locationId, {
                  scheduleId: campaign.scheduleId,
                  campaignId: campaign.campaignId,
                  recordId: campaign.id,
                }),
                perCampaignTimeout,
              );

              if (!hasEngagement(analytics)) {
                send({
                  type: 'campaign',
                  account: accountKey,
                  campaign: campaign.name,
                  id: campaign.id,
                  result: 'no_engagement',
                });
                continue;
              }

              accountResult.statsFound += 1;

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

              send({
                type: 'campaign',
                account: accountKey,
                campaign: campaign.name,
                id: campaign.id,
                result: 'stats_found',
                delivered: analytics.deliveredCount,
                opened: analytics.openedCount,
                clicked: analytics.clickedCount,
                source: analytics.source,
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              accountResult.errors.push(`analytics ${campaign.id}: ${msg}`);
              send({
                type: 'campaign',
                account: accountKey,
                campaign: campaign.name,
                id: campaign.id,
                result: 'error',
                error: msg,
              });
            }
          }
        } catch (err) {
          accountResult.errors.push(err instanceof Error ? err.message : String(err));
        }

        summaryTotals.accountsProcessed += 1;
        summaryTotals.campaignsProbed += accountResult.campaignsProbed;
        summaryTotals.campaignsWithStats += accountResult.statsFound;
        summaryTotals.rowsUpserted += accountResult.upserted;

        send({ type: 'account', ...accountResult });
      }

      send({ type: 'done', summary: summaryTotals, timestamp: new Date().toISOString() });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms),
    ),
  ]);
}

function isSentStatus(status: string): boolean {
  const s = status.toLowerCase().trim();
  return s.includes('complete') || s.includes('deliver') || s.includes('finish') || s.includes('sent');
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
