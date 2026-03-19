// ── Email Stats Store ──
// Placeholder: CampaignEmailStats model was removed. This store is a no-op
// until a replacement persistence layer is added. Klaviyo and SendGrid webhook
// handlers still call this function, so it must remain to keep them compilable.

export type EmailStatsColumn =
  | 'deliveredCount'
  | 'openedCount'
  | 'clickedCount'
  | 'bouncedCount'
  | 'complainedCount'
  | 'unsubscribedCount';

export async function incrementEmailStatsCounter(_params: {
  provider: string;
  accountId: string;
  campaignId: string;
  column: EmailStatsColumn;
  eventTime: Date;
}): Promise<void> {
  // No-op: CampaignEmailStats model removed. Webhook events are received
  // but not persisted until a replacement store is implemented.
}
