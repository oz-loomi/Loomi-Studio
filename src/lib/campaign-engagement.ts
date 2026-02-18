export interface CampaignEngagementLike {
  sentCount?: number;
  deliveredCount?: number;
  openedCount?: number;
  clickedCount?: number;
  repliedCount?: number;
  bouncedCount?: number;
  failedCount?: number;
  unsubscribedCount?: number;
  openRate?: number;
  clickRate?: number;
  replyRate?: number;
}

export interface CampaignEngagementTotals {
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  repliedCount: number;
  bouncedCount: number;
  failedCount: number;
  unsubscribedCount: number;
  openRate?: number;
  clickRate?: number;
  replyRate?: number;
  hasAny: boolean;
  campaignsWithSignals: number;
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeRate(value: unknown): number | undefined {
  const parsed = normalizeNumber(value);
  if (parsed === undefined) return undefined;
  if (parsed <= 1) return parsed;
  return parsed / 100;
}

function toSafeCount(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function buildCampaignEngagement(campaign: CampaignEngagementLike) {
  const sentCount = toSafeCount(normalizeNumber(campaign.sentCount));
  const deliveredCount = toSafeCount(
    normalizeNumber(campaign.deliveredCount) ?? normalizeNumber(campaign.sentCount),
  );

  const openRateInput = normalizeRate(campaign.openRate);
  const clickRateInput = normalizeRate(campaign.clickRate);
  const replyRateInput = normalizeRate(campaign.replyRate);

  const openedExplicit = normalizeNumber(campaign.openedCount);
  const clickedExplicit = normalizeNumber(campaign.clickedCount);
  const repliedExplicit = normalizeNumber(campaign.repliedCount);

  const openedCount = toSafeCount(
    openedExplicit ??
      (openRateInput !== undefined && deliveredCount > 0
        ? deliveredCount * openRateInput
        : undefined),
  );

  const clickedCount = toSafeCount(
    clickedExplicit ??
      (clickRateInput !== undefined && deliveredCount > 0
        ? deliveredCount * clickRateInput
        : undefined),
  );

  const repliedCount = toSafeCount(
    repliedExplicit ??
      (replyRateInput !== undefined && deliveredCount > 0
        ? deliveredCount * replyRateInput
        : undefined),
  );

  const bouncedCount = toSafeCount(normalizeNumber(campaign.bouncedCount));
  const failedCount = toSafeCount(normalizeNumber(campaign.failedCount));
  const unsubscribedCount = toSafeCount(normalizeNumber(campaign.unsubscribedCount));

  const openRate = deliveredCount > 0
    ? openedCount / deliveredCount
    : openRateInput;
  const clickRate = deliveredCount > 0
    ? clickedCount / deliveredCount
    : clickRateInput;
  const replyRate = deliveredCount > 0
    ? repliedCount / deliveredCount
    : replyRateInput;

  const hasAny = [
    sentCount,
    deliveredCount,
    openedCount,
    clickedCount,
    repliedCount,
    bouncedCount,
    failedCount,
    unsubscribedCount,
  ].some((value) => value > 0);

  return {
    sentCount,
    deliveredCount,
    openedCount,
    clickedCount,
    repliedCount,
    bouncedCount,
    failedCount,
    unsubscribedCount,
    openRate,
    clickRate,
    replyRate,
    hasAny,
  };
}

export function sumCampaignEngagement(campaigns: CampaignEngagementLike[]): CampaignEngagementTotals {
  const totals: CampaignEngagementTotals = {
    sentCount: 0,
    deliveredCount: 0,
    openedCount: 0,
    clickedCount: 0,
    repliedCount: 0,
    bouncedCount: 0,
    failedCount: 0,
    unsubscribedCount: 0,
    hasAny: false,
    campaignsWithSignals: 0,
  };

  for (const campaign of campaigns) {
    const snapshot = buildCampaignEngagement(campaign);
    totals.sentCount += snapshot.sentCount;
    totals.deliveredCount += snapshot.deliveredCount;
    totals.openedCount += snapshot.openedCount;
    totals.clickedCount += snapshot.clickedCount;
    totals.repliedCount += snapshot.repliedCount;
    totals.bouncedCount += snapshot.bouncedCount;
    totals.failedCount += snapshot.failedCount;
    totals.unsubscribedCount += snapshot.unsubscribedCount;

    if (snapshot.hasAny) totals.campaignsWithSignals += 1;
  }

  if (totals.deliveredCount > 0) {
    totals.openRate = totals.openedCount / totals.deliveredCount;
    totals.clickRate = totals.clickedCount / totals.deliveredCount;
    totals.replyRate = totals.repliedCount / totals.deliveredCount;
  }

  totals.hasAny = totals.campaignsWithSignals > 0;

  return totals;
}

export function formatRatePct(rate: number | undefined): string {
  if (rate === undefined || rate === null || Number.isNaN(rate)) return '—';
  const percent = rate * 100;
  if (!Number.isFinite(percent)) return '—';
  if (percent >= 10) return `${Math.round(percent)}%`;
  return `${percent.toFixed(1)}%`;
}

export function formatInlineEngagement(campaign: CampaignEngagementLike): string | null {
  const snapshot = buildCampaignEngagement(campaign);
  if (!snapshot.hasAny) return null;

  const parts: string[] = [];
  if (snapshot.deliveredCount > 0) parts.push(`D ${snapshot.deliveredCount}`);
  if (snapshot.openedCount > 0) parts.push(`O ${snapshot.openedCount}`);
  if (snapshot.clickedCount > 0) parts.push(`C ${snapshot.clickedCount}`);
  if (snapshot.openRate !== undefined && snapshot.deliveredCount > 0) {
    parts.push(`OR ${formatRatePct(snapshot.openRate)}`);
  }
  if (snapshot.clickRate !== undefined && snapshot.deliveredCount > 0) {
    parts.push(`CTR ${formatRatePct(snapshot.clickRate)}`);
  }
  if (snapshot.unsubscribedCount > 0) parts.push(`Unsub ${snapshot.unsubscribedCount}`);
  if (snapshot.bouncedCount > 0) parts.push(`Bounce ${snapshot.bouncedCount}`);

  if (parts.length === 0 && snapshot.sentCount > 0) {
    parts.push(`Sent ${snapshot.sentCount}`);
  }

  return parts.join(' · ');
}
