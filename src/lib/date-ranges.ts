// ── Types ──

export type DateRangeKey = '7d' | '30d' | '3m' | '6m' | '12m' | 'all' | 'custom';

export interface DateRangePreset {
  key: DateRangeKey;
  label: string;
  shortLabel: string;
}

export interface DateRangeBounds {
  start: Date | null; // null = no lower bound ("all time")
  end: Date;
  monthCount: number; // how many month buckets to render in charts
}

// ── Presets ──

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  { key: '7d',  label: 'Last 7 days',    shortLabel: '7D'  },
  { key: '30d', label: 'Last 30 days',   shortLabel: '30D' },
  { key: '3m',  label: 'Last 3 months',  shortLabel: '3M'  },
  { key: '6m',  label: 'Last 6 months',  shortLabel: '6M'  },
  { key: '12m', label: 'Last 12 months', shortLabel: '12M' },
  { key: 'all', label: 'All time',       shortLabel: 'All' },
  { key: 'custom', label: 'Custom',      shortLabel: 'Custom' },
];

export const DEFAULT_DATE_RANGE: DateRangeKey = '6m';

// ── Boundary computation ──

/**
 * Compute date range bounds from a preset key.
 * For 'custom' without explicit dates, falls back to '6m'.
 */
export function getDateRangeBounds(key: DateRangeKey): DateRangeBounds;
/**
 * Compute date range bounds for a custom range with explicit start/end.
 */
export function getDateRangeBounds(
  key: 'custom',
  customStart: Date,
  customEnd: Date,
): DateRangeBounds;
export function getDateRangeBounds(
  key: DateRangeKey,
  customStart?: Date,
  customEnd?: Date,
): DateRangeBounds {
  const now = new Date();

  switch (key) {
    case '7d':
      return {
        start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        end: now,
        monthCount: 2,
      };
    case '30d':
      return {
        start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        end: now,
        monthCount: 2,
      };
    case '3m':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 3, 1),
        end: now,
        monthCount: 3,
      };
    case '6m':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 5, 1),
        end: now,
        monthCount: 6,
      };
    case '12m':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 11, 1),
        end: now,
        monthCount: 12,
      };
    case 'all':
      return {
        start: null,
        end: now,
        monthCount: 12, // still show last 12 months in sparkline for "all"
      };
    case 'custom': {
      if (!customStart || !customEnd) {
        // Fallback to 6m if no custom dates provided
        return getDateRangeBounds('6m');
      }
      const diffMs = customEnd.getTime() - customStart.getTime();
      const diffMonths = Math.max(
        1,
        Math.ceil(diffMs / (30.44 * 24 * 60 * 60 * 1000)),
      );
      return {
        start: customStart,
        end: customEnd,
        monthCount: Math.min(diffMonths, 24), // cap at 24 buckets for readability
      };
    }
  }
}

// ── Month bucket generator ──

export function getMonthBuckets(monthCount: number): { start: Date; end: Date; label: string }[] {
  const now = new Date();
  const buckets: { start: Date; end: Date; label: string }[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const label = start.toLocaleDateString('en-US', { month: 'short' });
    buckets.push({ start, end, label });
  }
  return buckets;
}

// ── Generic date filter ──

export function filterByDateRange<T>(
  items: T[],
  dateField: keyof T,
  bounds: DateRangeBounds,
): T[] {
  if (!bounds.start) return items; // "all time" — no filtering
  const startTime = bounds.start.getTime();
  const endTime = bounds.end.getTime();
  return items.filter(item => {
    const val = item[dateField];
    if (typeof val !== 'string' || !val) return false;
    const d = new Date(val as string);
    if (isNaN(d.getTime())) return false;
    return d.getTime() >= startTime && d.getTime() <= endTime;
  });
}

// ── Label helpers ──

export function getDateRangeLabel(key: DateRangeKey): string {
  if (key === 'custom') return 'Custom Range';
  const preset = DATE_RANGE_PRESETS.find(p => p.key === key);
  return preset?.label ?? 'Last 6 months';
}

/**
 * Format a custom date range as a readable label.
 */
export function formatCustomRangeLabel(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}
