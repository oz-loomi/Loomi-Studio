'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  MegaphoneIcon,
  PaperAirplaneIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { FlowIcon } from '@/components/icon-map';

// ── Types ──

interface Campaign {
  id: string;
  name: string;
  status: string;
  accountKey?: string;
  dealer?: string;
}

interface Workflow {
  id: string;
  name: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  accountKey?: string;
  dealer?: string;
}

interface CampaignAnalyticsProps {
  campaigns: Campaign[];
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

const CAMPAIGN_STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  sent:       { color: 'text-green-400', bg: 'bg-green-500/10' },
  completed:  { color: 'text-green-400', bg: 'bg-green-500/10' },
  delivered:  { color: 'text-green-400', bg: 'bg-green-500/10' },
  scheduled:  { color: 'text-blue-400',  bg: 'bg-blue-500/10' },
  in_progress:{ color: 'text-cyan-400',  bg: 'bg-cyan-500/10' },
  draft:      { color: 'text-amber-400', bg: 'bg-amber-500/10' },
  paused:     { color: 'text-orange-400', bg: 'bg-orange-500/10' },
  archived:   { color: 'text-zinc-400',  bg: 'bg-zinc-500/10' },
};

const WORKFLOW_STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  active:   { color: 'text-green-400', bg: 'bg-green-500/10' },
  inactive: { color: 'text-zinc-400',  bg: 'bg-zinc-500/10' },
  draft:    { color: 'text-amber-400', bg: 'bg-amber-500/10' },
};

function getStatusColor(status: string, map: Record<string, { color: string; bg: string }>) {
  return map[status.toLowerCase()] || { color: 'text-zinc-400', bg: 'bg-zinc-500/10' };
}

function accountKeyForRecord(record: { accountKey?: string }): string | null {
  return record.accountKey || null;
}

// ── Component ──

export function CampaignAnalytics({
  campaigns,
  workflows,
  loading,
  showAccountBreakdown,
  accountNames,
}: CampaignAnalyticsProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if ((campaigns.length > 0 || workflows.length > 0) && !loading) {
      const timer = setTimeout(() => setAnimated(true), 100);
      return () => clearTimeout(timer);
    }
  }, [campaigns.length, workflows.length, loading]);

  const analytics = useMemo(() => {
    if (campaigns.length === 0 && workflows.length === 0) return null;

    // Campaign status counts
    const campaignStatuses = new Map<string, number>();
    campaigns.forEach(c => {
      const s = c.status.toLowerCase();
      campaignStatuses.set(s, (campaignStatuses.get(s) || 0) + 1);
    });
    const campaignStatusEntries = [...campaignStatuses.entries()].sort((a, b) => b[1] - a[1]);

    // Workflow status counts
    const workflowStatuses = new Map<string, number>();
    workflows.forEach(w => {
      const s = w.status.toLowerCase();
      workflowStatuses.set(s, (workflowStatuses.get(s) || 0) + 1);
    });
    const workflowStatusEntries = [...workflowStatuses.entries()].sort((a, b) => b[1] - a[1]);

    // Per-account campaign breakdown
    let campaignsByAccount: [string, number][] = [];
    let maxCampaignAccount = 0;
    if (showAccountBreakdown) {
      const acctCounts = new Map<string, number>();
      campaigns.forEach(c => {
        const accountKey = accountKeyForRecord(c);
        const name = (accountKey && accountNames?.[accountKey]) || c.dealer || accountKey || 'Unknown';
        acctCounts.set(name, (acctCounts.get(name) || 0) + 1);
      });
      campaignsByAccount = [...acctCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      maxCampaignAccount = campaignsByAccount.length > 0 ? campaignsByAccount[0][1] : 0;
    }

    // Per-account workflow breakdown
    let workflowsByAccount: [string, number][] = [];
    let maxWorkflowAccount = 0;
    if (showAccountBreakdown) {
      const acctCounts = new Map<string, number>();
      workflows.forEach(w => {
        const accountKey = accountKeyForRecord(w);
        const name = (accountKey && accountNames?.[accountKey]) || w.dealer || accountKey || 'Unknown';
        acctCounts.set(name, (acctCounts.get(name) || 0) + 1);
      });
      workflowsByAccount = [...acctCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      maxWorkflowAccount = workflowsByAccount.length > 0 ? workflowsByAccount[0][1] : 0;
    }

    // Campaign headline stats
    const sentCount = campaigns.filter(c =>
      ['sent', 'completed', 'delivered'].includes(c.status.toLowerCase())
    ).length;
    const scheduledCount = campaigns.filter(c =>
      ['scheduled', 'in_progress'].includes(c.status.toLowerCase())
    ).length;

    // Workflow headline stats
    const activeWorkflows = workflows.filter(w => w.status.toLowerCase() === 'active').length;

    return {
      campaignStatusEntries,
      workflowStatusEntries,
      campaignsByAccount,
      maxCampaignAccount,
      workflowsByAccount,
      maxWorkflowAccount,
      sentCount,
      scheduledCount,
      activeWorkflows,
    };
  }, [campaigns, workflows, showAccountBreakdown, accountNames]);

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
        <MegaphoneIcon className="w-8 h-8 text-[var(--muted-foreground)] mx-auto mb-2" />
        <p className="text-sm text-[var(--muted-foreground)]">No campaign or workflow data yet</p>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          Accounts may need to reconnect their ESP integration with campaign/workflow scopes
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={MegaphoneIcon}
          value={campaigns.length}
          label="Total Campaigns"
          color="text-blue-400"
          bgColor="bg-blue-500/10"
          delay={0}
          animated={animated}
        />
        <StatCard
          icon={PaperAirplaneIcon}
          value={analytics.sentCount}
          label="Sent / Completed"
          color="text-green-400"
          bgColor="bg-green-500/10"
          delay={1}
          animated={animated}
        />
        <StatCard
          icon={ClockIcon}
          value={analytics.scheduledCount}
          label="Scheduled / Active"
          color="text-cyan-400"
          bgColor="bg-cyan-500/10"
          delay={2}
          animated={animated}
        />
        <StatCard
          icon={FlowIcon}
          value={workflows.length}
          label="Total Workflows"
          sub={`${analytics.activeWorkflows} active`}
          color="text-purple-400"
          bgColor="bg-purple-500/10"
          delay={3}
          animated={animated}
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Campaign Status Distribution */}
        {analytics.campaignStatusEntries.length > 0 && (
          <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-1">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              Campaign Status
            </h4>
            <div className="flex items-center gap-6">
              <DonutChart
                segments={analytics.campaignStatusEntries.map(([, count], i) => ({
                  value: count,
                  color: CHART_COLORS[i % CHART_COLORS.length],
                }))}
                total={campaigns.length}
                centerLabel="campaigns"
                animated={animated}
              />
              <div className="flex-1 space-y-2 min-w-0">
                {analytics.campaignStatusEntries.map(([status, count]) => {
                  const cfg = getStatusColor(status, CAMPAIGN_STATUS_COLORS);
                  const pct = campaigns.length > 0 ? ((count / campaigns.length) * 100).toFixed(0) : '0';
                  return (
                    <div key={status} className="flex items-center gap-2 text-xs">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.bg}`} style={{ backgroundColor: cfg.color.includes('green') ? '#10b981' : cfg.color.includes('blue') ? '#3b82f6' : cfg.color.includes('amber') ? '#f59e0b' : cfg.color.includes('cyan') ? '#06b6d4' : cfg.color.includes('orange') ? '#f97316' : '#71717a' }} />
                      <span className="capitalize text-[var(--muted-foreground)]">{status.replace(/_/g, ' ')}</span>
                      <span className="ml-auto font-medium tabular-nums">{count}</span>
                      <span className="text-[var(--muted-foreground)] text-[10px] w-8 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Workflow Status Distribution */}
        {analytics.workflowStatusEntries.length > 0 && (
          <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-2">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              Workflow Status
            </h4>
            <div className="flex items-center gap-6">
              <DonutChart
                segments={analytics.workflowStatusEntries.map(([, count], i) => ({
                  value: count,
                  color: CHART_COLORS[(i + 3) % CHART_COLORS.length],
                }))}
                total={workflows.length}
                centerLabel="workflows"
                animated={animated}
              />
              <div className="flex-1 space-y-2 min-w-0">
                {analytics.workflowStatusEntries.map(([status, count]) => {
                  const cfg = getStatusColor(status, WORKFLOW_STATUS_COLORS);
                  const pct = workflows.length > 0 ? ((count / workflows.length) * 100).toFixed(0) : '0';
                  return (
                    <div key={status} className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color.includes('green') ? '#10b981' : cfg.color.includes('amber') ? '#f59e0b' : '#71717a' }} />
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
        {showAccountBreakdown && analytics.campaignsByAccount.length > 0 && (
          <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-3">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              Campaigns by Account
            </h4>
            <div className="space-y-2.5">
              {analytics.campaignsByAccount.map(([name, count], i) => (
                <BarRow
                  key={name}
                  label={name}
                  value={count}
                  max={analytics.maxCampaignAccount}
                  color={CHART_COLORS[i % CHART_COLORS.length]}
                  animated={animated}
                  delay={i * 60}
                />
              ))}
            </div>
          </div>
        )}

        {/* Workflows per Account */}
        {showAccountBreakdown && analytics.workflowsByAccount.length > 0 && (
          <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-4">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              Workflows by Account
            </h4>
            <div className="space-y-2.5">
              {analytics.workflowsByAccount.map(([name, count], i) => (
                <BarRow
                  key={name}
                  label={name}
                  value={count}
                  max={analytics.maxWorkflowAccount}
                  color={CHART_COLORS[(i + 4) % CHART_COLORS.length]}
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
