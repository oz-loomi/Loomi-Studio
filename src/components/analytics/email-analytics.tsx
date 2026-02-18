'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  EnvelopeIcon,
  CheckCircleIcon,
  PencilSquareIcon,
  ArchiveBoxIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import {
  type DateRangeKey,
  getDateRangeBounds,
  getMonthBuckets,
  getDateRangeLabel,
  formatCustomRangeLabel,
} from '@/lib/date-ranges';
import type { CustomDateRange } from '@/components/filters/date-range-filter';
import type { EmailListItem } from '@/lib/email-list-payload';

// ── Types ──

interface EmailAnalyticsProps {
  emails: EmailListItem[];
  loading?: boolean;
  /** Show per-account breakdown (admin view) */
  showAccountBreakdown?: boolean;
  /** Map of accountKey -> dealer name for display */
  accountNames?: Record<string, string>;
  /** Active date range filter */
  dateRange?: DateRangeKey;
  /** Custom date range (when dateRange === 'custom') */
  customRange?: CustomDateRange | null;
}

// ── Helpers ──

const CHART_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316',
];

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: typeof EnvelopeIcon }> = {
  active: { color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircleIcon },
  draft: { color: 'text-amber-400', bg: 'bg-amber-500/10', icon: PencilSquareIcon },
  archived: { color: 'text-zinc-400', bg: 'bg-zinc-500/10', icon: ArchiveBoxIcon },
};

// ── Component ──

export function EmailAnalytics({ emails, loading, showAccountBreakdown, accountNames, dateRange, customRange }: EmailAnalyticsProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (emails.length > 0 && !loading) {
      const timer = setTimeout(() => setAnimated(true), 100);
      return () => clearTimeout(timer);
    }
  }, [emails.length, loading]);

  const analytics = useMemo(() => {
    if (emails.length === 0) return null;

    const now = new Date();

    // Status counts
    const statusCounts = { active: 0, draft: 0, archived: 0 };
    emails.forEach(e => {
      const s = e.status as keyof typeof statusCounts;
      if (s in statusCounts) statusCounts[s]++;
    });

    // Template usage (top 8)
    const templateCounts = new Map<string, number>();
    emails.forEach(e => {
      const name = e.templateTitle || e.templateSlug;
      if (!name) return;
      templateCounts.set(name, (templateCounts.get(name) || 0) + 1);
    });
    const topTemplates = [...templateCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const maxTemplateCount = topTemplates.length > 0 ? topTemplates[0][1] : 0;

    // Emails per account (top 8) — only if showAccountBreakdown
    let accountBreakdown: [string, number][] = [];
    let maxAccountCount = 0;
    if (showAccountBreakdown) {
      const accountCounts = new Map<string, number>();
      emails.forEach(e => {
        const name = accountNames?.[e.accountKey] || e.accountKey;
        accountCounts.set(name, (accountCounts.get(name) || 0) + 1);
      });
      accountBreakdown = [...accountCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
      maxAccountCount = accountBreakdown.length > 0 ? accountBreakdown[0][1] : 0;
    }

    // Creation timeline — dynamic based on dateRange
    const bounds = dateRange === 'custom' && customRange
      ? getDateRangeBounds('custom', customRange.start, customRange.end)
      : getDateRangeBounds(dateRange ?? '6m');
    const buckets = getMonthBuckets(bounds.monthCount);
    const monthBuckets = buckets.map(b => ({
      label: b.label,
      count: emails.filter(e => {
        const cd = new Date(e.createdAt);
        return !isNaN(cd.getTime()) && cd >= b.start && cd < b.end;
      }).length,
    }));
    const maxMonthCount = Math.max(...monthBuckets.map(b => b.count), 1);

    // Recent activity — shows "in range" count when filtered
    const inRangeCount = emails.length; // already filtered by parent
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const createdLast7 = emails.filter(e => new Date(e.createdAt) >= sevenDaysAgo).length;

    return {
      statusCounts,
      topTemplates,
      maxTemplateCount,
      accountBreakdown,
      maxAccountCount,
      monthBuckets,
      maxMonthCount,
      inRangeCount,
      createdLast7,
    };
  }, [emails, showAccountBreakdown, accountNames, dateRange, customRange]);

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

  if (!analytics || emails.length === 0) {
    return (
      <div className="text-center py-8 border border-dashed border-[var(--border)] rounded-xl">
        <EnvelopeIcon className="w-8 h-8 text-[var(--muted-foreground)] mx-auto mb-2" />
        <p className="text-sm text-[var(--muted-foreground)]">No email data yet</p>
      </div>
    );
  }

  const totalEmails = emails.length;
  const statusEntries = Object.entries(analytics.statusCounts).filter(([, count]) => count > 0);

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={EnvelopeIcon}
          value={totalEmails}
          label="Total Emails"
          color="text-blue-400"
          bgColor="bg-blue-500/10"
          delay={0}
          animated={animated}
        />
        <StatCard
          icon={CheckCircleIcon}
          value={analytics.statusCounts.active}
          label="Active"
          color="text-green-400"
          bgColor="bg-green-500/10"
          delay={1}
          animated={animated}
        />
        <StatCard
          icon={PencilSquareIcon}
          value={analytics.statusCounts.draft}
          label="Drafts"
          color="text-amber-400"
          bgColor="bg-amber-500/10"
          delay={2}
          animated={animated}
        />
        <StatCard
          icon={ClockIcon}
          value={dateRange ? analytics.inRangeCount : analytics.inRangeCount}
          label={dateRange ? 'In Range' : 'Total'}
          sub={analytics.createdLast7 > 0 ? `${analytics.createdLast7} this week` : undefined}
          color="text-cyan-400"
          bgColor="bg-cyan-500/10"
          delay={3}
          animated={animated}
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status Distribution — Donut */}
        <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-1">
          <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            Status Breakdown
          </h4>
          <div className="flex items-center gap-6">
            <DonutChart
              segments={statusEntries.map(([status, count]) => ({
                value: count,
                color: status === 'active' ? '#10b981' : status === 'draft' ? '#f59e0b' : '#71717a',
              }))}
              total={totalEmails}
              centerLabel="total"
              animated={animated}
            />
            <div className="flex-1 space-y-2 min-w-0">
              {statusEntries.map(([status, count]) => {
                const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
                const pct = totalEmails > 0 ? ((count / totalEmails) * 100).toFixed(0) : '0';
                return (
                  <div key={status} className="flex items-center gap-2 text-xs">
                    <cfg.icon className={`w-3.5 h-3.5 ${cfg.color} flex-shrink-0`} />
                    <span className="capitalize text-[var(--muted-foreground)]">{status}</span>
                    <span className="ml-auto font-medium tabular-nums">{count}</span>
                    <span className="text-[var(--muted-foreground)] text-[10px] w-8 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Template Usage — Bar Chart */}
        {analytics.topTemplates.length > 0 && (
          <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-2">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              Template Usage
            </h4>
            <div className="space-y-2.5">
              {analytics.topTemplates.map(([name, count], i) => (
                <BarRow
                  key={name}
                  label={name}
                  value={count}
                  max={analytics.maxTemplateCount}
                  color={CHART_COLORS[i % CHART_COLORS.length]}
                  animated={animated}
                  delay={i * 60}
                />
              ))}
            </div>
          </div>
        )}

        {/* Creation Timeline — Sparkline */}
        {analytics.monthBuckets.some(b => b.count > 0) && (
          <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-3">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              Email Creation ({dateRange === 'custom' && customRange ? formatCustomRangeLabel(customRange.start, customRange.end) : getDateRangeLabel(dateRange ?? '6m')})
            </h4>
            <div className="flex items-end gap-1.5 h-24">
              {analytics.monthBuckets.map((bucket, i) => {
                const height = animated ? (bucket.count / analytics.maxMonthCount) * 100 : 0;
                return (
                  <div key={bucket.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-medium tabular-nums text-[var(--muted-foreground)]">
                      {bucket.count > 0 ? bucket.count : ''}
                    </span>
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t-sm transition-all duration-700 ease-out"
                        style={{
                          height: `${Math.max(height, bucket.count > 0 ? 4 : 0)}%`,
                          backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                          opacity: 0.7,
                          transitionDelay: `${i * 80}ms`,
                        }}
                      />
                    </div>
                    <span className="text-[9px] text-[var(--muted-foreground)]">{bucket.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Emails per Account — Bar Chart (admin only) */}
        {showAccountBreakdown && analytics.accountBreakdown.length > 0 && (
          <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-4">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              Emails by Account
            </h4>
            <div className="space-y-2.5">
              {analytics.accountBreakdown.map(([name, count], i) => (
                <BarRow
                  key={name}
                  label={name}
                  value={count}
                  max={analytics.maxAccountCount}
                  color={CHART_COLORS[(i + 3) % CHART_COLORS.length]}
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
  icon: Icon,
  value,
  label,
  sub,
  color,
  bgColor,
  delay,
  animated,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number | string;
  label: string;
  sub?: string;
  color: string;
  bgColor: string;
  delay: number;
  animated: boolean;
}) {
  return (
    <div
      className={`glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-${delay + 1}`}
      style={{ opacity: animated ? 1 : 0 }}
    >
      <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center mb-2`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{sub}</p>}
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  color,
  animated,
  delay = 0,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  animated: boolean;
  delay?: number;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--muted-foreground)] w-24 truncate capitalize">{label}</span>
      <div className="flex-1 h-5 rounded-full bg-[var(--muted)] overflow-hidden relative">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: animated ? `${Math.max(pct, 2)}%` : '0%',
            backgroundColor: color,
            opacity: 0.75,
            transitionDelay: `${delay}ms`,
          }}
        />
      </div>
      <span className="text-xs font-medium tabular-nums w-8 text-right">{value}</span>
    </div>
  );
}

function DonutChart({
  segments,
  total,
  centerLabel,
  animated,
}: {
  segments: { value: number; color: string }[];
  total: number;
  centerLabel?: string;
  animated: boolean;
}) {
  const size = 80;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedOffset = 0;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={strokeWidth}
        />
        {segments.map((seg, i) => {
          const pct = total > 0 ? seg.value / total : 0;
          const segLength = pct * circumference;
          const offset = accumulatedOffset;
          accumulatedOffset += segLength;

          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${animated ? segLength : 0} ${circumference}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              style={{
                transition: `stroke-dasharray 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 100}ms`,
              }}
            />
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
