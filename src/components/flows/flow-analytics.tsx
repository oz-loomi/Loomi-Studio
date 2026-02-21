'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  PlayIcon,
  PauseIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { FlowIcon } from '@/components/icon-map';

// ── Types ──

interface Workflow {
  id: string;
  name: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  accountKey?: string;
  dealer?: string;
}

interface FlowAnalyticsProps {
  workflows: Workflow[];
  loading?: boolean;
  showAccountBreakdown?: boolean;
  accountNames?: Record<string, string>;
}

// ── Helpers ──

const CHART_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316',
];

const STATUS_COLORS: Record<string, string> = {
  active: '#10b981',
  published: '#10b981',
  inactive: '#71717a',
  draft: '#f59e0b',
};

function getStatusColor(status: string): string {
  return STATUS_COLORS[status.toLowerCase()] || '#71717a';
}

function workflowAccountKey(workflow: Workflow): string | null {
  return workflow.accountKey || null;
}

// ── Component ──

export function FlowAnalytics({
  workflows,
  loading,
  showAccountBreakdown,
  accountNames,
}: FlowAnalyticsProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (workflows.length > 0 && !loading) {
      const timer = setTimeout(() => setAnimated(true), 100);
      return () => clearTimeout(timer);
    }
  }, [workflows.length, loading]);

  const analytics = useMemo(() => {
    if (workflows.length === 0) return null;

    // Status counts
    const statusCounts = new Map<string, number>();
    workflows.forEach(w => {
      const s = w.status.toLowerCase();
      statusCounts.set(s, (statusCounts.get(s) || 0) + 1);
    });
    const statusEntries = [...statusCounts.entries()].sort((a, b) => b[1] - a[1]);

    const activeCount = workflows.filter(w =>
      ['active', 'published'].includes(w.status.toLowerCase())
    ).length;
    const inactiveCount = workflows.filter(w =>
      w.status.toLowerCase() === 'inactive'
    ).length;
    const draftCount = workflows.filter(w =>
      w.status.toLowerCase() === 'draft'
    ).length;

    // Per-account breakdown
    let byAccount: [string, number][] = [];
    let maxAccount = 0;
    if (showAccountBreakdown) {
      const acctCounts = new Map<string, number>();
      workflows.forEach(w => {
        const accountKey = workflowAccountKey(w);
        const name = (accountKey && accountNames?.[accountKey]) || w.dealer || accountKey || 'Unknown';
        acctCounts.set(name, (acctCounts.get(name) || 0) + 1);
      });
      byAccount = [...acctCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      maxAccount = byAccount.length > 0 ? byAccount[0][1] : 0;
    }

    return { statusEntries, activeCount, inactiveCount, draftCount, byAccount, maxAccount };
  }, [workflows, showAccountBreakdown, accountNames]);

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
        <FlowIcon className="w-8 h-8 text-[var(--muted-foreground)] mx-auto mb-2" />
        <p className="text-sm text-[var(--muted-foreground)]">No workflow data yet</p>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          Accounts may need to reconnect their integration with workflow scopes
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={FlowIcon}
          value={workflows.length}
          label="Total Flows"
          color="text-purple-400"
          bgColor="bg-purple-500/10"
          delay={0}
          animated={animated}
        />
        <StatCard
          icon={PlayIcon}
          value={analytics.activeCount}
          label="Active"
          color="text-green-400"
          bgColor="bg-green-500/10"
          delay={1}
          animated={animated}
        />
        <StatCard
          icon={PauseIcon}
          value={analytics.inactiveCount}
          label="Inactive"
          color="text-zinc-400"
          bgColor="bg-zinc-500/10"
          delay={2}
          animated={animated}
        />
        <StatCard
          icon={DocumentTextIcon}
          value={analytics.draftCount}
          label="Draft"
          color="text-amber-400"
          bgColor="bg-amber-500/10"
          delay={3}
          animated={animated}
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status Distribution */}
        {analytics.statusEntries.length > 0 && (
          <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-1">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              Flow Status
            </h4>
            <div className="flex items-center gap-6">
              <DonutChart
                segments={analytics.statusEntries.map(([status, count]) => ({
                  value: count,
                  color: getStatusColor(status),
                }))}
                total={workflows.length}
                centerLabel="flows"
                animated={animated}
              />
              <div className="flex-1 space-y-2 min-w-0">
                {analytics.statusEntries.map(([status, count]) => {
                  const pct = workflows.length > 0 ? ((count / workflows.length) * 100).toFixed(0) : '0';
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

        {/* Flows per Account */}
        {showAccountBreakdown && analytics.byAccount.length > 0 && (
          <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-2">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              Flows by Account
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
