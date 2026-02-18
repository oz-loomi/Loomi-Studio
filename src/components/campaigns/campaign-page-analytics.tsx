'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  PaperAirplaneIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { formatRatePct, sumCampaignEngagement } from '@/lib/campaign-engagement';

// ── Types ──

interface Campaign {
  id: string;
  name: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  scheduledAt?: string;
  sentAt?: string;
  locationId?: string;
  accountKey?: string;
  dealer?: string;
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

interface CampaignPageAnalyticsProps {
  campaigns: Campaign[];
  loading?: boolean;
  showAccountBreakdown?: boolean;
  accountNames?: Record<string, string>;
  emptyTitle?: string;
  emptySubtitle?: string;
}

// ── Helpers ──

const CHART_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316',
];

const STATUS_COLORS: Record<string, string> = {
  sent:      '#10b981',
  scheduled: '#3b82f6',
  draft:     '#71717a',
  paused:    '#f97316',
  cancelled: '#ef4444',
};

function getStatusColor(status: string): string {
  return STATUS_COLORS[normalizeStatus(status)] || '#71717a';
}

function normalizeStatus(status: string): string {
  const s = status.toLowerCase().trim();
  if (s.includes('complete') || s.includes('deliver') || s.includes('finish') || s.includes('sent')) return 'sent';
  if (s.includes('active') || s.includes('sched') || s.includes('queue') || s.includes('start') || s.includes('running') || s.includes('progress')) return 'scheduled';
  if (s.includes('draft')) return 'draft';
  if (s.includes('pause')) return 'paused';
  if (s.includes('stop') || s.includes('cancel') || s.includes('inactive')) return 'cancelled';
  return s;
}

function campaignAccountKey(campaign: Campaign): string | null {
  return campaign.accountKey || null;
}

// ── Component ──

export function CampaignPageAnalytics({
  campaigns,
  loading,
  showAccountBreakdown,
  accountNames,
  emptyTitle = 'No campaign data yet',
  emptySubtitle = 'Accounts may need to reconnect their ESP integration with campaign scopes',
}: CampaignPageAnalyticsProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (campaigns.length > 0 && !loading) {
      const timer = setTimeout(() => setAnimated(true), 100);
      return () => clearTimeout(timer);
    }
  }, [campaigns.length, loading]);

  const analytics = useMemo(() => {
    if (campaigns.length === 0) return null;

    // Status counts
    const statusCounts = new Map<string, number>();
    campaigns.forEach(c => {
      const s = normalizeStatus(c.status);
      statusCounts.set(s, (statusCounts.get(s) || 0) + 1);
    });
    const statusEntries = [...statusCounts.entries()].sort((a, b) => b[1] - a[1]);

    const sentCount = campaigns.filter(c =>
      normalizeStatus(c.status) === 'sent'
    ).length;
    const scheduledCount = campaigns.filter(c =>
      normalizeStatus(c.status) === 'scheduled'
    ).length;
    const draftCount = campaigns.filter(c =>
      normalizeStatus(c.status) === 'draft'
    ).length;

    // Per-account breakdown
    let byAccount: [string, number][] = [];
    let maxAccount = 0;
    if (showAccountBreakdown) {
      const acctCounts = new Map<string, number>();
      campaigns.forEach(c => {
        const accountKey = campaignAccountKey(c);
        const name = (accountKey && accountNames?.[accountKey]) || c.dealer || accountKey || 'Unknown';
        acctCounts.set(name, (acctCounts.get(name) || 0) + 1);
      });
      byAccount = [...acctCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      maxAccount = byAccount.length > 0 ? byAccount[0][1] : 0;
    }

    const engagement = sumCampaignEngagement(campaigns);

    return { statusEntries, sentCount, scheduledCount, draftCount, byAccount, maxAccount, engagement };
  }, [campaigns, showAccountBreakdown, accountNames]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card rounded-xl p-4 animate-pulse">
              <div className="w-5 h-5 bg-[var(--muted)] rounded mb-2" />
              <div className="w-12 h-6 bg-[var(--muted)] rounded mb-1" />
              <div className="w-20 h-3 bg-[var(--muted)] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-8 border border-dashed border-[var(--border)] rounded-xl">
        <PaperAirplaneIcon className="w-8 h-8 text-[var(--muted-foreground)] mx-auto mb-2" />
        <p className="text-sm text-[var(--muted-foreground)]">{emptyTitle}</p>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          {emptySubtitle}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={PaperAirplaneIcon}
          value={campaigns.length}
          label="Total Campaigns"
          color="text-blue-400"
          bgColor="bg-blue-500/10"
          delay={0}
          animated={animated}
        />
        <StatCard
          icon={CheckCircleIcon}
          value={analytics.sentCount}
          label="Sent"
          color="text-green-400"
          bgColor="bg-green-500/10"
          delay={1}
          animated={animated}
        />
        <StatCard
          icon={ClockIcon}
          value={analytics.scheduledCount}
          label="Scheduled"
          color="text-blue-400"
          bgColor="bg-blue-500/10"
          delay={2}
          animated={animated}
        />
        <StatCard
          icon={DocumentTextIcon}
          value={analytics.draftCount}
          label="Draft"
          color="text-zinc-400"
          bgColor="bg-zinc-500/10"
          delay={3}
          animated={animated}
        />
      </div>

      {analytics.engagement.hasAny && (
        <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-1">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Email Engagement
            </h4>
            <span className="text-[10px] text-[var(--muted-foreground)]">
              {analytics.engagement.campaignsWithSignals} campaign{analytics.engagement.campaignsWithSignals === 1 ? '' : 's'} with signal
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <EngagementMetric label="Delivered" value={analytics.engagement.deliveredCount} />
            <EngagementMetric label="Opened" value={analytics.engagement.openedCount} />
            <EngagementMetric label="Clicked" value={analytics.engagement.clickedCount} />
            <EngagementMetric label="Open Rate" value={formatRatePct(analytics.engagement.openRate)} />
            <EngagementMetric label="Click Rate" value={formatRatePct(analytics.engagement.clickRate)} />
            <EngagementMetric
              label="Unsub + Bounce"
              value={analytics.engagement.unsubscribedCount + analytics.engagement.bouncedCount}
            />
          </div>
        </div>
      )}

      {/* Charts grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status Distribution */}
        {analytics.statusEntries.length > 0 && (
          <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-1">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              Campaign Status
            </h4>
            <div className="flex items-center gap-6">
              <DonutChart
                segments={analytics.statusEntries.map(([status, count]) => ({
                  value: count,
                  color: getStatusColor(status),
                }))}
                total={campaigns.length}
                centerLabel="campaigns"
                animated={animated}
              />
              <div className="flex-1 space-y-2 min-w-0">
                {analytics.statusEntries.map(([status, count]) => {
                  const pct = campaigns.length > 0 ? ((count / campaigns.length) * 100).toFixed(0) : '0';
                  return (
                    <div key={status} className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getStatusColor(status) }} />
                      <span className="capitalize text-[var(--muted-foreground)]">{status}</span>
                      <span className="ml-auto font-medium tabular-nums">{count}</span>
                      <span className="text-[var(--muted-foreground)] text-[10px] w-8 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Campaigns per Account */}
        {showAccountBreakdown && analytics.byAccount.length > 0 && (
          <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-2">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              Campaigns by Account
            </h4>
            <div className="space-y-2.5">
              {analytics.byAccount.map(([name, count], i) => (
                <BarRow
                  key={name}
                  label={name}
                  value={count}
                  max={analytics.maxAccount}
                  color={CHART_COLORS[i % CHART_COLORS.length]}
                  animated={animated}
                  delay={i * 60}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function StatCard({
  icon: Icon, value, label, sub, color, bgColor, delay, animated,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number | string; label: string; sub?: string;
  color: string; bgColor: string; delay: number; animated: boolean;
}) {
  return (
    <div className={`glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-${delay + 1}`} style={{ opacity: animated ? 1 : 0 }}>
      <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center mb-2`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{sub}</p>}
    </div>
  );
}

function EngagementMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 px-2.5 py-2">
      <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function BarRow({ label, value, max, color, animated, delay = 0 }: {
  label: string; value: number; max: number; color: string; animated: boolean; delay?: number;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--muted-foreground)] w-24 truncate capitalize">{label}</span>
      <div className="flex-1 h-5 rounded-full bg-[var(--muted)] overflow-hidden relative">
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{
          width: animated ? `${Math.max(pct, 2)}%` : '0%', backgroundColor: color, opacity: 0.75, transitionDelay: `${delay}ms`,
        }} />
      </div>
      <span className="text-xs font-medium tabular-nums w-8 text-right">{value}</span>
    </div>
  );
}

function DonutChart({ segments, total, centerLabel, animated }: {
  segments: { value: number; color: string }[]; total: number; centerLabel?: string; animated: boolean;
}) {
  const size = 80; const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2; const circumference = 2 * Math.PI * radius;
  let accumulatedOffset = 0;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--muted)" strokeWidth={strokeWidth} />
        {segments.map((seg, i) => {
          const pct = total > 0 ? seg.value / total : 0;
          const segLength = pct * circumference;
          const offset = accumulatedOffset;
          accumulatedOffset += segLength;
          return (
            <circle key={i} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={seg.color}
              strokeWidth={strokeWidth} strokeDasharray={`${animated ? segLength : 0} ${circumference}`}
              strokeDashoffset={-offset} strokeLinecap="butt"
              style={{ transition: `stroke-dasharray 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 100}ms` }} />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold">{total}</span>
        {centerLabel && <span className="text-[8px] text-[var(--muted-foreground)]">{centerLabel}</span>}
      </div>
    </div>
  );
}
