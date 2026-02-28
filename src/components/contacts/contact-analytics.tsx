'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  UserGroupIcon,
  UserPlusIcon,
  ExclamationTriangleIcon,
  WrenchScrewdriverIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import {
  type DateRangeKey,
  getDateRangeBounds,
  getMonthBuckets,
  getDateRangeLabel,
  formatCustomRangeLabel,
  DATE_RANGE_PRESETS,
} from '@/lib/date-ranges';
import type { CustomDateRange } from '@/components/filters/date-range-filter';

// ── Types ──

interface Contact {
  id: string;
  fullName: string;
  tags: string[];
  dateAdded: string;
  source: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  lastServiceDate: string;
  nextServiceDate: string;
  leaseEndDate: string;
  warrantyEndDate: string;
  purchaseDate: string;
}

interface ContactAnalyticsProps {
  contacts: Contact[];
  totalCount: number;
  loading: boolean;
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

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function daysSince(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function isWithinDays(dateStr: string, days: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const diff = d.getTime() - Date.now();
  return diff > 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function isOverdue(dateStr: string): boolean {
  const d = daysSince(dateStr);
  return d !== null && d > 0;
}

// ── Component ──

export function ContactAnalytics({ contacts, totalCount, loading, dateRange, customRange }: ContactAnalyticsProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (contacts.length > 0 && !loading) {
      const timer = setTimeout(() => setAnimated(true), 100);
      return () => clearTimeout(timer);
    }
  }, [contacts.length, loading]);

  const analytics = useMemo(() => {
    if (contacts.length === 0) return null;

    // New contacts in selected range (contacts array is already filtered by parent)
    const newInRange = contacts.length;
    const rangePreset = DATE_RANGE_PRESETS.find(p => p.key === (dateRange ?? '30d'));
    const newLabel = dateRange === 'custom' && customRange
      ? 'New (Custom)'
      : dateRange
        ? `New (${rangePreset?.shortLabel ?? dateRange})`
        : 'New This Month';

    // Service alerts
    const serviceOverdue = contacts.filter(c =>
      c.nextServiceDate && isOverdue(c.nextServiceDate)
    ).length;

    // Expiring leases/warranties (within 90 days)
    const expiringLease = contacts.filter(c => isWithinDays(c.leaseEndDate, 90)).length;
    const expiringWarranty = contacts.filter(c => isWithinDays(c.warrantyEndDate, 90)).length;
    const totalExpiring = expiringLease + expiringWarranty;

    // Vehicle make distribution (top 8)
    const makeCounts = new Map<string, number>();
    contacts.forEach(c => {
      if (c.vehicleMake) {
        const make = c.vehicleMake.trim();
        makeCounts.set(make, (makeCounts.get(make) || 0) + 1);
      }
    });
    const vehicleMakes = [...makeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const maxMakeCount = vehicleMakes.length > 0 ? vehicleMakes[0][1] : 0;

    // Tag distribution (top 8)
    const tagCounts = new Map<string, number>();
    contacts.forEach(c => {
      c.tags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });
    const topTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const totalTagged = contacts.filter(c => c.tags.length > 0).length;

    // Contact growth — dynamic based on dateRange
    const bounds = dateRange === 'custom' && customRange
      ? getDateRangeBounds('custom', customRange.start, customRange.end)
      : getDateRangeBounds(dateRange ?? '6m');
    const buckets = getMonthBuckets(bounds.monthCount);
    const monthBuckets = buckets.map(b => ({
      label: b.label,
      count: contacts.filter(c => {
        if (!c.dateAdded) return false;
        const cd = new Date(c.dateAdded);
        return !isNaN(cd.getTime()) && cd >= b.start && cd < b.end;
      }).length,
    }));
    const maxMonthCount = Math.max(...monthBuckets.map(b => b.count), 1);

    // Service status breakdown
    const serviceUpToDate = contacts.filter(c => {
      if (!c.nextServiceDate) return false;
      const d = daysUntil(c.nextServiceDate);
      return d !== null && d > 0;
    }).length;
    const serviceNoData = contacts.filter(c => !c.nextServiceDate && !c.lastServiceDate).length;

    return {
      newInRange,
      newLabel,
      serviceOverdue,
      totalExpiring,
      expiringLease,
      expiringWarranty,
      vehicleMakes,
      maxMakeCount,
      topTags,
      totalTagged,
      monthBuckets,
      maxMonthCount,
      serviceUpToDate,
      serviceNoData,
    };
  }, [contacts, dateRange, customRange]);

  if (loading) {
    return (
      <div className="space-y-6">
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

  if (!analytics || contacts.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={UserGroupIcon}
          value={totalCount.toLocaleString()}
          label="Total Contacts"
          color="text-violet-400"
          bgColor="bg-violet-500/10"
          delay={0}
          animated={animated}
        />
        <StatCard
          icon={UserPlusIcon}
          value={analytics.newInRange}
          label={analytics.newLabel}
          color="text-green-400"
          bgColor="bg-green-500/10"
          delay={1}
          animated={animated}
        />
        <StatCard
          icon={WrenchScrewdriverIcon}
          value={analytics.serviceOverdue}
          label="Service Overdue"
          color={analytics.serviceOverdue > 0 ? 'text-red-400' : 'text-emerald-400'}
          bgColor={analytics.serviceOverdue > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}
          delay={2}
          animated={animated}
        />
        <StatCard
          icon={ExclamationTriangleIcon}
          value={analytics.totalExpiring}
          label="Expiring (90d)"
          sub={analytics.totalExpiring > 0 ? `${analytics.expiringLease} lease · ${analytics.expiringWarranty} warranty` : undefined}
          color={analytics.totalExpiring > 0 ? 'text-amber-400' : 'text-emerald-400'}
          bgColor={analytics.totalExpiring > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10'}
          delay={3}
          animated={animated}
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Vehicle Make Distribution */}
        {analytics.vehicleMakes.length > 0 && (
          <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-1">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              Vehicle Makes
            </h4>
            <div className="space-y-2.5">
              {analytics.vehicleMakes.map(([make, count], i) => (
                <BarRow
                  key={make}
                  label={make}
                  value={count}
                  max={analytics.maxMakeCount}
                  color={CHART_COLORS[i % CHART_COLORS.length]}
                  animated={animated}
                  delay={i * 60}
                />
              ))}
            </div>
          </div>
        )}

        {/* Tag Distribution — Donut */}
        {analytics.topTags.length > 0 && (
          <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-2">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              Tags
            </h4>
            <div className="flex items-center gap-6">
              <DonutChart
                segments={analytics.topTags.map(([, count], i) => ({
                  value: count,
                  color: CHART_COLORS[i % CHART_COLORS.length],
                }))}
                total={analytics.totalTagged}
                animated={animated}
              />
              <div className="flex-1 space-y-1.5 min-w-0">
                {analytics.topTags.map(([tag, count], i) => (
                  <div key={tag} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="truncate text-[var(--muted-foreground)]">{tag}</span>
                    <span className="ml-auto font-medium tabular-nums">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Contact Growth Sparkline */}
        {analytics.monthBuckets.some(b => b.count > 0) && (
          <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-3">
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              New Contacts ({dateRange === 'custom' && customRange ? formatCustomRangeLabel(customRange.start, customRange.end) : getDateRangeLabel(dateRange ?? '6m')})
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

        {/* Service Status */}
        <div className="glass-card rounded-xl p-4 animate-fade-in-up animate-stagger-4">
          <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Service Status
          </h4>
          <div className="space-y-3">
            <ServiceBar
              label="Up to Date"
              count={analytics.serviceUpToDate}
              total={contacts.length}
              color="#10b981"
              animated={animated}
            />
            <ServiceBar
              label="Overdue"
              count={analytics.serviceOverdue}
              total={contacts.length}
              color="#ef4444"
              animated={animated}
            />
            <ServiceBar
              label="No Data"
              count={analytics.serviceNoData}
              total={contacts.length}
              color="#71717a"
              animated={animated}
            />
          </div>
          {/* Expiry alerts */}
          {(analytics.expiringLease > 0 || analytics.expiringWarranty > 0) && (
            <div className="mt-4 pt-3 border-t border-[var(--border)] space-y-2">
              <p className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1">
                <ClockIcon className="w-3 h-3" />
                Expiring within 90 days
              </p>
              {analytics.expiringLease > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--muted-foreground)]">Leases</span>
                  <span className="font-medium text-amber-400">{analytics.expiringLease}</span>
                </div>
              )}
              {analytics.expiringWarranty > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--muted-foreground)]">Warranties</span>
                  <span className="font-medium text-amber-400">{analytics.expiringWarranty}</span>
                </div>
              )}
            </div>
          )}
        </div>
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
      <span className="text-xs text-[var(--muted-foreground)] w-20 truncate">{label}</span>
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
  animated,
}: {
  segments: { value: number; color: string }[];
  total: number;
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
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={strokeWidth}
        />
        {/* Segments */}
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
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold">{total}</span>
        <span className="text-[8px] text-[var(--muted-foreground)]">tagged</span>
      </div>
    </div>
  );
}

function ServiceBar({
  label,
  count,
  total,
  color,
  animated,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  animated: boolean;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--muted-foreground)]">{label}</span>
        <span className="font-medium tabular-nums">
          {count} <span className="text-[var(--muted-foreground)]">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--muted)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: animated ? `${Math.max(pct, count > 0 ? 1 : 0)}%` : '0%',
            backgroundColor: color,
            opacity: 0.75,
          }}
        />
      </div>
    </div>
  );
}
