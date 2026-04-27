'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  MegaphoneIcon,
  PlusIcon,
  XMarkIcon,
  AdjustmentsHorizontalIcon,
  TableCellsIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CalendarIcon,
  UserCircleIcon,
  PaintBrushIcon,
  CheckBadgeIcon,
  ChatBubbleLeftRightIcon,
  TrashIcon,
  FunnelIcon,
  ArrowPathIcon,
  PaperClipIcon,
  PhotoIcon,
  DocumentIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';
import { useSession } from 'next-auth/react';
import { AdminOnly } from '@/components/route-guard';
import { useAccount } from '@/contexts/account-context';
import { useUnsavedChanges } from '@/contexts/unsaved-changes-context';

// ─── Constants ─────────────────────────────────────────────────────────────
const AD_STATUSES = [
  'Ready- Pending Approval',
  'Live',
  'Stuck',
  'In Draft',
  'Live - Changes Required',
  'Pending Design',
  'Completed Run',
  'Off',
  'Waiting on Rep',
  'Scheduled',
  'Working on it',
];
const DESIGN_STATUSES = [
  'Work In Progress',
  'Approved',
  'Stuck',
  'Revisions Needed',
  'Not Started',
  'In Proofing/Pending Approval',
  'N/A',
];
const APPROVAL_STATUSES = [
  'Pending Approval',
  'Approved',
  'Does Not Approve',
  'Changes Requested',
];
const ACTION_NEEDED = [
  'Extending Ad',
  'Create New',
  'Updating Recurring Ad',
  'Update Existing Ad',
];
const RECURRING_OPTS = ['Yes', 'No', 'Unknown'];
const COOP_OPTS = ['Yes', 'No', 'Unknown'];

const COLORS = {
  daily: '#38bdf8',
  lifetime: '#a78bfa',
  base: '#38bdf8',
  added: '#34d399',
  success: '#22c55e',
  warn: '#f59e0b',
  error: '#ef4444',
};

const AD_COLORS = [
  '#38bdf8',
  '#a78bfa',
  '#34d399',
  '#fb923c',
  '#f472b6',
  '#facc15',
  '#60a5fa',
  '#4ade80',
];

const MARKUP = 0.77;

// ─── Types ─────────────────────────────────────────────────────────────────
interface DirectoryUser {
  id: string;
  name: string;
  title: string | null;
  email: string;
  avatarUrl: string | null;
  role: string;
  department: string | null;
  accountKeys?: string[];
}
interface DesignNote {
  id: string;
  text: string;
  createdAt: string;
  authorUserId: string | null;
}
interface ActivityEntry {
  id: string;
  text: string;
  createdAt: string;
  authorUserId: string | null;
  attachmentKey: string | null;
  attachmentFilename: string | null;
  attachmentMimeType: string | null;
  attachmentSize: number | null;
  attachmentUrl: string | null;
}
interface PacerAd {
  id: string;
  position: number;
  name: string;
  period: string;
  ownerUserId: string | null;
  designerUserId: string | null;
  accountRepUserId: string | null;
  actionNeeded: string | null;
  recurring: string;
  coop: string;
  budgetType: 'Daily' | 'Lifetime';
  budgetSource: 'base' | 'added';
  flightStart: string | null;
  flightEnd: string | null;
  liveDate: string | null;
  creativeDueDate: string | null;
  dueDate: string | null;
  dateCompleted: string | null;
  adStatus: string;
  designStatus: string;
  internalApproval: string;
  clientApproval: string;
  allocation: string | null;
  pacerActual: string | null;
  pacerDailyBudget: string | null;
  creativeLink: string | null;
  clientName: string | null;
  designNotes: DesignNote[];
  activityLog: ActivityEntry[];
}
interface PacerPlan {
  accountKey: string;
  period: string;
  baseBudgetGoal: string | null;
  addedBudgetGoal: string | null;
  ads: PacerAd[];
}
interface PeriodSummary {
  period: string;
  adCount: number;
}

type PacingStatus = 'on-track' | 'overpacing' | 'underpacing' | 'no-data';
type TopTab = 'budgeting' | 'summary';
type InnerTab = 'planner' | 'pacer';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ─── Helpers ───────────────────────────────────────────────────────────────
const fmt = (val: number | string | null | undefined): string => {
  const n = Number(val ?? 0);
  if (isNaN(n)) return '$0.00';
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};
const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};
const calcDays = (start: string | null, end: string | null): number => {
  if (!start || !end) return 0;
  return Math.max(
    0,
    Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1,
  );
};
const calcElapsed = (start: string | null, end: string | null): number => {
  if (!start || !end) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const s = new Date(start);
  const e = new Date(end);
  if (today < s) return 0;
  if (today > e) return calcDays(start, end);
  return Math.ceil((today.getTime() - s.getTime()) / 86400000) + 1;
};
/** Subtract N business days (Mon–Fri only) from a YYYY-MM-DD date string. */
function subtractBusinessDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function autoDueDateFromFlightStart(flightStart: string | null): string | null {
  if (!flightStart) return null;
  return subtractBusinessDays(flightStart, 2);
}

/**
 * Classify the urgency of an ad's overall due date.
 * Returns null when there's nothing actionable to surface (no due date, or the
 * ad is already live/completed/off so the due date is moot).
 */
type DueDateUrgency = {
  label: string;
  level: 'overdue' | 'today' | 'soon' | 'upcoming';
};
const DUE_DATE_DONE_STATUSES = new Set(['Live', 'Completed Run', 'Off']);
function classifyDueDate(ad: PacerAd): DueDateUrgency | null {
  if (!ad.dueDate) return null;
  if (DUE_DATE_DONE_STATUSES.has(ad.adStatus)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(ad.dueDate + 'T00:00:00');
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0)
    return { label: `Overdue ${Math.abs(diff)}d`, level: 'overdue' };
  if (diff === 0) return { label: 'Due today', level: 'today' };
  if (diff <= 2) return { label: `Due in ${diff}d`, level: 'soon' };
  if (diff <= 7) return { label: `Due in ${diff}d`, level: 'upcoming' };
  return null;
}
const DUE_DATE_CHIP_STYLES: Record<DueDateUrgency['level'], { bg: string; color: string }> = {
  overdue: { bg: 'rgba(239,68,68,0.18)', color: '#fca5a5' },
  today: { bg: 'rgba(252,211,77,0.22)', color: '#fcd34d' },
  soon: { bg: 'rgba(252,211,77,0.18)', color: '#fcd34d' },
  upcoming: { bg: 'rgba(190,242,100,0.18)', color: '#bef264' },
};
function DueDateChip({ ad }: { ad: PacerAd }) {
  const urgency = classifyDueDate(ad);
  if (!urgency) return null;
  const { bg, color } = DUE_DATE_CHIP_STYLES[urgency.level];
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ background: bg, color }}
    >
      {urgency.level === 'overdue' || urgency.level === 'today' ? (
        <ExclamationTriangleIcon className="w-3 h-3" />
      ) : (
        <ClockIcon className="w-3 h-3" />
      )}
      {urgency.label}
    </span>
  );
}
const num = (s: string | null | undefined): number | null => {
  if (s == null || s === '') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};
const newAdId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tmp_${Math.random().toString(36).slice(2)}`;

function makeAd(position: number, period: string): PacerAd {
  return {
    id: newAdId(),
    position,
    name: 'New Ad',
    period,
    ownerUserId: null,
    designerUserId: null,
    accountRepUserId: null,
    actionNeeded: null,
    recurring: 'No',
    coop: 'No',
    budgetType: 'Daily',
    budgetSource: 'base',
    flightStart: null,
    flightEnd: null,
    liveDate: null,
    creativeDueDate: null,
    dueDate: null,
    dateCompleted: null,
    adStatus: 'In Draft',
    designStatus: 'Not Started',
    internalApproval: 'Pending Approval',
    clientApproval: 'Pending Approval',
    allocation: null,
    pacerActual: null,
    pacerDailyBudget: null,
    creativeLink: null,
    clientName: null,
    designNotes: [],
    activityLog: [],
  };
}

const PACER_ACTIVITY_MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // mirror the API limit (25 MB)
function fmtBytes(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Period helpers ────────────────────────────────────────────────────────
function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function isValidPeriod(p: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
}
function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtPeriodLong(period: string): string {
  if (!isValidPeriod(period)) return period;
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}
function fmtPeriodShort(period: string): string {
  if (!isValidPeriod(period)) return period;
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

// ─── Filter types + helpers ────────────────────────────────────────────────
interface PlanFilters {
  status: string | null; // adStatus value | null
  source: 'all' | 'base' | 'added';
  assigneeUserId: string | null;
  showMine: boolean;
  showOverdue: boolean;
  showNeedsApproval: boolean;
  showActive: boolean;
}

const EMPTY_FILTERS: PlanFilters = {
  status: null,
  source: 'all',
  assigneeUserId: null,
  showMine: false,
  showOverdue: false,
  showNeedsApproval: false,
  showActive: false,
};

function filtersAreEmpty(f: PlanFilters): boolean {
  return (
    !f.status &&
    f.source === 'all' &&
    !f.assigneeUserId &&
    !f.showMine &&
    !f.showOverdue &&
    !f.showNeedsApproval &&
    !f.showActive
  );
}

function isAdOverdue(ad: PacerAd): boolean {
  if (!ad.creativeDueDate || ad.designStatus === 'Approved') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(ad.creativeDueDate + 'T00:00:00') < today;
}

const ACTIVE_STATUSES = ['Live', 'Live - Changes Required'];

function applyFilters(
  ads: PacerAd[],
  filters: PlanFilters,
  currentUserId: string | null,
): PacerAd[] {
  if (filtersAreEmpty(filters)) return ads;
  return ads.filter((ad) => {
    if (filters.status && ad.adStatus !== filters.status) return false;
    if (filters.source !== 'all' && ad.budgetSource !== filters.source) return false;
    if (filters.assigneeUserId) {
      const id = filters.assigneeUserId;
      if (
        ad.ownerUserId !== id &&
        ad.designerUserId !== id &&
        ad.accountRepUserId !== id
      ) {
        return false;
      }
    }
    if (filters.showMine && currentUserId) {
      if (
        ad.ownerUserId !== currentUserId &&
        ad.designerUserId !== currentUserId &&
        ad.accountRepUserId !== currentUserId
      ) {
        return false;
      }
    }
    if (filters.showOverdue && !isAdOverdue(ad)) return false;
    if (
      filters.showNeedsApproval &&
      ad.internalApproval !== 'Pending Approval' &&
      ad.clientApproval !== 'Pending Approval'
    ) {
      return false;
    }
    if (filters.showActive && !ACTIVE_STATUSES.includes(ad.adStatus)) return false;
    return true;
  });
}

// ─── Shared input chrome ───────────────────────────────────────────────────
const inputClass =
  'w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] focus:outline-none focus:border-[var(--primary)] text-[var(--foreground)]';
const labelClass =
  'block text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5';

// ─── Atomic UI ─────────────────────────────────────────────────────────────
function DollarInput({
  value,
  onChange,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] pointer-events-none">
        $
      </span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '0.00'}
        className={`${inputClass} pl-6`}
      />
    </div>
  );
}

function Field({ label, color, children }: { label: string; color?: string; children: ReactNode }) {
  return (
    <div>
      <label className={labelClass} style={color ? { color } : undefined}>
        {label}
      </label>
      {children}
    </div>
  );
}

function PaceBar({ pct, status }: { pct: number; status: PacingStatus }) {
  const color =
    status === 'on-track'
      ? COLORS.success
      : status === 'overpacing'
        ? COLORS.warn
        : COLORS.error;
  return (
    <div className="h-2 rounded-full overflow-hidden bg-[var(--muted)]">
      <div
        style={{
          width: `${Math.min(pct, 100)}%`,
          background: color,
          boxShadow: `0 0 8px ${color}80`,
        }}
        className="h-full rounded-full transition-[width] duration-500"
      />
    </div>
  );
}

function PacingBadge({ status }: { status: PacingStatus }) {
  const map: Record<PacingStatus, [string, string, string]> = {
    'on-track': ['rgba(34,197,94,0.18)', '#4ade80', 'On Track'],
    overpacing: ['rgba(245,158,11,0.20)', '#fbbf24', 'Overpacing'],
    underpacing: ['rgba(239,68,68,0.18)', '#f87171', 'Underpacing'],
    'no-data': ['var(--muted)', 'var(--muted-foreground)', 'No Data'],
  };
  const [bg, color, label] = map[status];
  return (
    <span
      className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}

const AD_STATUS_COLORS: Record<string, [string, string]> = {
  Live: ['rgba(34,197,94,0.18)', '#4ade80'],
  'Ready- Pending Approval': ['rgba(56,189,248,0.18)', '#7dd3fc'],
  'In Draft': ['var(--muted)', 'var(--muted-foreground)'],
  Scheduled: ['rgba(245,158,11,0.18)', '#fbbf24'],
  'Live - Changes Required': ['rgba(167,139,250,0.18)', '#c4b5fd'],
  'Pending Design': ['rgba(244,114,182,0.18)', '#f472b6'],
  'Completed Run': ['rgba(34,197,94,0.18)', '#86efac'],
  Off: ['rgba(94,234,212,0.18)', '#5eead4'],
  'Waiting on Rep': ['rgba(252,211,77,0.18)', '#fcd34d'],
  'Working on it': ['rgba(251,146,60,0.18)', '#fb923c'],
  Stuck: ['rgba(239,68,68,0.18)', '#fca5a5'],
};

function AdStatusPill({ status }: { status: string }) {
  const [bg, color] = AD_STATUS_COLORS[status] ?? ['var(--muted)', 'var(--muted-foreground)'];
  return (
    <span
      className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded whitespace-nowrap"
      style={{ background: bg, color }}
    >
      {status || '—'}
    </span>
  );
}

function ApprovalPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    Approved: ['rgba(34,197,94,0.18)', '#4ade80'],
    'Pending Approval': ['rgba(245,158,11,0.18)', '#fbbf24'],
    'Does Not Approve': ['rgba(239,68,68,0.18)', '#f87171'],
    'Changes Requested': ['rgba(56,189,248,0.18)', '#7dd3fc'],
  };
  const [bg, color] = map[status] ?? ['var(--muted)', 'var(--muted-foreground)'];
  return (
    <span
      className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded whitespace-nowrap"
      style={{ background: bg, color }}
    >
      {status || '—'}
    </span>
  );
}

function MetricBox({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-1">
        {label}
      </div>
      <div className="text-sm font-bold" style={{ color: color ?? 'var(--foreground)' }}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{sub}</div>
      )}
    </div>
  );
}

function SectionLabel({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <h2 className="m-0 mb-3.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
      {icon}
      {text}
    </h2>
  );
}

/**
 * Battery-style segmented bar showing the breakdown of Ad Statuses across an
 * account's full ad list. Width of each segment = proportion of ads in that
 * status. Ordered by status priority (worst → best) so problems are visible
 * on the left.
 */
const STATUS_PRIORITY = [
  'Stuck',
  'Pending Design',
  'Waiting on Rep',
  'In Draft',
  'Working on it',
  'Ready- Pending Approval',
  'Live - Changes Required',
  'Scheduled',
  'Live',
  'Completed Run',
  'Off',
];

/** Period selector — prev/next chevrons, native month input, recent-periods pills. */
function PeriodSelector({
  period,
  onChange,
  summaries,
}: {
  period: string;
  onChange: (next: string) => void;
  summaries: PeriodSummary[];
}) {
  // API returns periods newest-first; take the 6 most relevant, then display
  // them oldest → newest so they read like a timeline.
  const recent = [...summaries]
    .slice(0, 6)
    .sort((a, b) => a.period.localeCompare(b.period));
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
        <button
          type="button"
          onClick={() => onChange(shiftPeriod(period, -1))}
          className="px-2 py-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeftIcon className="w-4 h-4" />
        </button>
        <input
          type="month"
          value={period}
          onChange={(e) => {
            const v = e.target.value;
            if (v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)) onChange(v);
          }}
          className="bg-transparent text-sm font-semibold text-[var(--foreground)] px-2 py-1.5 focus:outline-none border-x border-[var(--border)] min-w-[140px]"
        />
        <button
          type="button"
          onClick={() => onChange(shiftPeriod(period, 1))}
          className="px-2 py-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          aria-label="Next month"
        >
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>
      {recent.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {recent.map((p) => {
            const active = p.period === period;
            return (
              <button
                key={p.period}
                type="button"
                onClick={() => onChange(p.period)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors"
                style={{
                  borderColor: active ? 'var(--primary)' : 'var(--border)',
                  background: active ? 'var(--primary)' : 'transparent',
                  color: active ? 'white' : 'var(--muted-foreground)',
                }}
              >
                {fmtPeriodShort(p.period)}
                <span
                  className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-semibold"
                  style={{
                    background: active ? 'rgba(255,255,255,0.25)' : 'var(--muted)',
                    color: active ? 'white' : 'var(--muted-foreground)',
                  }}
                >
                  {p.adCount}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBattery({ ads }: { ads: PacerAd[] }) {
  const total = ads.length;
  const breakdown = useMemo(() => {
    const counts = new Map<string, number>();
    ads.forEach((a) => {
      const s = a.adStatus || 'In Draft';
      counts.set(s, (counts.get(s) ?? 0) + 1);
    });
    return STATUS_PRIORITY.flatMap((status) => {
      const count = counts.get(status) ?? 0;
      return count > 0 ? [{ status, count }] : [];
    });
  }, [ads]);

  if (total === 0) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
        <div className="h-2.5 w-32 rounded-full border border-dashed border-[var(--border)]" />
        <span>No ads yet</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex flex-col gap-1 min-w-[160px]">
        <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-[var(--muted)] border border-[var(--border)]">
          {breakdown.map(({ status, count }) => {
            const w = (count / total) * 100;
            const color = AD_STATUS_COLORS[status]?.[1] ?? 'var(--muted-foreground)';
            return (
              <div
                key={status}
                title={`${status}: ${count} of ${total} (${w.toFixed(0)}%)`}
                className="h-full transition-[width] duration-500"
                style={{ width: `${w}%`, background: color }}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)] flex-wrap">
          <span className="font-semibold text-[var(--foreground)]">
            {total} ad{total !== 1 ? 's' : ''}
          </span>
          {breakdown.slice(0, 3).map(({ status, count }) => {
            const color = AD_STATUS_COLORS[status]?.[1] ?? 'var(--muted-foreground)';
            return (
              <span
                key={status}
                className="inline-flex items-center gap-1 whitespace-nowrap"
              >
                <span
                  className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
                  style={{ background: color }}
                />
                {count} {status}
              </span>
            );
          })}
          {breakdown.length > 3 && (
            <span>+{breakdown.length - 3} more</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Divider({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 my-4">
      <div className="h-px flex-1 bg-[var(--border)]" />
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] whitespace-nowrap">
        {icon}
        {label}
      </span>
      <div className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}

function BudgetTypeToggle({
  value,
  onChange,
}: {
  value: 'Daily' | 'Lifetime';
  onChange: (v: 'Daily' | 'Lifetime') => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--input)] overflow-hidden">
      {(['Daily', 'Lifetime'] as const).map((t) => {
        const active = value === t;
        const tint = t === 'Daily' ? 'rgba(56,189,248,0.18)' : 'rgba(167,139,250,0.18)';
        const fg = t === 'Daily' ? COLORS.daily : COLORS.lifetime;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors"
            style={{
              background: active ? tint : 'transparent',
              color: active ? fg : 'var(--muted-foreground)',
              borderRight: t === 'Daily' ? '1px solid var(--border)' : 'none',
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

function BudgetSourceToggle({
  value,
  onChange,
}: {
  value: 'base' | 'added';
  onChange: (v: 'base' | 'added') => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--input)] overflow-hidden">
      {(['base', 'added'] as const).map((t) => {
        const active = value === t;
        const tint = t === 'base' ? 'rgba(56,189,248,0.18)' : 'rgba(52,211,153,0.18)';
        const fg = t === 'base' ? COLORS.base : COLORS.added;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className="px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors"
            style={{
              background: active ? tint : 'transparent',
              color: active ? fg : 'var(--muted-foreground)',
              borderRight: t === 'base' ? '1px solid var(--border)' : 'none',
            }}
          >
            {t === 'base' ? 'Base' : 'Added'}
          </button>
        );
      })}
    </div>
  );
}

// ─── User picker (department-filtered) ─────────────────────────────────────
const USER_DEPT_FILTERS = {
  owner: ['Account Management', 'Leadership'],
  designer: ['Design'],
  accountRep: ['Account Management'],
} as const;

function UserPicker({
  users,
  value,
  onChange,
  filterFor,
  placeholder = '— Unassigned —',
}: {
  users: DirectoryUser[];
  value: string | null;
  onChange: (v: string | null) => void;
  filterFor: keyof typeof USER_DEPT_FILTERS;
  placeholder?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const allowedDepts = USER_DEPT_FILTERS[filterFor];

  const filteredUsers = useMemo(() => {
    const matched = users.filter((u) =>
      u.department ? (allowedDepts as readonly string[]).includes(u.department) : false,
    );
    return showAll ? users : matched;
  }, [users, showAll, allowedDepts]);

  // If selected user isn't in filtered list, ensure they still render
  const selected = users.find((u) => u.id === value);
  const finalList = useMemo(() => {
    if (selected && !filteredUsers.some((u) => u.id === selected.id)) {
      return [selected, ...filteredUsers];
    }
    return filteredUsers;
  }, [selected, filteredUsers]);

  return (
    <div className="space-y-1.5">
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className={inputClass}
      >
        <option value="">{placeholder}</option>
        {finalList.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
            {u.department ? ` · ${u.department}` : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setShowAll((p) => !p)}
        className="text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
      >
        {showAll ? 'Showing all users · filter to department' : 'Show all users'}
      </button>
    </div>
  );
}

// ─── Filter UI: status indicator + slide-from-right sidebar ────────────────
function activeFilterCount(f: PlanFilters): number {
  let n = 0;
  if (f.status) n++;
  if (f.source !== 'all') n++;
  if (f.assigneeUserId) n++;
  if (f.showMine) n++;
  if (f.showOverdue) n++;
  if (f.showNeedsApproval) n++;
  if (f.showActive) n++;
  return n;
}

function FilterChip({
  active,
  onClick,
  children,
  count,
  color,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  color?: string;
}) {
  const accent = color ?? 'var(--primary)';
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-full border transition-colors"
      style={{
        borderColor: active ? accent : 'var(--sidebar-border-soft)',
        background: active ? `${accent}1f` : 'transparent',
        color: active ? accent : 'var(--sidebar-muted-foreground)',
      }}
    >
      {children}
      {typeof count === 'number' && (
        <span
          className="text-[10px] font-semibold rounded-full px-1.5"
          style={{
            background: active ? `${accent}33` : 'var(--sidebar-muted)',
            color: active ? accent : 'var(--sidebar-muted-foreground)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Slim status row shown above the ad list inside each panel. */
function FilterStatus({
  filters,
  onClear,
  filteredCount,
  totalCount,
}: {
  filters: PlanFilters;
  onClear: () => void;
  filteredCount: number;
  totalCount: number;
}) {
  const active = activeFilterCount(filters);
  return (
    <div className="flex items-center justify-between gap-3 mb-3 text-[11px] text-[var(--muted-foreground)]">
      <div className="flex items-center gap-2">
        <span>
          Showing{' '}
          <span className="text-[var(--foreground)] font-semibold">{filteredCount}</span>{' '}
          of{' '}
          <span className="text-[var(--foreground)] font-semibold">{totalCount}</span>{' '}
          ad{totalCount !== 1 ? 's' : ''}
        </span>
        {active > 0 && (
          <>
            <span className="text-[var(--border)]">·</span>
            <span>
              {active} filter{active !== 1 ? 's' : ''} active
            </span>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              <ArrowPathIcon className="w-3 h-3" />
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Filter sidebar — slides in from the right, mirrors dashboard pattern. */
function MetaAdsPacerFilterSidebar({
  open,
  onClose,
  filters,
  onChange,
  users,
  ads,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  filters: PlanFilters;
  onChange: (next: PlanFilters) => void;
  users: DirectoryUser[];
  ads: PacerAd[];
  currentUserId: string | null;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const counts = useMemo(() => {
    const mine = currentUserId
      ? ads.filter(
          (a) =>
            a.ownerUserId === currentUserId ||
            a.designerUserId === currentUserId ||
            a.accountRepUserId === currentUserId,
        ).length
      : 0;
    const overdue = ads.filter(isAdOverdue).length;
    const needsApproval = ads.filter(
      (a) =>
        a.internalApproval === 'Pending Approval' ||
        a.clientApproval === 'Pending Approval',
    ).length;
    const active = ads.filter((a) => ACTIVE_STATUSES.includes(a.adStatus)).length;
    return { mine, overdue, needsApproval, active };
  }, [ads, currentUserId]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;
  const active = activeFilterCount(filters);
  const sidebarInputClass =
    'w-full px-3 py-2 text-sm rounded-lg border border-[var(--sidebar-border-soft)] bg-[var(--sidebar-input)]/60 text-[var(--sidebar-foreground)] focus:outline-none focus:border-[var(--primary)]/60 focus:ring-1 focus:ring-[var(--primary)]/30';
  const sectionLabelClass =
    'text-[11px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted-foreground)]';

  return createPortal(
    <div className="fixed inset-0 z-[120]">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="glass-panel glass-panel-strong fixed right-3 top-3 bottom-3 w-[360px] rounded-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-[var(--sidebar-border-soft)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FunnelIcon className="w-5 h-5 text-black dark:text-[var(--primary)]" />
            <h3 className="text-sm font-bold tracking-tight">Filters</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--sidebar-muted-foreground)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-muted)] transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="themed-scrollbar flex-1 overflow-y-auto p-4 space-y-5">
          {/* Quick views */}
          <section className="space-y-2.5">
            <p className={sectionLabelClass}>Quick views</p>
            <div className="flex flex-wrap gap-1.5">
              {currentUserId && (
                <FilterChip
                  active={filters.showMine}
                  onClick={() => onChange({ ...filters, showMine: !filters.showMine })}
                  count={counts.mine}
                >
                  Mine
                </FilterChip>
              )}
              <FilterChip
                active={filters.showOverdue}
                onClick={() => onChange({ ...filters, showOverdue: !filters.showOverdue })}
                count={counts.overdue}
                color={COLORS.error}
              >
                Overdue
              </FilterChip>
              <FilterChip
                active={filters.showNeedsApproval}
                onClick={() =>
                  onChange({ ...filters, showNeedsApproval: !filters.showNeedsApproval })
                }
                count={counts.needsApproval}
                color={COLORS.warn}
              >
                Needs Approval
              </FilterChip>
              <FilterChip
                active={filters.showActive}
                onClick={() => onChange({ ...filters, showActive: !filters.showActive })}
                count={counts.active}
                color={COLORS.success}
              >
                Active
              </FilterChip>
            </div>
          </section>

          {/* Status */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className={sectionLabelClass}>Ad status</p>
              {filters.status && (
                <button
                  type="button"
                  onClick={() => onChange({ ...filters, status: null })}
                  className="text-[10px] font-medium text-[var(--sidebar-muted-foreground)] hover:text-[var(--sidebar-foreground)] transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <select
              value={filters.status ?? ''}
              onChange={(e) =>
                onChange({ ...filters, status: e.target.value || null })
              }
              className={sidebarInputClass}
            >
              <option value="">All statuses</option>
              {AD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </section>

          {/* Source */}
          <section className="space-y-2.5">
            <p className={sectionLabelClass}>Budget source</p>
            <div className="flex rounded-lg border border-[var(--sidebar-border-soft)] bg-[var(--sidebar-input)]/60 overflow-hidden">
              {(['all', 'base', 'added'] as const).map((s) => {
                const isActive = filters.source === s;
                const accent =
                  s === 'base'
                    ? COLORS.base
                    : s === 'added'
                      ? COLORS.added
                      : 'var(--primary)';
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onChange({ ...filters, source: s })}
                    className="flex-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors"
                    style={{
                      background: isActive ? `${accent}33` : 'transparent',
                      color: isActive ? accent : 'var(--sidebar-muted-foreground)',
                      borderRight:
                        s !== 'added'
                          ? '1px solid var(--sidebar-border-soft)'
                          : 'none',
                    }}
                  >
                    {s === 'all' ? 'All' : s === 'base' ? 'Base' : 'Added'}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Assignee */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className={sectionLabelClass}>Assignee</p>
              {filters.assigneeUserId && (
                <button
                  type="button"
                  onClick={() => onChange({ ...filters, assigneeUserId: null })}
                  className="text-[10px] font-medium text-[var(--sidebar-muted-foreground)] hover:text-[var(--sidebar-foreground)] transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <select
              value={filters.assigneeUserId ?? ''}
              onChange={(e) =>
                onChange({ ...filters, assigneeUserId: e.target.value || null })
              }
              className={sidebarInputClass}
            >
              <option value="">Anyone assigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.department ? ` · ${u.department}` : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-[var(--sidebar-muted-foreground)] leading-relaxed">
              Matches ads where the user is the owner, designer, or account rep.
            </p>
          </section>
        </div>

        <div className="p-4 border-t border-[var(--sidebar-border-soft)] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            disabled={active === 0}
            className="px-3 py-2 text-xs rounded-lg border border-[var(--sidebar-border-soft)] text-[var(--sidebar-muted-foreground)] hover:text-[var(--sidebar-foreground)] disabled:opacity-50 transition-colors"
          >
            Reset all
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-xs rounded-lg border border-[var(--primary)] bg-[var(--primary)]/90 text-white hover:bg-[var(--primary)] transition-colors"
          >
            Done
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}


// ─── Computed view per ad (used in Pacer + Summary) ────────────────────────
interface AdCalc {
  ad: PacerAd;
  isLifetime: boolean;
  effectiveStart: string | null;
  days: number;
  daysElapsed: number;
  isLate: boolean;
  daysLate: number;
  allocation: number;
  dailyBudget: number | null;
  totalBudget: number;
  projected: number;
  impliedDaily: number | null;
  actual: number | null;
  target: number | null;
  recDaily: number | null;
  delta: number | null;
  expectedToDate: number;
  pacingPct: number | null;
  status: PacingStatus;
}

function buildAdCalc(ad: PacerAd): AdCalc {
  const isLifetime = ad.budgetType === 'Lifetime';
  const effectiveStart = ad.liveDate || ad.flightStart;
  const days = calcDays(effectiveStart, ad.flightEnd);
  const daysElapsed = calcElapsed(effectiveStart, ad.flightEnd);
  const isLate = !!(ad.liveDate && ad.flightStart && ad.liveDate > ad.flightStart);
  const daysLate = isLate ? calcDays(ad.flightStart, ad.liveDate) - 1 : 0;
  const allocation = num(ad.allocation) ?? 0;
  const dailyBudget = num(ad.pacerDailyBudget);
  const totalBudget = isLifetime ? allocation : dailyBudget ?? 0;
  const projected = isLifetime ? totalBudget : totalBudget * Math.max(days, 1);
  const impliedDaily = isLifetime && days > 0 ? totalBudget / days : null;
  const actual = num(ad.pacerActual);
  const target = allocation > 0 ? allocation : null;
  const recDaily = !isLifetime && target != null && days > 0 ? target / days : null;
  const delta = isLifetime
    ? target != null
      ? target - totalBudget
      : null
    : recDaily != null
      ? recDaily - (dailyBudget ?? 0)
      : null;
  const expectedToDate = isLifetime
    ? days > 0
      ? (totalBudget / days) * daysElapsed
      : 0
    : totalBudget * daysElapsed;
  let pacingPct: number | null = null;
  let status: PacingStatus = 'no-data';
  if (actual != null && expectedToDate > 0) {
    pacingPct = (actual / expectedToDate) * 100;
    status =
      pacingPct >= 90 && pacingPct <= 110
        ? 'on-track'
        : pacingPct > 110
          ? 'overpacing'
          : 'underpacing';
  }
  return {
    ad,
    isLifetime,
    effectiveStart,
    days,
    daysElapsed,
    isLate,
    daysLate,
    allocation,
    dailyBudget,
    totalBudget,
    projected,
    impliedDaily,
    actual,
    target,
    recDaily,
    delta,
    expectedToDate,
    pacingPct,
    status,
  };
}

// ─── Plan Ad Card (rich Monday-mapped editor) ──────────────────────────────
// ─── Ad Summary Card (compact list view — opens modal on click) ────────────
function AdSummaryCard({
  ad,
  index,
  users,
  onClick,
  onRemove,
  onClone,
}: {
  ad: PacerAd;
  index: number;
  users: DirectoryUser[];
  onClick: () => void;
  onRemove: (id: string) => void;
  onClone: (id: string) => void;
}) {
  const allocation = num(ad.allocation);
  const isLifetime = ad.budgetType === 'Lifetime';
  const repUser = users.find((u) => u.id === ad.accountRepUserId);

  return (
    <div
      onClick={onClick}
      className="group glass-section-card relative rounded-xl mb-2.5 overflow-hidden cursor-pointer hover:border-[var(--primary)]/40 transition-colors"
    >
      {/* Top row: name + key pills */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
          <div
            className="w-2 h-2 rounded-sm flex-shrink-0"
            style={{ background: AD_COLORS[index % AD_COLORS.length] }}
          />
          <span className="text-sm font-bold text-[var(--foreground)] truncate min-w-0 max-w-[260px]">
            {ad.name || 'Untitled Ad'}
          </span>
          <AdStatusPill status={ad.adStatus} />
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background: isLifetime
                ? 'rgba(167,139,250,0.18)'
                : 'rgba(56,189,248,0.18)',
              color: isLifetime ? COLORS.lifetime : COLORS.daily,
            }}
          >
            {ad.budgetType}
          </span>
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background:
                ad.budgetSource === 'base'
                  ? 'rgba(56,189,248,0.18)'
                  : 'rgba(52,211,153,0.18)',
              color: ad.budgetSource === 'base' ? COLORS.base : COLORS.added,
            }}
          >
            {ad.budgetSource === 'base' ? 'Base' : 'Added'}
          </span>
          <DueDateChip ad={ad} />
        </div>
        {/* Hover-only actions */}
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClone(ad.id);
            }}
            className="text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--muted)] rounded p-1 transition-colors"
            aria-label="Clone ad"
            title="Clone ad"
          >
            <DocumentDuplicateIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(ad.id);
            }}
            className="text-[var(--muted-foreground)] hover:text-red-400 hover:bg-[var(--muted)] rounded p-1 transition-colors"
            aria-label="Remove ad"
            title="Remove ad"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom row: meta info — 5 columns */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-4 py-2.5 border-t border-[var(--border)] bg-[var(--muted)]/40">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-wider text-[var(--muted-foreground)] mb-0.5">
            Allocation
          </div>
          <div
            className="text-xs font-semibold truncate"
            style={{
              color:
                ad.budgetSource === 'base' ? COLORS.base : COLORS.added,
            }}
          >
            {allocation != null ? fmt(allocation) : '—'}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-wider text-[var(--muted-foreground)] mb-0.5">
            Flight
          </div>
          <div className="text-xs text-[var(--foreground)] truncate">
            {ad.flightStart && ad.flightEnd
              ? `${fmtDate(ad.flightStart)} – ${fmtDate(ad.flightEnd)}`
              : '—'}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-wider text-[var(--muted-foreground)] mb-0.5">
            Design
          </div>
          <div className="text-xs text-[var(--foreground)] truncate">
            {ad.designStatus}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-wider text-[var(--muted-foreground)] mb-0.5">
            Rep
          </div>
          <div className="text-xs text-[var(--foreground)] truncate">
            {repUser?.name || '—'}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-wider text-[var(--muted-foreground)] mb-0.5">
            Updates
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--foreground)]">
            <ChatBubbleLeftRightIcon
              className="w-3.5 h-3.5"
              style={{
                color:
                  ad.activityLog.length > 0
                    ? 'var(--primary)'
                    : 'var(--muted-foreground)',
              }}
            />
            <span
              className="font-semibold"
              style={{
                color:
                  ad.activityLog.length > 0
                    ? 'var(--foreground)'
                    : 'var(--muted-foreground)',
              }}
            >
              {ad.activityLog.length}
            </span>
            {ad.activityLog.some((e) => e.attachmentKey) && (
              <PaperClipIcon
                className="w-3 h-3 text-[var(--muted-foreground)]"
                title="Has attachments"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Activity Log Panel — sidebar inside the editor modal ──────────────────
function ActivityAttachmentPreview({ entry }: { entry: ActivityEntry }) {
  if (!entry.attachmentUrl || !entry.attachmentFilename) return null;
  const isImage = !!entry.attachmentMimeType?.startsWith('image/');
  return (
    <div className="mt-2">
      {isImage && (
        <a href={entry.attachmentUrl} target="_blank" rel="noopener noreferrer">
          <img
            src={entry.attachmentUrl}
            alt={entry.attachmentFilename}
            className="max-w-full max-h-48 rounded-md border border-[var(--border)] object-contain bg-[var(--muted)]"
          />
        </a>
      )}
      <a
        href={entry.attachmentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex items-center gap-2 max-w-full text-[11px] text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
      >
        {isImage ? (
          <PhotoIcon className="w-3.5 h-3.5 flex-shrink-0 text-[var(--primary)]" />
        ) : (
          <DocumentIcon className="w-3.5 h-3.5 flex-shrink-0 text-[var(--primary)]" />
        )}
        <span className="truncate underline underline-offset-2">
          {entry.attachmentFilename}
        </span>
        <span className="text-[10px] text-[var(--muted-foreground)] flex-shrink-0">
          {fmtBytes(entry.attachmentSize)}
        </span>
      </a>
    </div>
  );
}

function ActivityLogPanel({
  ad,
  users,
  onAdd,
  onDelete,
}: {
  ad: PacerAd;
  users: DirectoryUser[];
  onAdd: (adId: string, text: string, file: File | null) => Promise<void>;
  onDelete: (adId: string, entryId: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userById = useMemo(() => {
    const m = new Map<string, DirectoryUser>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) return;
    if (picked.size > PACER_ACTIVITY_MAX_UPLOAD_BYTES) {
      setErrorMsg(
        `File is ${fmtBytes(picked.size)} — exceeds the ${PACER_ACTIVITY_MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit.`,
      );
      // Reset the input so the same file can be retried after picking another
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(picked);
    setErrorMsg(null);
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAdd = async () => {
    const t = text.trim();
    if ((!t && !file) || saving) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await onAdd(ad.id, t, file);
      setText('');
      clearFile();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to post entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="flex flex-col h-full border-l border-[var(--border)] bg-[var(--muted)]/30 min-h-0">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChatBubbleLeftRightIcon className="w-4 h-4 text-[var(--primary)]" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground)]">
            Activity Log
          </h3>
        </div>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {ad.activityLog.length} entr{ad.activityLog.length === 1 ? 'y' : 'ies'}
        </span>
      </div>

      <div className="themed-scrollbar flex-1 overflow-y-auto p-3 space-y-2">
        {ad.activityLog.length === 0 ? (
          <p className="text-[11px] text-[var(--muted-foreground)] text-center py-6">
            No activity yet. Add a comment, update, or attachment below.
          </p>
        ) : (
          [...ad.activityLog].reverse().map((u) => (
            <div
              key={u.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
            >
              <div className="flex justify-between items-start mb-1 gap-2">
                <span className="text-[10px] text-[var(--muted-foreground)] truncate">
                  {new Date(u.createdAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {u.authorUserId && userById.get(u.authorUserId) && (
                    <> · {userById.get(u.authorUserId)!.name}</>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(ad.id, u.id)}
                  className="text-[var(--muted-foreground)] hover:text-red-400 transition-colors flex-shrink-0"
                  aria-label="Delete entry"
                >
                  <TrashIcon className="w-3 h-3" />
                </button>
              </div>
              {u.text && (
                <p className="m-0 text-xs leading-relaxed text-[var(--foreground)] whitespace-pre-wrap">
                  {u.text}
                </p>
              )}
              <ActivityAttachmentPreview entry={u} />
            </div>
          ))
        )}
      </div>

      <div className="p-3 border-t border-[var(--border)] bg-[var(--card)]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Leave a comment or log an update…"
          rows={3}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd();
          }}
          className={`${inputClass} resize-none leading-relaxed mb-2`}
        />

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFilePick}
        />

        {file && (
          <div className="mb-2 flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--muted)]">
            <div className="flex items-center gap-2 min-w-0">
              <PaperClipIcon className="w-3.5 h-3.5 text-[var(--primary)] flex-shrink-0" />
              <span className="text-[11px] text-[var(--foreground)] truncate">
                {file.name}
              </span>
              <span className="text-[10px] text-[var(--muted-foreground)] flex-shrink-0">
                {fmtBytes(file.size)}
              </span>
            </div>
            <button
              type="button"
              onClick={clearFile}
              className="text-[var(--muted-foreground)] hover:text-red-400 transition-colors flex-shrink-0"
              aria-label="Remove attachment"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {errorMsg && (
          <p className="mb-2 text-[10px] text-red-400">{errorMsg}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              title={`Attach a file (max ${PACER_ACTIVITY_MAX_UPLOAD_BYTES / (1024 * 1024)} MB)`}
            >
              <PaperClipIcon className="w-3 h-3" />
              Attach
            </button>
            <span>⌘/Ctrl+Enter to post</span>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || (!text.trim() && !file)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] text-xs font-medium hover:bg-[var(--primary)]/20 transition-colors disabled:opacity-50"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Post
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Plan Ad Form — full editable form, used inside the editor modal ───────
function PlanAdForm({
  ad,
  users,
  onUpdate,
}: {
  ad: PacerAd;
  users: DirectoryUser[];
  onUpdate: (ad: PacerAd) => void;
}) {
  const days = calcDays(ad.flightStart, ad.flightEnd);
  const allocation = num(ad.allocation) ?? 0;

  const userById = useMemo(() => {
    const m = new Map<string, DirectoryUser>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);
  const accountRepUser = ad.accountRepUserId ? userById.get(ad.accountRepUserId) : null;

  const designOverdue = (() => {
    if (!ad.creativeDueDate || ad.designStatus === 'Approved') return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(ad.creativeDueDate + 'T00:00:00');
    const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0)
      return {
        icon: <ExclamationTriangleIcon className="w-3.5 h-3.5" />,
        label: `Overdue ${Math.abs(diff)}d`,
        bg: 'rgba(239,68,68,0.18)',
        color: '#fca5a5',
      };
    if (diff === 0)
      return {
        icon: <ExclamationTriangleIcon className="w-3.5 h-3.5" />,
        label: 'Due today',
        bg: 'rgba(252,211,77,0.18)',
        color: '#fcd34d',
      };
    if (diff <= 3)
      return {
        icon: <ClockIcon className="w-3.5 h-3.5" />,
        label: `Due in ${diff}d`,
        bg: 'rgba(252,211,77,0.18)',
        color: '#fcd34d',
      };
    if (diff <= 7)
      return {
        icon: <CalendarIcon className="w-3.5 h-3.5" />,
        label: `Due in ${diff}d`,
        bg: 'rgba(190,242,100,0.18)',
        color: '#bef264',
      };
    return null;
  })();

  return (
    <div>
          <Divider
            icon={<ClipboardDocumentListIcon className="w-3 h-3" />}
            label="Ad Details"
          />
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-2.5 mb-3">
            <Field label="Ad Name">
              <input
                value={ad.name}
                onChange={(e) => onUpdate({ ...ad, name: e.target.value })}
                placeholder="Ad name…"
                className={inputClass}
              />
            </Field>
            <Field label="Owner / Assigned To">
              <UserPicker
                users={users}
                value={ad.ownerUserId}
                filterFor="owner"
                onChange={(v) => onUpdate({ ...ad, ownerUserId: v })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
            <Field label="Action Needed">
              <select
                value={ad.actionNeeded ?? ''}
                onChange={(e) =>
                  onUpdate({ ...ad, actionNeeded: e.target.value || null })
                }
                className={inputClass}
              >
                <option value="">—</option>
                {ACTION_NEEDED.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Recurring?">
              <select
                value={ad.recurring}
                onChange={(e) => onUpdate({ ...ad, recurring: e.target.value })}
                className={inputClass}
              >
                {RECURRING_OPTS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Co-op?">
              <select
                value={ad.coop}
                onChange={(e) => onUpdate({ ...ad, coop: e.target.value })}
                className={inputClass}
              >
                {COOP_OPTS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ad Status">
              <select
                value={ad.adStatus}
                onChange={(e) => {
                  const newStatus = e.target.value;
                  const today = new Date().toISOString().split('T')[0];
                  onUpdate({
                    ...ad,
                    adStatus: newStatus,
                    dateCompleted:
                      newStatus === 'Live' && !ad.dateCompleted
                        ? today
                        : ad.dateCompleted,
                  });
                }}
                className={inputClass}
              >
                {AD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-3 max-w-2xl">
            <Field label="Due Date">
              <div className="relative">
                <input
                  type="date"
                  value={ad.dueDate ?? ''}
                  onChange={(e) =>
                    onUpdate({ ...ad, dueDate: e.target.value || null })
                  }
                  className={inputClass}
                />
                {ad.dueDate &&
                  ad.flightStart &&
                  ad.dueDate === autoDueDateFromFlightStart(ad.flightStart) && (
                    <span
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider pointer-events-none"
                      style={{ color: COLORS.daily }}
                    >
                      ● Auto-set
                    </span>
                  )}
              </div>
            </Field>
            <Field label="Date Completed">
              <div className="relative">
                <input
                  type="date"
                  value={ad.dateCompleted ?? ''}
                  onChange={(e) =>
                    onUpdate({ ...ad, dateCompleted: e.target.value || null })
                  }
                  className={inputClass}
                />
                {ad.dateCompleted && ad.adStatus === 'Live' && (
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider pointer-events-none"
                    style={{ color: COLORS.success }}
                  >
                    ● Auto-filled
                  </span>
                )}
              </div>
            </Field>
          </div>

          {/* Flight Dates */}
          <Divider icon={<CalendarIcon className="w-3 h-3" />} label="Flight Dates" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
            <Field label="Target Start">
              <input
                type="date"
                value={ad.flightStart ?? ''}
                onChange={(e) => {
                  const next = e.target.value || null;
                  // Auto-recompute the Due Date if it's still the auto value
                  // (or unset) so manual overrides are preserved.
                  const previousAuto = autoDueDateFromFlightStart(ad.flightStart);
                  const dueDateIsAuto =
                    ad.dueDate == null || ad.dueDate === previousAuto;
                  onUpdate({
                    ...ad,
                    flightStart: next,
                    dueDate: dueDateIsAuto
                      ? autoDueDateFromFlightStart(next)
                      : ad.dueDate,
                  });
                }}
                className={inputClass}
              />
            </Field>
            <Field label="End Date">
              <input
                type="date"
                value={ad.flightEnd ?? ''}
                onChange={(e) => onUpdate({ ...ad, flightEnd: e.target.value || null })}
                className={inputClass}
              />
            </Field>
            <Field label="Actual Live Date" color={COLORS.success}>
              <div className="relative">
                <input
                  type="date"
                  value={ad.liveDate ?? ''}
                  onChange={(e) =>
                    onUpdate({ ...ad, liveDate: e.target.value || null })
                  }
                  className={inputClass}
                  style={
                    ad.liveDate
                      ? { borderColor: 'rgba(34,197,94,0.4)' }
                      : undefined
                  }
                />
                {ad.liveDate && ad.flightStart && ad.liveDate > ad.flightStart && (
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold pointer-events-none"
                    style={{ color: COLORS.warn }}
                  >
                    +{calcDays(ad.flightStart, ad.liveDate) - 1}d late
                  </span>
                )}
              </div>
            </Field>
            <Field label="Effective Duration">
              <div
                className={`${inputClass} font-bold cursor-default`}
                style={{
                  color:
                    ad.liveDate && ad.flightEnd
                      ? COLORS.success
                      : days > 0
                        ? COLORS.daily
                        : 'var(--muted-foreground)',
                }}
              >
                {ad.liveDate && ad.flightEnd
                  ? `${calcDays(ad.liveDate, ad.flightEnd)} days`
                  : days > 0
                    ? `${days} days`
                    : 'Set dates'}
              </div>
            </Field>
          </div>

          {/* Budget */}
          <Divider icon={<ChartBarIcon className="w-3 h-3" />} label="Budget" />
          <div className="grid grid-cols-1 md:grid-cols-[auto_auto_1fr] gap-2.5 mb-3 items-end">
            <Field label="Budget Type">
              <BudgetTypeToggle
                value={ad.budgetType}
                onChange={(v) => onUpdate({ ...ad, budgetType: v })}
              />
            </Field>
            <Field label="Budget Source">
              <BudgetSourceToggle
                value={ad.budgetSource}
                onChange={(v) => onUpdate({ ...ad, budgetSource: v })}
              />
            </Field>
            <Field
              label="Actual Spend Amount"
              color={ad.budgetSource === 'base' ? COLORS.base : COLORS.added}
            >
              <DollarInput
                value={ad.allocation}
                onChange={(v) => onUpdate({ ...ad, allocation: v })}
                placeholder="0.00"
              />
            </Field>
          </div>

          {allocation > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
              <MetricBox
                label="Gross Allocation"
                value={fmt(Math.round((allocation / MARKUP) * 100) / 100)}
                sub="client budget"
              />
              <MetricBox
                label="Actual Spend"
                value={fmt(allocation)}
                color={ad.budgetSource === 'base' ? COLORS.base : COLORS.added}
              />
            </div>
          )}

          {/* Creative & Design */}
          <Divider
            icon={<PaintBrushIcon className="w-3 h-3" />}
            label="Creative & Design"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-3">
            <Field label="Design Status">
              <select
                value={ad.designStatus}
                onChange={(e) => onUpdate({ ...ad, designStatus: e.target.value })}
                className={inputClass}
              >
                {DESIGN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Designer Assigned">
              <UserPicker
                users={users}
                value={ad.designerUserId}
                filterFor="designer"
                onChange={(v) => onUpdate({ ...ad, designerUserId: v })}
              />
            </Field>
            <Field label="Creative Due Date">
              <input
                type="date"
                value={ad.creativeDueDate ?? ''}
                onChange={(e) =>
                  onUpdate({ ...ad, creativeDueDate: e.target.value || null })
                }
                className={inputClass}
              />
              {designOverdue && (
                <div
                  className="mt-1.5 flex items-center gap-1.5 px-2 py-1 rounded-md border"
                  style={{
                    background: designOverdue.bg,
                    borderColor: `${designOverdue.color}60`,
                    color: designOverdue.color,
                  }}
                >
                  {designOverdue.icon}
                  <span className="text-[10px] font-bold">{designOverdue.label}</span>
                </div>
              )}
            </Field>
          </div>
          <div className="mb-3 max-w-xl">
            <Field label="Creative Link">
              <input
                value={ad.creativeLink ?? ''}
                onChange={(e) =>
                  onUpdate({ ...ad, creativeLink: e.target.value || null })
                }
                placeholder="https://…"
                className={inputClass}
              />
            </Field>
          </div>

          {/* Approvals */}
          <Divider icon={<CheckBadgeIcon className="w-3 h-3" />} label="Approvals" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-3 max-w-2xl">
            <Field label="Account Rep">
              <UserPicker
                users={users}
                value={ad.accountRepUserId}
                filterFor="accountRep"
                onChange={(v) => onUpdate({ ...ad, accountRepUserId: v })}
              />
            </Field>
            <Field label="Client Name">
              <input
                value={ad.clientName ?? ''}
                onChange={(e) =>
                  onUpdate({ ...ad, clientName: e.target.value || null })
                }
                placeholder="Client decision-maker name…"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-3 max-w-2xl">
            <Field label="Account Rep Approval">
              <select
                value={ad.internalApproval}
                onChange={(e) =>
                  onUpdate({ ...ad, internalApproval: e.target.value })
                }
                className={inputClass}
              >
                {APPROVAL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Client Approval">
              <select
                value={ad.clientApproval}
                onChange={(e) =>
                  onUpdate({ ...ad, clientApproval: e.target.value })
                }
                className={inputClass}
              >
                {APPROVAL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {/* Approval status summary — clearly labeled by source */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-1 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                <UserCircleIcon className="w-3.5 h-3.5" />
                Rep
                {accountRepUser && (
                  <span className="ml-1 text-[var(--foreground)] normal-case tracking-normal">
                    · {accountRepUser.name}
                  </span>
                )}
              </span>
              <ApprovalPill status={ad.internalApproval} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                <UserCircleIcon className="w-3.5 h-3.5" />
                Client
                {ad.clientName && (
                  <span className="ml-1 text-[var(--foreground)] normal-case tracking-normal">
                    · {ad.clientName}
                  </span>
                )}
              </span>
              <ApprovalPill status={ad.clientApproval} />
            </div>
          </div>

    </div>
  );
}

// ─── Ad Editor Modal — full-screen modal wrapping PlanAdForm ───────────────
function AdEditorModal({
  ad,
  users,
  onChange,
  onClose,
  onAddActivity,
  onDeleteActivity,
}: {
  ad: PacerAd;
  users: DirectoryUser[];
  onChange: (ad: PacerAd) => void;
  onClose: () => void;
  onAddActivity: (adId: string, text: string, file: File | null) => Promise<void>;
  onDeleteActivity: (adId: string, entryId: string) => Promise<void>;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const accentColor = AD_STATUS_COLORS[ad.adStatus]?.[1] ?? 'var(--border)';

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-stretch justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="glass-modal relative my-6 mx-4 w-full max-w-6xl rounded-2xl flex flex-col overflow-hidden">
        <div
          className="absolute top-0 left-0 right-0 h-0.5"
          style={{ background: accentColor }}
        />
        {/* Modal header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <ClipboardDocumentListIcon className="w-5 h-5 text-[var(--primary)] flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-[var(--foreground)] truncate">
                {ad.name?.trim() ? ad.name : 'New Ad'}
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)]">
                Edit ad details — autosaved as you type
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--primary)] bg-[var(--primary)]/90 text-white text-xs font-medium hover:bg-[var(--primary)] transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal body — form on the left, activity log on the right */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1fr_340px]">
          <div className="themed-scrollbar overflow-y-auto p-5">
            <PlanAdForm ad={ad} users={users} onUpdate={onChange} />
          </div>
          <ActivityLogPanel
            ad={ad}
            users={users}
            onAdd={onAddActivity}
            onDelete={onDeleteActivity}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Budget Panel (base / added) ───────────────────────────────────────────
function BudgetPanel({
  title,
  source,
  color,
  goalKey,
  plan,
  onChange,
}: {
  title: string;
  source: 'base' | 'added';
  color: string;
  goalKey: 'baseBudgetGoal' | 'addedBudgetGoal';
  plan: PacerPlan;
  onChange: (p: PacerPlan) => void;
}) {
  const goal = num(plan[goalKey]);
  const srcAds = plan.ads.filter((a) => a.budgetSource === source);
  const totalAlloc = srcAds.reduce((s, a) => s + (num(a.allocation) ?? 0), 0);
  const grossAlloc = Math.round((totalAlloc / MARKUP) * 100) / 100;
  const remaining = goal != null ? goal * MARKUP - totalAlloc : null;
  const allocPct = goal != null && goal > 0 ? (totalAlloc / (goal * MARKUP)) * 100 : null;
  const allocStatus =
    allocPct == null ? null : allocPct > 105 ? 'over' : allocPct >= 95 ? 'perfect' : 'under';
  const statusColor =
    allocStatus === 'over'
      ? COLORS.error
      : allocStatus === 'perfect'
        ? COLORS.success
        : COLORS.warn;

  return (
    <div
      className="glass-section-card relative flex-1 min-w-[280px] rounded-xl px-5 py-4 overflow-hidden"
      style={{ borderColor: `${color}40` }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: color }}
      />

      <div className="flex items-center justify-between mb-3.5">
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color }}
        >
          {title}
        </span>
        {allocStatus && (
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{
              background:
                allocStatus === 'over'
                  ? 'rgba(239,68,68,0.18)'
                  : allocStatus === 'perfect'
                    ? 'rgba(34,197,94,0.18)'
                    : 'rgba(245,158,11,0.18)',
              color: statusColor,
            }}
          >
            {allocStatus === 'over'
              ? 'Over'
              : allocStatus === 'perfect'
                ? 'Full'
                : 'Under'}
          </span>
        )}
      </div>

      {/* Goal input row */}
      <div className="grid grid-cols-2 gap-2.5 mb-3.5">
        <Field label="Client Budget Goal (Gross)">
          <DollarInput
            value={plan[goalKey]}
            onChange={(v) => onChange({ ...plan, [goalKey]: v })}
            placeholder="0.00"
          />
        </Field>
        <Field label="Actual Spend Budget">
          <div
            className={`${inputClass} font-bold cursor-default`}
            style={{ color }}
          >
            {goal != null ? fmt(Math.round(goal * MARKUP * 100) / 100) : '—'}
          </div>
        </Field>
      </div>

      {/* Metric boxes */}
      <div
        className="grid grid-cols-2 md:grid-cols-3 gap-2"
        style={{ marginBottom: goal != null && goal > 0 ? 14 : 0 }}
      >
        <MetricBox
          label="Gross Allocation"
          value={fmt(grossAlloc)}
          sub="client budget"
        />
        <MetricBox
          label="Total Allocated"
          value={fmt(totalAlloc)}
          sub="actual spend"
          color={
            allocPct != null
              ? allocPct > 105
                ? COLORS.error
                : allocPct >= 95
                  ? COLORS.success
                  : COLORS.warn
              : color
          }
        />
        {goal != null && (
          <MetricBox
            label="Remaining (Gross)"
            value={fmt(Math.abs(remaining ?? 0))}
            sub={remaining != null && remaining < 0 ? 'over budget' : 'unallocated'}
            color={remaining != null && remaining < 0 ? COLORS.error : COLORS.success}
          />
        )}
      </div>

      {/* Allocation bar */}
      {goal != null && goal > 0 && (
        <>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Allocation
            </span>
            <span
              className="text-[10px] font-bold"
              style={{ color: statusColor }}
            >
              {allocPct != null ? `${allocPct.toFixed(1)}%` : ''}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden bg-[var(--muted)] flex mb-2">
            {srcAds.map((a, i) => {
              const alloc = num(a.allocation) ?? 0;
              const w = goal > 0 ? Math.min((alloc / (goal * MARKUP)) * 100, 100) : 0;
              return w > 0 ? (
                <div
                  key={a.id}
                  title={`${a.name}: ${fmt(alloc)}`}
                  className="h-full transition-[width] duration-500"
                  style={{
                    width: `${w}%`,
                    background: AD_COLORS[i % AD_COLORS.length],
                    borderRight: '1px solid var(--background)',
                  }}
                />
              ) : null;
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {srcAds
              .filter((a) => (num(a.allocation) ?? 0) > 0)
              .map((a, i) => (
                <div
                  key={a.id}
                  className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]"
                >
                  <div
                    className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
                    style={{ background: AD_COLORS[i % AD_COLORS.length] }}
                  />
                  <span className="max-w-[110px] overflow-hidden text-ellipsis whitespace-nowrap text-[var(--foreground)]">
                    {a.name}
                  </span>
                  <span>{fmt(num(a.allocation) ?? 0)}</span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Total Account Allocation header ───────────────────────────────────────
function TotalAllocationHeader({ plan }: { plan: PacerPlan }) {
  const totalBase = plan.ads
    .filter((a) => a.budgetSource === 'base')
    .reduce((s, a) => s + (num(a.allocation) ?? 0), 0);
  const totalAdded = plan.ads
    .filter((a) => a.budgetSource === 'added')
    .reduce((s, a) => s + (num(a.allocation) ?? 0), 0);
  const totalActual = totalBase + totalAdded;
  if (totalActual === 0) return null;
  const totalGross = Math.round((totalActual / MARKUP) * 100) / 100;
  const baseGoal = num(plan.baseBudgetGoal);
  const addedGoal = num(plan.addedBudgetGoal);
  const combinedGoal =
    baseGoal != null || addedGoal != null ? (baseGoal ?? 0) + (addedGoal ?? 0) : null;
  const combinedActualBudget =
    combinedGoal != null ? Math.round(combinedGoal * MARKUP * 100) / 100 : null;
  const allocPct =
    combinedActualBudget != null && combinedActualBudget > 0
      ? (totalActual / combinedActualBudget) * 100
      : null;
  const pctColor =
    allocPct == null
      ? 'var(--muted-foreground)'
      : allocPct > 105
        ? COLORS.error
        : allocPct >= 95
          ? COLORS.success
          : COLORS.warn;
  const baseW = totalActual > 0 ? (totalBase / totalActual) * 100 : 0;
  const addedW = totalActual > 0 ? (totalAdded / totalActual) * 100 : 0;

  return (
    <div className="glass-section-card rounded-xl px-5 py-4 mb-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground)]">
          Total Account Allocation
        </span>
        <div className="flex gap-3 flex-wrap">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
              Total Gross
            </div>
            <div className="text-base font-bold text-[var(--foreground)]">
              {fmt(totalGross)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
              Total Actual Spend
            </div>
            <div className="text-base font-bold text-[var(--foreground)]">
              {fmt(totalActual)}
            </div>
          </div>
          {allocPct != null && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                Allocated
              </div>
              <div className="text-base font-bold" style={{ color: pctColor }}>
                {allocPct.toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden bg-[var(--muted)] flex mb-2">
        {baseW > 0 && (
          <div
            className="h-full transition-[width] duration-500"
            style={{
              width: `${baseW}%`,
              background: `linear-gradient(90deg, rgba(56,189,248,0.4), ${COLORS.base})`,
              borderRight: addedW > 0 ? '1px solid var(--background)' : 'none',
            }}
          />
        )}
        {addedW > 0 && (
          <div
            className="h-full transition-[width] duration-500"
            style={{
              width: `${addedW}%`,
              background: `linear-gradient(90deg, rgba(52,211,153,0.4), ${COLORS.added})`,
            }}
          />
        )}
      </div>
      <div className="flex gap-4 flex-wrap">
        {totalBase > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)]">
            <div
              className="w-2 h-2 rounded-sm flex-shrink-0"
              style={{ background: COLORS.base }}
            />
            <span>Base</span>
            <span className="font-bold" style={{ color: COLORS.base }}>
              {fmt(totalBase)}
            </span>
            <span>({baseW.toFixed(1)}%)</span>
          </div>
        )}
        {totalAdded > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)]">
            <div
              className="w-2 h-2 rounded-sm flex-shrink-0"
              style={{ background: COLORS.added }}
            />
            <span>Added</span>
            <span className="font-bold" style={{ color: COLORS.added }}>
              {fmt(totalAdded)}
            </span>
            <span>({addedW.toFixed(1)}%)</span>
          </div>
        )}
        {combinedActualBudget != null && (
          <div className="text-[10px] text-[var(--muted-foreground)] ml-auto">
            of {fmt(combinedActualBudget)} actual spend budget
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Empty period state with Copy-from ─────────────────────────────────────
function EmptyPeriodState({
  period,
  periodSummaries,
  onAddAd,
  onCopyFrom,
}: {
  period: string;
  periodSummaries: PeriodSummary[];
  onAddAd: () => void;
  onCopyFrom: (from: string) => void;
}) {
  const sources = periodSummaries.filter((p) => p.period !== period && p.adCount > 0);
  const [selected, setSelected] = useState<string>(sources[0]?.period ?? '');
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] py-10 px-6 text-center mb-3">
      <ClipboardDocumentListIcon className="w-10 h-10 mx-auto mb-3 text-[var(--muted-foreground)]" />
      <p className="text-sm text-[var(--foreground)] font-medium mb-1">
        No ads planned for {fmtPeriodLong(period)} yet.
      </p>
      <p className="text-xs text-[var(--muted-foreground)] mb-5">
        Start fresh, or copy ads from a previous month.
      </p>
      <div className="flex flex-wrap gap-2 justify-center items-center">
        <button
          type="button"
          onClick={onAddAd}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--primary)] bg-[var(--primary)]/10 px-3 py-2 text-xs font-medium text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Add first ad
        </button>
        {sources.length > 0 && (
          <div className="inline-flex items-stretch rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="bg-transparent text-xs px-3 py-2 text-[var(--foreground)] focus:outline-none"
            >
              {sources.map((p) => (
                <option key={p.period} value={p.period}>
                  Copy from {fmtPeriodShort(p.period)} ({p.adCount} ad
                  {p.adCount !== 1 ? 's' : ''})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onCopyFrom(selected)}
              disabled={!selected}
              className="px-3 py-2 text-xs font-medium border-l border-[var(--border)] text-[var(--primary)] hover:bg-[var(--muted)] disabled:opacity-50 transition-colors"
            >
              Copy
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Ad Planner panel ──────────────────────────────────────────────────────
function AdPlannerPanel({
  plan,
  period,
  users,
  filters,
  onFiltersChange,
  currentUserId,
  periodSummaries,
  onChange,
  onCopyFrom,
  onAddActivity,
  onDeleteActivity,
}: {
  plan: PacerPlan;
  period: string;
  users: DirectoryUser[];
  filters: PlanFilters;
  onFiltersChange: (next: PlanFilters) => void;
  currentUserId: string | null;
  periodSummaries: PeriodSummary[];
  onChange: (p: PacerPlan) => void;
  onCopyFrom: (from: string) => void;
  onAddActivity: (adId: string, text: string, file: File | null) => Promise<void>;
  onDeleteActivity: (adId: string, entryId: string) => Promise<void>;
}) {
  const [editingAdId, setEditingAdId] = useState<string | null>(null);

  const updateAd = (u: PacerAd) =>
    onChange({ ...plan, ads: plan.ads.map((a) => (a.id === u.id ? u : a)) });
  const removeAd = (id: string) => {
    onChange({ ...plan, ads: plan.ads.filter((a) => a.id !== id) });
    if (editingAdId === id) setEditingAdId(null);
  };
  const addAd = () => {
    const fresh = makeAd(plan.ads.length, period);
    onChange({ ...plan, ads: [...plan.ads, fresh] });
    setEditingAdId(fresh.id);
  };
  const cloneAd = (id: string) => {
    const src = plan.ads.find((a) => a.id === id);
    if (!src) return;
    const cloneName = `${src.name || 'Ad'} (copy)`;
    const cloned: PacerAd = {
      ...src,
      id: newAdId(),
      position: plan.ads.length,
      name: cloneName,
      // Activity log + design notes are tied to the original — start fresh
      activityLog: [],
      designNotes: [],
    };
    onChange({ ...plan, ads: [...plan.ads, cloned] });
  };

  const visibleAds = useMemo(
    () => applyFilters(plan.ads, filters, currentUserId),
    [plan.ads, filters, currentUserId],
  );

  const editingAd = editingAdId
    ? plan.ads.find((a) => a.id === editingAdId) ?? null
    : null;

  return (
    <div>
      {/* Header row: Ad Plan label + Add Plan CTA on the right */}
      <div className="flex items-center justify-between gap-3 mb-3.5 flex-wrap">
        <h2 className="m-0 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
          <ClipboardDocumentListIcon className="w-3 h-3" />
          {`Ad Plan · ${fmtPeriodLong(period)} (${visibleAds.length}${
            visibleAds.length !== plan.ads.length ? ` of ${plan.ads.length}` : ''
          } ad${plan.ads.length !== 1 ? 's' : ''})`}
        </h2>
        <button
          type="button"
          onClick={addAd}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--primary)] bg-[var(--primary)]/90 text-white px-3 py-1.5 text-xs font-medium hover:bg-[var(--primary)] transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Add Plan
        </button>
      </div>

      {plan.ads.length > 0 && (
        <FilterStatus
          filters={filters}
          onClear={() => onFiltersChange(EMPTY_FILTERS)}
          filteredCount={visibleAds.length}
          totalCount={plan.ads.length}
        />
      )}

      {plan.ads.length === 0 ? (
        <EmptyPeriodState
          period={period}
          periodSummaries={periodSummaries}
          onAddAd={addAd}
          onCopyFrom={onCopyFrom}
        />
      ) : visibleAds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-10 px-6 text-center text-sm text-[var(--muted-foreground)] mb-3">
          No ads match the current filters.
        </div>
      ) : (
        visibleAds.map((ad) => (
          <AdSummaryCard
            key={ad.id}
            ad={ad}
            index={plan.ads.findIndex((a) => a.id === ad.id)}
            users={users}
            onClick={() => setEditingAdId(ad.id)}
            onRemove={removeAd}
            onClone={cloneAd}
          />
        ))
      )}

      {editingAd && (
        <AdEditorModal
          ad={editingAd}
          users={users}
          onChange={updateAd}
          onClose={() => setEditingAdId(null)}
          onAddActivity={onAddActivity}
          onDeleteActivity={onDeleteActivity}
        />
      )}
    </div>
  );
}

// ─── Pacer row ─────────────────────────────────────────────────────────────
function PacerRow({
  ad,
  index,
  onActualChange,
  onDailyBudgetChange,
}: {
  ad: PacerAd;
  index: number;
  onActualChange: (v: string | null) => void;
  onDailyBudgetChange: (v: string | null) => void;
}) {
  const calc = useMemo(() => buildAdCalc(ad), [ad]);
  const accentColor =
    calc.status === 'on-track'
      ? COLORS.success
      : calc.status === 'overpacing'
        ? COLORS.warn
        : calc.status === 'underpacing'
          ? COLORS.error
          : 'var(--border)';
  const typeColor = calc.isLifetime ? COLORS.lifetime : COLORS.daily;

  return (
    <div className="glass-section-card relative rounded-xl px-5 py-4 mb-3.5 overflow-hidden">
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: accentColor }}
      />

      <div className="flex items-start justify-between mb-3.5 flex-wrap gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <div
              className="w-2 h-2 rounded-sm flex-shrink-0"
              style={{ background: AD_COLORS[index % AD_COLORS.length] }}
            />
            <span className="text-sm font-bold text-[var(--foreground)] truncate">
              {ad.name}
            </span>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                background: calc.isLifetime
                  ? 'rgba(167,139,250,0.18)'
                  : 'rgba(56,189,248,0.18)',
                color: typeColor,
              }}
            >
              {ad.budgetType}
            </span>
            <span className="text-[10px] text-[var(--muted-foreground)]">{ad.adStatus}</span>
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{
                background:
                  ad.budgetSource === 'base'
                    ? 'rgba(56,189,248,0.18)'
                    : 'rgba(52,211,153,0.18)',
                color: ad.budgetSource === 'base' ? COLORS.base : COLORS.added,
              }}
            >
              {ad.budgetSource === 'base' ? 'Base' : 'Added'}
            </span>
            <PacingBadge status={calc.status} />
            {calc.days > 0 && (
              <span
                className="text-[10px]"
                style={{
                  color: ad.liveDate ? COLORS.success : 'var(--muted-foreground)',
                }}
              >
                {calc.days} days{ad.liveDate ? ' (live)' : ''}
              </span>
            )}
            {calc.daysElapsed > 0 && calc.daysElapsed < calc.days && (
              <span className="text-[10px] text-[var(--muted-foreground)]">
                Day {calc.daysElapsed} of {calc.days}
              </span>
            )}
            {calc.isLate && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(252,211,77,0.18)', color: '#fcd34d' }}
              >
                {calc.daysLate}d late start
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-bold" style={{ color: typeColor }}>
            {calc.isLifetime
              ? `${fmt(calc.totalBudget)} total`
              : calc.dailyBudget != null
                ? `${fmt(calc.dailyBudget)}/day`
                : 'No daily rate set'}
          </div>
          {ad.flightEnd && (
            <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
              {ad.liveDate ? (
                <span style={{ color: COLORS.success }}>{fmtDate(ad.liveDate)}</span>
              ) : (
                <span>{fmtDate(ad.flightStart)}</span>
              )}
              <span> – {fmtDate(ad.flightEnd)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Editable inputs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-3.5">
        <Field label="Actual Spend">
          <DollarInput
            value={ad.pacerActual}
            onChange={onActualChange}
            placeholder="0.00"
          />
        </Field>
        <Field label={calc.isLifetime ? 'Budget Set' : 'Daily Budget'}>
          {calc.isLifetime ? (
            <div
              className={`${inputClass} font-bold cursor-default`}
              style={{ color: typeColor }}
            >
              {fmt(calc.totalBudget)} total
            </div>
          ) : (
            <DollarInput
              value={ad.pacerDailyBudget}
              onChange={onDailyBudgetChange}
              placeholder="0.00"
            />
          )}
        </Field>
        <Field label="Target Spend (from allocation)">
          <div className={`${inputClass} cursor-default`}>
            {calc.target != null ? fmt(calc.target) : '—'}
          </div>
        </Field>
      </div>

      {/* Metric boxes — single row */}
      <div
        className="grid grid-cols-2 md:grid-cols-5 gap-2"
        style={{ marginBottom: calc.pacingPct != null ? 12 : 0 }}
      >
        <MetricBox
          label={calc.isLifetime ? 'Gross Lifetime' : 'Gross Allocation'}
          value={fmt(Math.round((calc.projected / MARKUP) * 100) / 100)}
          sub={
            calc.isLifetime
              ? 'client budget'
              : calc.days > 0
                ? `actual: ${fmt(calc.projected)}`
                : 'Set dates'
          }
          color={typeColor}
        />
        <MetricBox
          label="Actual Spend"
          value={fmt(calc.projected)}
          sub={
            calc.isLifetime
              ? 'your spend'
              : calc.days > 0
                ? `${calc.days}d × ${fmt(num(ad.allocation) ?? 0)}`
                : 'Set dates'
          }
        />
        {calc.actual != null && calc.expectedToDate > 0 && (
          <MetricBox
            label="Pacing (vs Today)"
            value={`${calc.pacingPct?.toFixed(1)}%`}
            sub={`of ${fmt(calc.expectedToDate)} expected${
              calc.isLate ? ` · ${calc.daysLate}d late` : ''
            }`}
            color={
              calc.status === 'on-track'
                ? COLORS.success
                : calc.status === 'overpacing'
                  ? COLORS.warn
                  : COLORS.error
            }
          />
        )}
        {!calc.isLifetime && calc.recDaily != null && (
          <MetricBox
            label="Rec. Daily Budget"
            value={fmt(calc.recDaily)}
            sub="to hit target"
            color={COLORS.lifetime}
          />
        )}
        {calc.delta != null && (
          <MetricBox
            label={calc.isLifetime ? 'Lifetime Adj.' : 'Daily Adjustment'}
            value={`${calc.delta >= 0 ? '+' : ''}${fmt(calc.delta)}`}
            sub={calc.isLifetime ? 'total change' : 'per day change'}
            color={
              calc.delta > 0 ? COLORS.success : calc.delta < 0 ? COLORS.error : undefined
            }
          />
        )}
      </div>

      {calc.pacingPct != null && (
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Pacing
            </span>
            <span className="text-[10px] text-[var(--muted-foreground)]">
              {calc.pacingPct.toFixed(1)}%
            </span>
          </div>
          <PaceBar pct={calc.pacingPct} status={calc.status} />
        </div>
      )}
    </div>
  );
}

// ─── Budget Pacer panel ────────────────────────────────────────────────────
function PacerSpendTotals({
  base,
  added,
  actual,
}: {
  base: number;
  added: number;
  actual: number;
}) {
  return (
    <div className="flex flex-wrap gap-6 items-center justify-end">
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
          Total Spend
        </div>
        <div className="text-lg font-bold text-[var(--foreground)]">
          {fmt(base + added)}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
          Actual (Pacer)
        </div>
        <div className="text-lg font-bold" style={{ color: COLORS.lifetime }}>
          {fmt(actual)}
        </div>
      </div>
    </div>
  );
}

function BudgetPacerPanel({
  plan,
  filters,
  onFiltersChange,
  currentUserId,
  onChange,
  totals,
}: {
  plan: PacerPlan;
  filters: PlanFilters;
  onFiltersChange: (next: PlanFilters) => void;
  currentUserId: string | null;
  onChange: (p: PacerPlan) => void;
  totals: { base: number; added: number; actual: number };
}) {
  const updateAd = (u: PacerAd) =>
    onChange({ ...plan, ads: plan.ads.map((a) => (a.id === u.id ? u : a)) });

  const visibleAds = useMemo(
    () => applyFilters(plan.ads, filters, currentUserId),
    [plan.ads, filters, currentUserId],
  );

  if (plan.ads.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between gap-4 mb-3.5 flex-wrap">
          <h2 className="m-0 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
            <ChartBarIcon className="w-3 h-3" />
            Spend Pacing
          </h2>
          <PacerSpendTotals
            base={totals.base}
            added={totals.added}
            actual={totals.actual}
          />
        </div>
        <div className="glass-section-card rounded-xl px-6 py-12 text-center">
          <ClipboardDocumentListIcon className="w-10 h-10 mx-auto mb-3 text-[var(--muted-foreground)]" />
          <div className="text-sm text-[var(--foreground)] font-medium mb-1">
            No ads in your plan yet.
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">
            Add ads in the Ad Planner tab and they'll appear here automatically.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-3.5 flex-wrap">
        <h2 className="m-0 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
          <ChartBarIcon className="w-3 h-3" />
          {`Spend Pacing (${visibleAds.length}${
            visibleAds.length !== plan.ads.length ? ` of ${plan.ads.length}` : ''
          } ad${plan.ads.length !== 1 ? 's' : ''})`}
        </h2>
        <PacerSpendTotals
          base={totals.base}
          added={totals.added}
          actual={totals.actual}
        />
      </div>
      <FilterStatus
        filters={filters}
        onClear={() => onFiltersChange(EMPTY_FILTERS)}
        filteredCount={visibleAds.length}
        totalCount={plan.ads.length}
      />
      <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3.5 py-2.5 mb-4 text-xs text-[var(--muted-foreground)]">
        Budgets, dates, and targets are pulled from your Ad Planner. Only{' '}
        <span style={{ color: COLORS.daily }}>Actual Spend</span> is editable here —
        update it weekly to track pacing.
      </div>
      {visibleAds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-10 px-6 text-center text-sm text-[var(--muted-foreground)]">
          No ads match the current filters.
        </div>
      ) : (
        visibleAds.map((ad) => (
          <PacerRow
            key={`${ad.id}-${ad.budgetType}`}
            ad={ad}
            index={plan.ads.findIndex((a) => a.id === ad.id)}
            onActualChange={(v) => updateAd({ ...ad, pacerActual: v })}
            onDailyBudgetChange={(v) => updateAd({ ...ad, pacerDailyBudget: v })}
          />
        ))
      )}
    </div>
  );
}

// ─── Summary panel (top-level Summary tab) ─────────────────────────────────
function SummaryPanel({ plan }: { plan: PacerPlan }) {
  const calcs = useMemo(() => plan.ads.map(buildAdCalc), [plan]);
  const totalProjected = calcs.reduce((s, c) => s + c.projected, 0);
  const totalActual = calcs.reduce((s, c) => s + (c.actual ?? 0), 0);
  const totalTarget = calcs.reduce((s, c) => s + (c.target ?? 0), 0);
  const baseGoal = num(plan.baseBudgetGoal);
  const addedGoal = num(plan.addedBudgetGoal);
  const combinedGoal =
    baseGoal != null || addedGoal != null ? (baseGoal ?? 0) + (addedGoal ?? 0) : null;

  if (plan.ads.length === 0) {
    return (
      <div className="glass-section-card rounded-xl px-6 py-12 text-center">
        <p className="text-sm text-[var(--foreground)] font-medium mb-1">No ads yet</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Add at least one ad in the Budgeting tab to see a summary.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-section-card rounded-xl px-5 py-4">
      <SectionLabel icon={<TableCellsIcon className="w-3 h-3" />} text="Summary Table" />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {[
                'Ad Name',
                'Type',
                'Source',
                'Date Range',
                'Days',
                'Budget',
                'Projected',
                'Actual',
                'Target',
                'Rec. Daily',
                'Δ Budget',
              ].map((h) => (
                <th
                  key={h}
                  className="px-2.5 py-2 text-left text-[9px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calcs.map((c, i) => (
              <tr key={c.ad.id} className="border-b border-[var(--border)]">
                <td className="px-2.5 py-2.5 text-[var(--foreground)] max-w-[160px] truncate">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-sm mr-1.5 align-middle"
                    style={{ background: AD_COLORS[i % AD_COLORS.length] }}
                  />
                  {c.ad.name}
                </td>
                <td className="px-2.5 py-2.5">
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{
                      background: c.isLifetime
                        ? 'rgba(167,139,250,0.18)'
                        : 'rgba(56,189,248,0.18)',
                      color: c.isLifetime ? COLORS.lifetime : COLORS.daily,
                    }}
                  >
                    {c.ad.budgetType}
                  </span>
                </td>
                <td className="px-2.5 py-2.5">
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{
                      background:
                        c.ad.budgetSource === 'base'
                          ? 'rgba(56,189,248,0.18)'
                          : 'rgba(52,211,153,0.18)',
                      color: c.ad.budgetSource === 'base' ? COLORS.base : COLORS.added,
                    }}
                  >
                    {c.ad.budgetSource === 'base' ? 'Base' : 'Added'}
                  </span>
                </td>
                <td className="px-2.5 py-2.5 text-[var(--muted-foreground)] whitespace-nowrap">
                  {c.ad.flightStart && c.ad.flightEnd
                    ? `${c.ad.flightStart} → ${c.ad.flightEnd}`
                    : '—'}
                </td>
                <td className="px-2.5 py-2.5 text-[var(--muted-foreground)]">
                  {c.days > 0 ? c.days : '—'}
                </td>
                <td
                  className="px-2.5 py-2.5"
                  style={{ color: c.isLifetime ? COLORS.lifetime : COLORS.daily }}
                >
                  {fmt(c.totalBudget)}
                  <span className="ml-1 text-[9px] text-[var(--muted-foreground)]">
                    {c.isLifetime ? 'total' : '/day'}
                  </span>
                </td>
                <td className="px-2.5 py-2.5 text-[var(--foreground)]">
                  {fmt(c.projected)}
                </td>
                <td
                  className="px-2.5 py-2.5"
                  style={{
                    color: c.actual != null ? COLORS.lifetime : 'var(--muted-foreground)',
                    opacity: c.actual != null ? 1 : 0.6,
                  }}
                >
                  {c.actual != null ? fmt(c.actual) : '—'}
                </td>
                <td
                  className="px-2.5 py-2.5"
                  style={{
                    color: c.target != null ? 'var(--foreground)' : 'var(--muted-foreground)',
                    opacity: c.target != null ? 1 : 0.6,
                  }}
                >
                  {c.target != null ? fmt(c.target) : '—'}
                </td>
                <td
                  className="px-2.5 py-2.5"
                  style={{
                    color:
                      c.recDaily != null ? COLORS.success : 'var(--muted-foreground)',
                    opacity: c.recDaily != null ? 1 : 0.6,
                  }}
                >
                  {c.isLifetime ? (
                    <span className="text-[var(--muted-foreground)]">n/a</span>
                  ) : c.recDaily != null ? (
                    fmt(c.recDaily)
                  ) : (
                    '—'
                  )}
                </td>
                <td
                  className="px-2.5 py-2.5 font-bold"
                  style={{
                    color:
                      c.delta == null
                        ? 'var(--muted-foreground)'
                        : c.delta > 0
                          ? COLORS.success
                          : c.delta < 0
                            ? COLORS.error
                            : 'var(--foreground)',
                    opacity: c.delta == null ? 0.6 : 1,
                  }}
                >
                  {c.delta != null ? `${c.delta >= 0 ? '+' : ''}${fmt(c.delta)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--border)]">
              <td
                colSpan={5}
                className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]"
              >
                Totals
              </td>
              <td className="px-2.5 py-2.5 text-[9px] text-[var(--muted-foreground)]">
                —
              </td>
              <td
                className="px-2.5 py-2.5 font-bold"
                style={{ color: COLORS.daily }}
              >
                {fmt(totalProjected)}
              </td>
              <td
                className="px-2.5 py-2.5 font-bold"
                style={{ color: COLORS.lifetime }}
              >
                {totalActual > 0 ? fmt(totalActual) : '—'}
              </td>
              <td className="px-2.5 py-2.5 font-bold text-[var(--foreground)]">
                {totalTarget > 0 ? fmt(totalTarget) : '—'}
              </td>
              <td colSpan={2} />
            </tr>
            {combinedGoal != null && (
              <tr className="border-t border-[var(--border)] bg-[var(--muted)]">
                <td
                  colSpan={5}
                  className="px-2.5 py-2.5 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]"
                >
                  Combined Budget Goal
                </td>
                <td colSpan={6} className="px-2.5 py-2.5">
                  <span className="text-[var(--foreground)] font-bold">
                    {fmt(Math.round(combinedGoal * MARKUP * 100) / 100)}
                  </span>
                  <span className="text-[var(--muted-foreground)]"> actual / </span>
                  <span style={{ color: COLORS.daily }} className="font-bold">
                    {fmt(combinedGoal)}
                  </span>
                  <span className="text-[var(--muted-foreground)]"> gross client</span>
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Folder-style inner tabs ───────────────────────────────────────────────
function FolderTabs({
  active,
  onChange,
}: {
  active: InnerTab;
  onChange: (t: InnerTab) => void;
}) {
  const tabs: { key: InnerTab; label: string; icon: ReactNode }[] = [
    {
      key: 'planner',
      label: 'Ad Planner',
      icon: <ClipboardDocumentListIcon className="w-4 h-4" />,
    },
    { key: 'pacer', label: 'Budget Pacer', icon: <ChartBarIcon className="w-4 h-4" /> },
  ];
  return (
    <div className="flex gap-1 border-b border-[var(--border)] mb-6">
      {tabs.map((t) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-all"
            style={{
              background: isActive ? 'var(--card)' : 'transparent',
              color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
              borderTop: isActive ? '1px solid var(--border)' : '1px solid transparent',
              borderLeft: isActive ? '1px solid var(--border)' : '1px solid transparent',
              borderRight: isActive ? '1px solid var(--border)' : '1px solid transparent',
              borderBottom: isActive
                ? `2px solid var(--primary)`
                : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Admin Overview ────────────────────────────────────────────────────────
interface OverviewAccount {
  accountKey: string;
  dealer: string;
  baseBudgetGoal: string | null;
  addedBudgetGoal: string | null;
  ads: PacerAd[];
}

function OverviewAccountRow({
  account,
  expanded,
  onToggle,
  onOpenAccount,
  filters,
  currentUserId,
}: {
  account: OverviewAccount;
  expanded: boolean;
  onToggle: () => void;
  onOpenAccount: () => void;
  filters: PlanFilters;
  currentUserId: string | null;
}) {
  const visibleAds = useMemo(
    () => applyFilters(account.ads, filters, currentUserId),
    [account.ads, filters, currentUserId],
  );

  const baseTotal = account.ads
    .filter((a) => a.budgetSource === 'base')
    .reduce((s, a) => s + (num(a.allocation) ?? 0), 0);
  const addedTotal = account.ads
    .filter((a) => a.budgetSource === 'added')
    .reduce((s, a) => s + (num(a.allocation) ?? 0), 0);

  return (
    <div className="glass-section-card rounded-xl mb-2.5 overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 flex-wrap min-w-0 flex-1">
          {expanded ? (
            <ChevronDownIcon className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" />
          ) : (
            <ChevronRightIcon className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" />
          )}
          <span className="text-sm font-bold text-[var(--foreground)] truncate min-w-0 max-w-[260px]">
            {account.dealer}
          </span>
          <span className="text-[10px] text-[var(--muted-foreground)] bg-[var(--muted)] px-2 py-0.5 rounded-full whitespace-nowrap">
            {account.ads.length} ad{account.ads.length !== 1 ? 's' : ''}
          </span>
          {account.ads.length > 0 && <StatusBattery ads={account.ads} />}
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          {baseTotal > 0 && (
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-wider text-[var(--muted-foreground)]">
                Base
              </div>
              <div className="text-sm font-bold" style={{ color: COLORS.base }}>
                {fmt(baseTotal)}
              </div>
            </div>
          )}
          {addedTotal > 0 && (
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-wider text-[var(--muted-foreground)]">
                Added
              </div>
              <div className="text-sm font-bold" style={{ color: COLORS.added }}>
                {fmt(addedTotal)}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAccount();
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            title="Open account"
          >
            Open
          </button>
        </div>
      </div>

      {/* Drill-down: compact ad rows */}
      {expanded && (
        <div className="border-t border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3">
          {account.ads.length === 0 ? (
            <div className="text-xs text-[var(--muted-foreground)] py-3 text-center">
              No ads in this period.
            </div>
          ) : visibleAds.length === 0 ? (
            <div className="text-xs text-[var(--muted-foreground)] py-3 text-center">
              No ads match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {[
                      'Ad',
                      'Status',
                      'Source',
                      'Type',
                      'Allocation',
                      'Flight',
                      'Action',
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleAds.map((ad, i) => (
                    <tr key={ad.id} className="border-b border-[var(--border)]">
                      <td className="px-2 py-2 text-[var(--foreground)] max-w-[200px] truncate">
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-sm mr-1.5 align-middle"
                          style={{ background: AD_COLORS[i % AD_COLORS.length] }}
                        />
                        {ad.name}
                      </td>
                      <td className="px-2 py-2">
                        <AdStatusPill status={ad.adStatus} />
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{
                            background:
                              ad.budgetSource === 'base'
                                ? 'rgba(56,189,248,0.18)'
                                : 'rgba(52,211,153,0.18)',
                            color:
                              ad.budgetSource === 'base' ? COLORS.base : COLORS.added,
                          }}
                        >
                          {ad.budgetSource === 'base' ? 'Base' : 'Added'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-[var(--muted-foreground)]">
                        {ad.budgetType}
                      </td>
                      <td className="px-2 py-2 text-[var(--foreground)]">
                        {num(ad.allocation) != null ? fmt(num(ad.allocation)!) : '—'}
                      </td>
                      <td className="px-2 py-2 text-[var(--muted-foreground)] whitespace-nowrap">
                        {ad.flightStart && ad.flightEnd
                          ? `${fmtDate(ad.flightStart)} – ${fmtDate(ad.flightEnd)}`
                          : '—'}
                      </td>
                      <td className="px-2 py-2 text-[var(--muted-foreground)]">
                        {ad.actionNeeded || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OverviewView({
  period,
  filters,
  currentUserId,
  onOpenAccount,
}: {
  period: string;
  filters: PlanFilters;
  currentUserId: string | null;
  onOpenAccount: (accountKey: string) => void;
}) {
  const [accounts, setAccounts] = useState<OverviewAccount[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setAccounts(null);
    setLoadError(null);
    fetch(`/api/meta-ads-pacer/overview?period=${period}`)
      .then(async (r) => {
        if (!r.ok) {
          const text = await r.text().catch(() => '');
          throw new Error(`HTTP ${r.status} ${text.slice(0, 200)}`);
        }
        return r.json() as Promise<{ accounts: OverviewAccount[] }>;
      })
      .then((data) => {
        setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[meta-ads-pacer] overview load failed', err);
        setLoadError(err instanceof Error ? err.message : 'Failed to load overview');
      });
  }, [period]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loadError) {
    return (
      <div className="glass-section-card rounded-xl text-center py-16 px-6">
        <ExclamationTriangleIcon className="w-8 h-8 mx-auto mb-3 text-red-400" />
        <p className="text-sm text-[var(--foreground)] font-medium mb-1">
          Could not load overview.
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">{loadError}</p>
      </div>
    );
  }

  if (accounts == null) {
    return (
      <div className="text-center py-16 text-[var(--muted-foreground)] text-sm">
        Loading accounts…
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="glass-section-card rounded-xl text-center py-16 px-6">
        <p className="text-sm text-[var(--foreground)] font-medium mb-1">
          No accounts available.
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          You don&apos;t have access to any accounts.
        </p>
      </div>
    );
  }

  // Sort: accounts with ads first, then by dealer name (already alphabetical)
  const sorted = [...accounts].sort((a, b) => {
    if (a.ads.length === 0 && b.ads.length > 0) return 1;
    if (a.ads.length > 0 && b.ads.length === 0) return -1;
    return 0;
  });

  return (
    <div className="space-y-2.5">
      <SectionLabel
        icon={<ClipboardDocumentListIcon className="w-3 h-3" />}
        text={`All Accounts · ${fmtPeriodLong(period)}`}
      />
      {sorted.map((acct) => (
        <OverviewAccountRow
          key={acct.accountKey}
          account={acct}
          expanded={expanded.has(acct.accountKey)}
          onToggle={() => toggleExpand(acct.accountKey)}
          onOpenAccount={() => onOpenAccount(acct.accountKey)}
          filters={filters}
          currentUserId={currentUserId}
        />
      ))}
    </div>
  );
}

// ─── Main tool component ───────────────────────────────────────────────────
function MetaAdsPacerTool() {
  const { accountKey, accounts, setAccount } = useAccount();
  const { data: session } = useSession();
  const { markClean } = useUnsavedChanges();
  const currentUserId = session?.user?.id ?? null;

  const activeKey = accountKey;
  const activeAccount = activeKey ? accounts[activeKey] : null;

  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [period, setPeriod] = useState<string>(currentPeriod());
  const [periodSummaries, setPeriodSummaries] = useState<PeriodSummary[]>([]);
  const [plan, setPlan] = useState<PacerPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [topTab, setTopTab] = useState<TopTab>('summary');
  const [innerTab, setInnerTab] = useState<InnerTab>('planner');
  const [filters, setFilters] = useState<PlanFilters>(EMPTY_FILTERS);
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(false);

  // ── Fetch directory of users (once) ──
  useEffect(() => {
    fetch('/api/users')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setUsers(data);
      })
      .catch(() => {
        // tolerate failure — pickers will just show empty list
      });
  }, []);

  // ── Load plan whenever active account or period changes ──
  useEffect(() => {
    if (!activeKey) {
      setPlan(null);
      setLoadError(null);
      setLoaded(true);
      setPeriodSummaries([]);
      setFilters(EMPTY_FILTERS);
      return;
    }
    setLoaded(false);
    setLoadError(null);
    setFilters(EMPTY_FILTERS);

    Promise.all([
      fetch(`/api/meta-ads-pacer/${activeKey}?period=${period}`).then(async (r) => {
        if (!r.ok) {
          const text = await r.text().catch(() => '');
          throw new Error(`HTTP ${r.status} ${text.slice(0, 200)}`);
        }
        return r.json() as Promise<PacerPlan>;
      }),
      fetch(`/api/meta-ads-pacer/${activeKey}/periods`)
        .then((r) => (r.ok ? r.json() : { periods: [] }))
        .catch(() => ({ periods: [] })) as Promise<{ periods: PeriodSummary[] }>,
    ])
      .then(([planData, periodsData]) => {
        setPlan({
          accountKey: planData.accountKey ?? activeKey,
          period: planData.period ?? period,
          baseBudgetGoal: planData.baseBudgetGoal ?? null,
          addedBudgetGoal: planData.addedBudgetGoal ?? null,
          ads: Array.isArray(planData.ads) ? planData.ads : [],
        });
        setPeriodSummaries(
          Array.isArray(periodsData?.periods) ? periodsData.periods : [],
        );
        setLoaded(true);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[meta-ads-pacer] failed to load plan', err);
        setLoadError(err instanceof Error ? err.message : 'Failed to load plan');
        setLoaded(true);
      });
  }, [activeKey, period]);

  // ── Debounced save (PUT) ──
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');
  // Reset save dedupe when account/period changes so the first edit triggers a save
  useEffect(() => {
    lastSavedRef.current = '';
  }, [activeKey, period]);

  useEffect(() => {
    if (!loaded || !activeKey || !plan) return;
    const serialized = JSON.stringify({
      baseBudgetGoal: plan.baseBudgetGoal,
      addedBudgetGoal: plan.addedBudgetGoal,
      ads: plan.ads.map((a, i) => ({ ...a, position: i, period })),
    });
    if (serialized === lastSavedRef.current) return;

    setSaveStatus('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/meta-ads-pacer/${activeKey}?period=${period}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: serialized,
          },
        );
        if (!res.ok) throw new Error('save failed');
        const updated = (await res.json()) as PacerPlan;
        setPlan({
          accountKey: updated.accountKey ?? activeKey,
          period: updated.period ?? period,
          baseBudgetGoal: updated.baseBudgetGoal ?? null,
          addedBudgetGoal: updated.addedBudgetGoal ?? null,
          ads: Array.isArray(updated.ads) ? updated.ads : [],
        });
        lastSavedRef.current = JSON.stringify({
          baseBudgetGoal: updated.baseBudgetGoal,
          addedBudgetGoal: updated.addedBudgetGoal,
          ads: (updated.ads ?? []).map((a, i) => ({ ...a, position: i, period })),
        });
        setSaveStatus('saved');
        markClean();
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch {
        setSaveStatus('error');
      }
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [plan, activeKey, loaded, period, markClean]);

  // ── Copy from another period ──
  const handleCopyFrom = async (fromPeriod: string) => {
    if (!activeKey || !fromPeriod || fromPeriod === period) return;
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/meta-ads-pacer/${activeKey}/copy-from`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromPeriod, to: period }),
      });
      if (!res.ok) throw new Error('copy failed');
      const updated = (await res.json()) as PacerPlan;
      setPlan({
        accountKey: updated.accountKey ?? activeKey,
        period: updated.period ?? period,
        baseBudgetGoal: updated.baseBudgetGoal ?? null,
        addedBudgetGoal: updated.addedBudgetGoal ?? null,
        ads: Array.isArray(updated.ads) ? updated.ads : [],
      });
      lastSavedRef.current = JSON.stringify({
        baseBudgetGoal: updated.baseBudgetGoal,
        addedBudgetGoal: updated.addedBudgetGoal,
        ads: (updated.ads ?? []).map((a, i) => ({ ...a, position: i, period })),
      });
      // Refresh periods list (target now has ads)
      fetch(`/api/meta-ads-pacer/${activeKey}/periods`)
        .then((r) => (r.ok ? r.json() : { periods: [] }))
        .then((data: { periods: PeriodSummary[] }) =>
          setPeriodSummaries(Array.isArray(data?.periods) ? data.periods : []),
        )
        .catch(() => {});
      setSaveStatus('saved');
      markClean();
      setTimeout(() => setSaveStatus('idle'), 1500);
    } catch {
      setSaveStatus('error');
    }
  };

  // ── Activity log handlers (per-event endpoints) ──
  const onAddActivity = async (adId: string, text: string, file: File | null) => {
    if (!activeKey) return;
    let res: Response;
    if (file) {
      const fd = new FormData();
      fd.append('text', text);
      fd.append('file', file);
      res = await fetch(`/api/meta-ads-pacer/${activeKey}/ads/${adId}/activity`, {
        method: 'POST',
        body: fd,
      });
    } else {
      res = await fetch(`/api/meta-ads-pacer/${activeKey}/ads/${adId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    }
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(msg || `HTTP ${res.status}`);
    }
    const entry = (await res.json()) as ActivityEntry;
    setPlan((p) =>
      p
        ? {
            ...p,
            ads: p.ads.map((a) =>
              a.id === adId ? { ...a, activityLog: [...a.activityLog, entry] } : a,
            ),
          }
        : p,
    );
  };

  const onDeleteActivity = async (adId: string, entryId: string) => {
    if (!activeKey) return;
    const res = await fetch(
      `/api/meta-ads-pacer/${activeKey}/ads/${adId}/activity/${entryId}`,
      { method: 'DELETE' },
    );
    if (!res.ok) return;
    setPlan((p) =>
      p
        ? {
            ...p,
            ads: p.ads.map((a) =>
              a.id === adId
                ? { ...a, activityLog: a.activityLog.filter((x) => x.id !== entryId) }
                : a,
            ),
          }
        : p,
    );
  };

  // ── Header totals ──
  const totals = useMemo(() => {
    if (!plan) return { base: 0, added: 0, actual: 0 };
    let base = 0;
    let added = 0;
    let actual = 0;
    plan.ads.forEach((ad) => {
      const a = num(ad.allocation) ?? 0;
      if (ad.budgetSource === 'base') base += a;
      else added += a;
      actual += num(ad.pacerActual) ?? 0;
    });
    return { base, added, actual };
  }, [plan]);

  const saveColor =
    saveStatus === 'saved'
      ? COLORS.success
      : saveStatus === 'saving'
        ? COLORS.warn
        : saveStatus === 'error'
          ? COLORS.error
          : 'var(--muted-foreground)';
  const saveLabel =
    saveStatus === 'saved'
      ? 'Saved'
      : saveStatus === 'saving'
        ? 'Saving…'
        : saveStatus === 'error'
          ? 'Save failed'
          : activeKey
            ? 'Auto-save on'
            : 'Idle';

  return (
    <div className="animate-fade-in-up">
      {/* Page header */}
      <div className="page-sticky-header mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <MegaphoneIcon className="w-7 h-7 text-[var(--primary)]" />
          <div>
            <h2 className="text-2xl font-bold">Meta Ads Pacer</h2>
            <p className="text-[var(--muted-foreground)] text-sm mt-0.5">
              Plan, track & pace your Meta ad budgets
            </p>
          </div>
        </div>

        {activeKey && (
          <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
            <button
              type="button"
              onClick={() => setTopTab('summary')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                topTab === 'summary'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <TableCellsIcon className="w-3.5 h-3.5" />
              Summary
            </button>
            <button
              type="button"
              onClick={() => setTopTab('budgeting')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                topTab === 'budgeting'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
              Budgeting
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[10px]" style={{ color: saveColor }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: saveColor }} />
          {saveLabel}
        </div>
      </div>

      {/* Scope row — account name + status battery on the left; period + filters on the right */}
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1.5 min-w-0">
          {activeKey ? (
            <>
              <span className="text-2xl font-bold text-[var(--foreground)] leading-tight">
                {activeAccount?.dealer || activeKey || '—'}
              </span>
              {plan && plan.ads.length > 0 && <StatusBattery ads={plan.ads} />}
            </>
          ) : (
            <span className="text-sm text-[var(--muted-foreground)]">
              All accounts overview
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <PeriodSelector
            period={period}
            onChange={setPeriod}
            summaries={periodSummaries}
          />
          <button
            type="button"
            onClick={() => setFilterSidebarOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <FunnelIcon className="w-3.5 h-3.5" />
            Filters
            {activeFilterCount(filters) > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-[var(--primary)] text-white text-[10px] font-bold">
                {activeFilterCount(filters)}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Budget header (Total + Base/Added) — only on the Budgeting tab */}
      {activeKey && plan && topTab === 'budgeting' && (
        <div className="mb-5">
          <TotalAllocationHeader plan={plan} />
          <div className="flex gap-3.5 flex-wrap">
            <BudgetPanel
              title="Base Budget"
              source="base"
              color={COLORS.base}
              goalKey="baseBudgetGoal"
              plan={plan}
              onChange={setPlan}
            />
            <BudgetPanel
              title="Added Budget"
              source="added"
              color={COLORS.added}
              goalKey="addedBudgetGoal"
              plan={plan}
              onChange={setPlan}
            />
          </div>
        </div>
      )}

      {/* Body */}
      {!activeKey ? (
        <OverviewView
          period={period}
          filters={filters}
          currentUserId={currentUserId}
          onOpenAccount={(key) => setAccount({ mode: 'account', accountKey: key })}
        />
      ) : !loaded ? (
        <div className="text-center py-16 text-[var(--muted-foreground)] text-sm">
          Loading saved data…
        </div>
      ) : loadError ? (
        <div className="glass-section-card rounded-xl text-center py-16 px-6">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <ExclamationTriangleIcon className="w-6 h-6 text-red-400" />
          </div>
          <p className="text-[var(--foreground)] text-sm font-medium mb-1">
            Could not load this account&apos;s pacer data.
          </p>
          <p className="text-[var(--muted-foreground)] text-xs mb-1">{loadError}</p>
          <p className="text-[var(--muted-foreground)] text-xs">
            If you just deployed the new schema, restart the dev server so the Prisma
            client picks up the new models, then refresh.
          </p>
        </div>
      ) : !plan ? null : (
        <div
          className={
            topTab === 'budgeting'
              ? 'glass-section-card rounded-xl px-6 py-6'
              : ''
          }
        >
          {topTab === 'budgeting' ? (
            <>
              <FolderTabs active={innerTab} onChange={setInnerTab} />
              {innerTab === 'planner' ? (
                <AdPlannerPanel
                  plan={plan}
                  period={period}
                  users={users}
                  filters={filters}
                  onFiltersChange={setFilters}
                  currentUserId={currentUserId}
                  periodSummaries={periodSummaries}
                  onChange={setPlan}
                  onCopyFrom={handleCopyFrom}
                  onAddActivity={onAddActivity}
                  onDeleteActivity={onDeleteActivity}
                />
              ) : (
                <BudgetPacerPanel
                  plan={plan}
                  filters={filters}
                  onFiltersChange={setFilters}
                  currentUserId={currentUserId}
                  onChange={setPlan}
                  totals={totals}
                />
              )}
            </>
          ) : (
            <SummaryPanel plan={plan} />
          )}
        </div>
      )}

      {/* Filter sidebar — slides in from the right */}
      <MetaAdsPacerFilterSidebar
        open={filterSidebarOpen}
        onClose={() => setFilterSidebarOpen(false)}
        filters={filters}
        onChange={setFilters}
        users={users}
        ads={plan?.ads ?? []}
        currentUserId={currentUserId}
      />
    </div>
  );
}

export default function MetaAdsPacerPage() {
  return (
    <AdminOnly>
      <MetaAdsPacerTool />
    </AdminOnly>
  );
}
