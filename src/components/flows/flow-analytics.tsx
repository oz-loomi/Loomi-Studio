'use client';

import { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from '@/contexts/theme-context';
import {
  PlayIcon,
  PauseIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { FlowIcon } from '@/components/icon-map';
import { iconColorHex } from '@/lib/icon-colors';
import type { ApexOptions } from 'apexcharts';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

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
  emptyTitle?: string;
  emptySubtitle?: string;
}

// ── Helpers ──

const STATUS_COLORS: Record<string, string> = {
  active: '#fb923c',
  published: '#fb923c',
  inactive: '#fdba74',
  draft: '#fed7aa',
};

function getStatusColor(status: string): string {
  return STATUS_COLORS[status.toLowerCase()] || '#fdba74';
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
  emptyTitle = 'No workflow data yet',
  emptySubtitle = 'Accounts may need to reconnect their integration with workflow scopes',
}: FlowAnalyticsProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
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

  // ── Chart config ──

  const chartTextColor = isDark ? '#a1a1aa' : '#71717a';
  const chartGridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  const statusDonutOptions: ApexOptions = useMemo(() => {
    if (!analytics || analytics.statusEntries.length === 0) return {} as ApexOptions;
    return {
      chart: { type: 'donut', background: 'transparent', animations: { enabled: true, speed: 600, easing: 'easeinout' } },
      colors: analytics.statusEntries.map(([status]) => getStatusColor(status)),
      labels: analytics.statusEntries.map(([status]) => status.charAt(0).toUpperCase() + status.slice(1)),
      legend: {
        position: 'right',
        fontSize: '11px',
        labels: { colors: chartTextColor },
        markers: { size: 6, offsetX: -3 },
        formatter: (seriesName: string, opts: { seriesIndex: number; w: { globals: { series: number[] } } }) => {
          const val = opts.w.globals.series[opts.seriesIndex];
          const total = opts.w.globals.series.reduce((a: number, b: number) => a + b, 0);
          const pct = total > 0 ? Math.round((val / total) * 100) : 0;
          return `${seriesName}  ${val} (${pct}%)`;
        },
      },
      plotOptions: {
        pie: {
          donut: {
            size: '70%',
            labels: {
              show: true,
              name: { show: true, fontSize: '10px', color: chartTextColor },
              value: { show: true, fontSize: '18px', fontWeight: 700, color: isDark ? '#e4e4e7' : '#18181b' },
              total: { show: true, label: 'flows', fontSize: '10px', color: chartTextColor, formatter: () => String(workflows.length) },
            },
          },
        },
      },
      dataLabels: { enabled: false },
      stroke: { show: false },
      tooltip: { theme: isDark ? 'dark' : 'light' },
    };
  }, [analytics, chartTextColor, isDark, workflows.length]);

  const statusDonutSeries = useMemo(
    () => analytics?.statusEntries.map(([, count]) => count) ?? [],
    [analytics],
  );

  const accountBarOptions: ApexOptions = useMemo(() => {
    if (!analytics || analytics.byAccount.length === 0) return {} as ApexOptions;
    return {
      chart: { type: 'bar', background: 'transparent', toolbar: { show: false }, animations: { enabled: true, speed: 600 } },
      plotOptions: { bar: { horizontal: true, distributed: true, borderRadius: 4, barHeight: '65%' } },
      colors: analytics.byAccount.map(() => iconColorHex('flows')),
      xaxis: {
        categories: analytics.byAccount.map(([name]) => name),
        labels: { style: { colors: chartTextColor, fontSize: '10px' } },
      },
      yaxis: {
        labels: { style: { colors: chartTextColor, fontSize: '11px' }, maxWidth: 120 },
      },
      grid: { borderColor: chartGridColor, strokeDashArray: 4, yaxis: { lines: { show: false } } },
      legend: { show: false },
      dataLabels: { enabled: false },
      tooltip: { theme: isDark ? 'dark' : 'light', y: { formatter: (val: number) => `${val} flow${val === 1 ? '' : 's'}` } },
    };
  }, [analytics, chartTextColor, chartGridColor, isDark]);

  const accountBarSeries = useMemo(
    () => [{ name: 'Flows', data: analytics?.byAccount.map(([, count]) => count) ?? [] }],
    [analytics],
  );

  // ── Render ──

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
        <StatCard icon={FlowIcon} value={workflows.length} label="Total Flows" color="text-orange-400" bgColor="bg-orange-500/10" delay={0} animated={animated} />
        <StatCard icon={PlayIcon} value={analytics.activeCount} label="Active" color="text-green-400" bgColor="bg-green-500/10" delay={1} animated={animated} />
        <StatCard icon={PauseIcon} value={analytics.inactiveCount} label="Inactive" color="text-zinc-400" bgColor="bg-zinc-500/10" delay={2} animated={animated} />
        <StatCard icon={DocumentTextIcon} value={analytics.draftCount} label="Draft" color="text-amber-400" bgColor="bg-amber-500/10" delay={3} animated={animated} />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status Distribution */}
        {analytics.statusEntries.length > 0 && (
          <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-1">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              Flow Status
            </h4>
            <ReactApexChart type="donut" height={180} options={statusDonutOptions} series={statusDonutSeries} />
          </div>
        )}

        {/* Flows per Account */}
        {showAccountBreakdown && analytics.byAccount.length > 0 && (
          <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-2">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              Flows by Account
            </h4>
            <ReactApexChart type="bar" height={Math.max(analytics.byAccount.length * 36, 120)} options={accountBarOptions} series={accountBarSeries} />
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
