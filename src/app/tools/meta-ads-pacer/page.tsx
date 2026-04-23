'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  MegaphoneIcon,
  PlusIcon,
  XMarkIcon,
  AdjustmentsHorizontalIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline';
import { AdminOnly } from '@/components/route-guard';
import { useAccount } from '@/contexts/account-context';

// ─── Constants ───────────────────────────────────────────────────────────────
const OBJECTIVES = [
  'Conversions',
  'Reach',
  'Traffic',
  'Leads',
  'Engagement',
  'App Installs',
  'Video Views',
] as const;

// Semantic color coding — preserved from original spec
const COLORS = {
  daily: '#38bdf8',
  lifetime: '#a78bfa',
  success: '#22c55e',
  warn: '#f59e0b',
  error: '#ef4444',
  dailyTint: 'rgba(56, 189, 248, 0.18)',
  lifetimeTint: 'rgba(167, 139, 250, 0.18)',
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

const storageKeyFor = (accountKey: string) => `loomi-meta-pacer:${accountKey}`;

// ─── Types ───────────────────────────────────────────────────────────────────
type BudgetType = 'daily' | 'lifetime';
type PacingStatus = 'on-track' | 'overpacing' | 'underpacing' | 'no-data';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Ad {
  id: number;
  name: string;
  currentBudget: number;
  budgetType: BudgetType;
  objective: string;
  start: string;
  end: string;
  actualSpend: string;
  targetSpend: string;
}

interface PacerData {
  accountBudget: string;
  ads: Ad[];
  nextAdId: number;
}

interface AdCalc extends Ad {
  isLifetime: boolean;
  days: number;
  projected: number;
  impliedDaily: number | null;
  actual: number | null;
  target: number | null;
  recDaily: number | null;
  delta: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (val: number | string): string => {
  const n = Number(val);
  if (isNaN(n)) return '$0.00';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function calcDays(start: string, end: string): number {
  if (!start || !end) return 0;
  return Math.max(
    0,
    Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
  );
}

function calcDaysElapsed(start: string, end: string): number {
  if (!start || !end) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const s = new Date(start);
  const e = new Date(end);
  if (today < s) return 0;
  if (today > e) return calcDays(start, end);
  return Math.ceil((today.getTime() - s.getTime()) / 86400000) + 1;
}

function makeAd(id: number): Ad {
  return {
    id,
    name: `New Ad ${id}`,
    currentBudget: 0,
    budgetType: 'daily',
    objective: 'Conversions',
    start: '',
    end: '',
    actualSpend: '',
    targetSpend: '',
  };
}

function emptyPacerData(): PacerData {
  return { accountBudget: '', ads: [makeAd(1)], nextAdId: 2 };
}

// ─── Shared input styles (theme-aware chrome) ────────────────────────────────
const inputStyle: CSSProperties = {
  background: 'var(--input)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--foreground)',
  fontSize: 13,
  padding: '7px 10px 7px 24px',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
};
const inputStylePlain: CSSProperties = { ...inputStyle, paddingLeft: 10 };

const labelStyle: CSSProperties = {
  display: 'block',
  color: 'var(--muted-foreground)',
  fontSize: 9,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: 4,
  opacity: 0.9,
};

const panelStyle: CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '20px 22px',
};

// ─── Micro components ────────────────────────────────────────────────────────
function PaceBar({ pct, status }: { pct: number; status: PacingStatus }) {
  const color =
    status === 'on-track'
      ? COLORS.success
      : status === 'overpacing'
        ? COLORS.warn
        : COLORS.error;
  return (
    <div
      style={{
        height: 7,
        background: 'var(--muted)',
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${Math.min(pct, 100)}%`,
          background: color,
          borderRadius: 999,
          transition: 'width 0.5s',
          boxShadow: `0 0 8px ${color}80`,
        }}
      />
    </div>
  );
}

function Badge({ status }: { status: PacingStatus }) {
  const map: Record<PacingStatus, [string, string, string]> = {
    'on-track': ['rgba(34, 197, 94, 0.18)', '#4ade80', 'On Track'],
    overpacing: ['rgba(245, 158, 11, 0.2)', '#fbbf24', 'Overpacing'],
    underpacing: ['rgba(239, 68, 68, 0.18)', '#f87171', 'Underpacing'],
    'no-data': ['var(--muted)', 'var(--muted-foreground)', 'No Data'],
  };
  const [bg, color, label] = map[status];
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        padding: '3px 9px',
        borderRadius: 4,
        background: bg,
        color,
      }}
    >
      {label}
    </span>
  );
}

function MBox({
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
    <div
      style={{
        background: 'var(--muted)',
        borderRadius: 8,
        padding: '10px 13px',
        border: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          color: 'var(--muted-foreground)',
          fontSize: 9,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginBottom: 3,
          opacity: 0.9,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: color || 'var(--foreground)',
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            color: 'var(--muted-foreground)',
            fontSize: 10,
            marginTop: 2,
            opacity: 0.75,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function DollarInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  const displayValue =
    value === 0 || value === '0' || value === '' || value == null ? '' : value;
  return (
    <div style={{ position: 'relative' }}>
      <span
        style={{
          position: 'absolute',
          left: 9,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--muted-foreground)',
          fontSize: 12,
          pointerEvents: 'none',
          opacity: 0.85,
        }}
      >
        $
      </span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={displayValue}
        onChange={onChange}
        placeholder={placeholder || '0.00'}
        style={inputStyle}
      />
    </div>
  );
}

function SLabel({ text }: { text: string }) {
  return (
    <h2
      style={{
        margin: '0 0 14px',
        fontSize: 11,
        color: 'var(--muted-foreground)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        fontWeight: 700,
        opacity: 0.9,
      }}
    >
      {text}
    </h2>
  );
}

function BudgetToggle({
  value,
  onChange,
}: {
  value: BudgetType;
  onChange: (v: BudgetType) => void;
}) {
  const types: BudgetType[] = ['daily', 'lifetime'];
  return (
    <div
      style={{
        display: 'inline-flex',
        background: 'var(--input)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {types.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          style={{
            padding: '5px 12px',
            border: 'none',
            cursor: 'pointer',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            transition: 'all 0.15s',
            background:
              value === t
                ? t === 'daily'
                  ? COLORS.dailyTint
                  : COLORS.lifetimeTint
                : 'transparent',
            color:
              value === t
                ? t === 'daily'
                  ? COLORS.daily
                  : COLORS.lifetime
                : 'var(--muted-foreground)',
            borderRight: t === 'daily' ? '1px solid var(--border)' : 'none',
          }}
        >
          {t === 'daily' ? 'Daily' : 'Lifetime'}
        </button>
      ))}
    </div>
  );
}

// ─── Ad Row ──────────────────────────────────────────────────────────────────
function AdRow({
  ad,
  onUpdate,
  onRemove,
}: {
  ad: Ad;
  onUpdate: (ad: Ad) => void;
  onRemove: (id: number) => void;
}) {
  const isLifetime = ad.budgetType === 'lifetime';
  const days = calcDays(ad.start, ad.end);
  const daysElapsed = calcDaysElapsed(ad.start, ad.end);
  const projected = isLifetime ? ad.currentBudget : ad.currentBudget * Math.max(days, 1);
  const impliedDaily = isLifetime && days > 0 ? ad.currentBudget / days : null;
  const actual =
    ad.actualSpend !== '' && ad.actualSpend != null ? parseFloat(ad.actualSpend) : null;
  const target =
    ad.targetSpend !== '' && ad.targetSpend != null ? parseFloat(ad.targetSpend) : null;
  const recDaily = !isLifetime && target != null && days > 0 ? target / days : null;
  const budgetDelta = isLifetime
    ? target != null
      ? target - ad.currentBudget
      : null
    : recDaily != null
      ? recDaily - ad.currentBudget
      : null;
  const expectedToDate = isLifetime
    ? days > 0
      ? (ad.currentBudget / days) * daysElapsed
      : 0
    : ad.currentBudget * daysElapsed;

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

  const accentColor =
    status === 'on-track'
      ? COLORS.success
      : status === 'overpacing'
        ? COLORS.warn
        : status === 'underpacing'
          ? COLORS.error
          : 'var(--border)';
  const typeColor = isLifetime ? COLORS.lifetime : COLORS.daily;

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '18px 22px',
        marginBottom: 14,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: accentColor,
        }}
      />

      {/* Name row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div style={{ flex: 1 }}>
          <input
            value={ad.name}
            onChange={(e) => onUpdate({ ...ad, name: e.target.value })}
            placeholder="Ad Name..."
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--foreground)',
              fontSize: 15,
              fontWeight: 700,
              width: '100%',
            }}
          />
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 5,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <select
              value={ad.objective || OBJECTIVES[0]}
              onChange={(e) => onUpdate({ ...ad, objective: e.target.value })}
              style={{
                background: 'var(--muted)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--muted-foreground)',
                fontSize: 10,
                padding: '2px 6px',
              }}
            >
              {OBJECTIVES.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <Badge status={status} />
            {days > 0 && (
              <span style={{ color: 'var(--muted-foreground)', fontSize: 10, opacity: 0.8 }}>
                {days} day{days !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onRemove(ad.id)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--muted-foreground)',
            cursor: 'pointer',
            padding: '0 4px',
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.error)}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
          aria-label="Remove ad"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Budget type */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ ...labelStyle, marginBottom: 6 }}>Budget Type</label>
        <BudgetToggle
          value={ad.budgetType || 'daily'}
          onChange={(v) => onUpdate({ ...ad, budgetType: v })}
        />
      </div>

      {/* Dates */}
      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}
      >
        <div>
          <label style={labelStyle}>Start Date</label>
          <input
            type="date"
            value={ad.start || ''}
            onChange={(e) => onUpdate({ ...ad, start: e.target.value })}
            style={inputStylePlain}
          />
        </div>
        <div>
          <label style={labelStyle}>End Date</label>
          <input
            type="date"
            value={ad.end || ''}
            onChange={(e) => onUpdate({ ...ad, end: e.target.value })}
            style={inputStylePlain}
          />
        </div>
      </div>

      {/* Budget inputs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div>
          <label style={{ ...labelStyle, color: typeColor, opacity: 1 }}>
            {isLifetime ? 'Lifetime Budget' : 'Daily Budget'}
          </label>
          <DollarInput
            value={ad.currentBudget}
            onChange={(e) =>
              onUpdate({ ...ad, currentBudget: parseFloat(e.target.value) || 0 })
            }
            placeholder="0.00"
          />
        </div>
        <div>
          <label style={labelStyle}>Actual Spend</label>
          <DollarInput
            value={ad.actualSpend ?? ''}
            onChange={(e) => onUpdate({ ...ad, actualSpend: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div>
          <label style={labelStyle}>
            {isLifetime ? 'Target Total Spend' : 'Target Spend'}
          </label>
          <DollarInput
            value={ad.targetSpend ?? ''}
            onChange={(e) => onUpdate({ ...ad, targetSpend: e.target.value })}
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Metric boxes */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))',
          gap: 8,
          marginBottom: pacingPct != null ? 12 : 0,
        }}
      >
        <MBox
          label={isLifetime ? 'Lifetime Budget' : 'Projected Spend'}
          value={fmt(projected)}
          sub={
            isLifetime
              ? impliedDaily != null
                ? `~${fmt(impliedDaily)}/day`
                : 'Set dates'
              : days > 0
                ? `${days}d × ${fmt(ad.currentBudget)}`
                : 'Set dates'
          }
          color={typeColor}
        />
        {actual != null && expectedToDate > 0 && (
          <MBox
            label="Pacing (vs Today)"
            value={`${pacingPct?.toFixed(1)}%`}
            sub={`of ${fmt(expectedToDate)} exp. today`}
            color={
              status === 'on-track'
                ? COLORS.success
                : status === 'overpacing'
                  ? COLORS.warn
                  : COLORS.error
            }
          />
        )}
        {!isLifetime && recDaily != null && (
          <MBox
            label="Rec. Daily Budget"
            value={fmt(recDaily)}
            sub="to hit target"
            color={COLORS.lifetime}
          />
        )}
        {isLifetime && impliedDaily != null && target != null && (
          <MBox
            label="Rec. Lifetime Bdgt"
            value={fmt(target)}
            sub="adjusted total"
            color={COLORS.lifetime}
          />
        )}
        {budgetDelta != null && (
          <MBox
            label={isLifetime ? 'Lifetime Adjustment' : 'Daily Adjustment'}
            value={`${budgetDelta >= 0 ? '+' : ''}${fmt(budgetDelta)}`}
            sub={isLifetime ? 'total change' : 'per day change'}
            color={
              budgetDelta > 0
                ? COLORS.success
                : budgetDelta < 0
                  ? COLORS.error
                  : 'var(--muted-foreground)'
            }
          />
        )}
      </div>

      {pacingPct != null && (
        <div>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}
          >
            <span
              style={{
                color: 'var(--muted-foreground)',
                fontSize: 9,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                opacity: 0.85,
              }}
            >
              Pacing
            </span>
            <span style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
              {pacingPct.toFixed(1)}%
            </span>
          </div>
          <PaceBar pct={pacingPct} status={status} />
        </div>
      )}
    </div>
  );
}

// ─── Shared computation ──────────────────────────────────────────────────────
interface PacerView {
  adCalcs: AdCalc[];
  totalProjected: number;
  totalActual: number;
  totalTarget: number;
  totalAllocated: number;
  acctBudget: number | null;
  remaining: number | null;
  allocPct: number | null;
  allocStatus: 'over' | 'perfect' | 'under' | null;
  allocColor: string;
}

function buildPacerView(data: PacerData): PacerView {
  const { ads, accountBudget } = data;
  const adCalcs: AdCalc[] = ads.map((ad) => {
    const isLifetime = ad.budgetType === 'lifetime';
    const days = calcDays(ad.start, ad.end);
    const projected = isLifetime
      ? ad.currentBudget
      : ad.currentBudget * Math.max(days, 1);
    const impliedDaily = isLifetime && days > 0 ? ad.currentBudget / days : null;
    const actual =
      ad.actualSpend !== '' && ad.actualSpend != null ? parseFloat(ad.actualSpend) : null;
    const target =
      ad.targetSpend !== '' && ad.targetSpend != null ? parseFloat(ad.targetSpend) : null;
    const recDaily = !isLifetime && target != null && days > 0 ? target / days : null;
    const delta = isLifetime
      ? target != null
        ? target - ad.currentBudget
        : null
      : recDaily != null
        ? recDaily - ad.currentBudget
        : null;
    return {
      ...ad,
      isLifetime,
      days,
      projected,
      impliedDaily,
      actual,
      target,
      recDaily,
      delta,
    };
  });

  const totalProjected = adCalcs.reduce((s, a) => s + a.projected, 0);
  const totalActual = adCalcs.reduce((s, a) => s + (a.actual ?? 0), 0);
  const totalTarget = adCalcs.reduce((s, a) => s + (a.target ?? 0), 0);
  const totalAllocated = totalProjected;
  const acctBudget = accountBudget !== '' ? parseFloat(accountBudget) : null;
  const remaining = acctBudget != null ? acctBudget - totalAllocated : null;
  const allocPct =
    acctBudget != null && acctBudget > 0 ? (totalAllocated / acctBudget) * 100 : null;
  const allocStatus: 'over' | 'perfect' | 'under' | null =
    allocPct == null ? null : allocPct > 105 ? 'over' : allocPct >= 95 ? 'perfect' : 'under';
  const allocColor =
    allocStatus === 'over'
      ? COLORS.error
      : allocStatus === 'perfect'
        ? COLORS.success
        : COLORS.warn;

  return {
    adCalcs,
    totalProjected,
    totalActual,
    totalTarget,
    totalAllocated,
    acctBudget,
    remaining,
    allocPct,
    allocStatus,
    allocColor,
  };
}

// ─── Budgeting Panel (Account Budget Goal + Active Ads) ─────────────────────
function BudgetingPanel({
  data,
  onChange,
}: {
  data: PacerData;
  onChange: (d: PacerData) => void;
}) {
  const { ads, accountBudget } = data;

  const updateAd = (u: Ad) =>
    onChange({ ...data, ads: ads.map((a) => (a.id === u.id ? u : a)) });
  const removeAd = (id: number) =>
    onChange({ ...data, ads: ads.filter((a) => a.id !== id) });
  const addAd = () => {
    const id = data.nextAdId;
    onChange({ ...data, ads: [...ads, makeAd(id)], nextAdId: id + 1 });
  };

  const view = useMemo(() => buildPacerView(data), [data]);
  const {
    adCalcs,
    totalAllocated,
    acctBudget,
    remaining,
    allocPct,
    allocStatus,
    allocColor,
  } = view;

  return (
    <div>
      {/* Account Budget Goal */}
      <div style={{ ...panelStyle, marginBottom: 22 }}>
        <SLabel text="Account Budget Goal" />
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            marginBottom: acctBudget != null ? 16 : 0,
          }}
        >
          <div style={{ minWidth: 210 }}>
            <label style={{ ...labelStyle, marginBottom: 5 }}>Total Account Budget</label>
            <DollarInput
              value={accountBudget}
              onChange={(e) => onChange({ ...data, accountBudget: e.target.value })}
              placeholder="e.g. 5000.00"
            />
          </div>
          {acctBudget != null && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <MBox label="Account Goal" value={fmt(acctBudget)} color={COLORS.daily} />
              <MBox
                label="Total Allocated"
                value={fmt(totalAllocated)}
                sub="across all ads"
                color={allocColor}
              />
              <MBox
                label="Remaining"
                value={fmt(Math.abs(remaining ?? 0))}
                sub={
                  remaining != null && remaining < 0 ? 'over budget' : 'unallocated'
                }
                color={remaining != null && remaining < 0 ? COLORS.error : COLORS.success}
              />
              {allocPct != null && (
                <MBox
                  label="% Allocated"
                  value={`${allocPct.toFixed(1)}%`}
                  sub="of account budget"
                  color={allocColor}
                />
              )}
            </div>
          )}
        </div>
        {acctBudget != null && acctBudget > 0 && (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 5,
              }}
            >
              <span
                style={{
                  color: 'var(--muted-foreground)',
                  fontSize: 9,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  opacity: 0.85,
                }}
              >
                Budget Allocation
              </span>
              <span style={{ color: allocColor, fontSize: 10, fontWeight: 700 }}>
                {allocStatus === 'over'
                  ? 'Over-allocated'
                  : allocStatus === 'perfect'
                    ? 'Fully allocated'
                    : 'Under-allocated'}
              </span>
            </div>
            <div
              style={{
                height: 12,
                background: 'var(--muted)',
                borderRadius: 999,
                overflow: 'hidden',
                display: 'flex',
              }}
            >
              {adCalcs.map((a, i) => {
                const w = Math.min((a.projected / acctBudget) * 100, 100);
                return w > 0 ? (
                  <div
                    key={a.id}
                    title={`${a.name}: ${fmt(a.projected)}`}
                    style={{
                      height: '100%',
                      width: `${w}%`,
                      background: AD_COLORS[i % AD_COLORS.length],
                      borderRight: '1px solid var(--background)',
                      transition: 'width 0.5s',
                    }}
                  />
                ) : null;
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              {adCalcs.map((a, i) => (
                <div
                  key={a.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 10,
                    color: 'var(--muted-foreground)',
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: AD_COLORS[i % AD_COLORS.length],
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      maxWidth: 140,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--foreground)',
                    }}
                  >
                    {a.name}
                  </span>
                  <span style={{ color: 'var(--muted-foreground)', opacity: 0.75 }}>
                    {((a.projected / acctBudget) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
              {remaining != null && remaining > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 10,
                    color: 'var(--muted-foreground)',
                    opacity: 0.75,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: 'var(--muted)',
                      border: '1px solid var(--border)',
                      flexShrink: 0,
                    }}
                  />
                  <span>Unallocated</span>
                  <span>{((remaining / acctBudget) * 100).toFixed(1)}%</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Ads */}
      <div style={{ marginBottom: 24 }}>
        <SLabel text={`Active Ads (${ads.length})`} />
        {ads.map((ad) => (
          <AdRow key={ad.id} ad={ad} onUpdate={updateAd} onRemove={removeAd} />
        ))}
        <button
          type="button"
          onClick={addAd}
          style={{
            width: '100%',
            padding: '13px',
            background: 'transparent',
            border: '1px dashed var(--border)',
            borderRadius: 12,
            color: COLORS.daily,
            fontSize: 12,
            cursor: 'pointer',
            letterSpacing: '0.05em',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = COLORS.daily;
            e.currentTarget.style.background = 'rgba(56, 189, 248, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <PlusIcon className="w-4 h-4" />
          Add Ad
        </button>
      </div>
    </div>
  );
}

// ─── Summary Panel (read-only pacing table) ─────────────────────────────────
function SummaryPanel({ data }: { data: PacerData }) {
  const view = useMemo(() => buildPacerView(data), [data]);
  const {
    adCalcs,
    totalProjected,
    totalActual,
    totalTarget,
    totalAllocated,
    acctBudget,
    remaining,
    allocColor,
  } = view;

  if (data.ads.length === 0) {
    return (
      <div style={{ ...panelStyle, textAlign: 'center', padding: '48px 22px' }}>
        <p style={{ color: 'var(--foreground)', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          No ads yet
        </p>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
          Add at least one ad on the Budgeting tab to see a summary.
        </p>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <SLabel text="Summary Table" />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                'Ad Name',
                'Type',
                'Date Range',
                'Days',
                'Budget Set',
                'Projected',
                'Actual',
                'Target',
                'Rec. Daily',
                'Δ Budget',
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '7px 10px',
                    textAlign: 'left',
                    color: 'var(--muted-foreground)',
                    fontWeight: 600,
                    fontSize: 9,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    opacity: 0.85,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {adCalcs.map((a, i) => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td
                  style={{
                    padding: '9px 10px',
                    color: 'var(--foreground)',
                    maxWidth: 160,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: 2,
                      background: AD_COLORS[i % AD_COLORS.length],
                      marginRight: 6,
                      verticalAlign: 'middle',
                    }}
                  />
                  {a.name}
                </td>
                <td style={{ padding: '9px 10px' }}>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      padding: '2px 7px',
                      borderRadius: 3,
                      background: a.isLifetime ? COLORS.lifetimeTint : COLORS.dailyTint,
                      color: a.isLifetime ? COLORS.lifetime : COLORS.daily,
                    }}
                  >
                    {a.isLifetime ? 'Lifetime' : 'Daily'}
                  </span>
                </td>
                <td
                  style={{
                    padding: '9px 10px',
                    color: 'var(--muted-foreground)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.start && a.end ? `${a.start} → ${a.end}` : '—'}
                </td>
                <td style={{ padding: '9px 10px', color: 'var(--muted-foreground)' }}>
                  {a.days > 0 ? a.days : '—'}
                </td>
                <td
                  style={{
                    padding: '9px 10px',
                    color: a.isLifetime ? COLORS.lifetime : COLORS.daily,
                  }}
                >
                  {fmt(a.currentBudget)}
                  <span
                    style={{
                      color: 'var(--muted-foreground)',
                      fontSize: 9,
                      marginLeft: 4,
                      opacity: 0.75,
                    }}
                  >
                    {a.isLifetime ? 'total' : '/day'}
                  </span>
                </td>
                <td style={{ padding: '9px 10px', color: 'var(--foreground)' }}>
                  {fmt(a.projected)}
                  {a.isLifetime && a.impliedDaily != null && (
                    <span
                      style={{
                        color: 'var(--muted-foreground)',
                        fontSize: 9,
                        display: 'block',
                        opacity: 0.75,
                      }}
                    >
                      ~{fmt(a.impliedDaily)}/day
                    </span>
                  )}
                </td>
                <td
                  style={{
                    padding: '9px 10px',
                    color: a.actual != null ? COLORS.lifetime : 'var(--muted-foreground)',
                    opacity: a.actual != null ? 1 : 0.5,
                  }}
                >
                  {a.actual != null ? fmt(a.actual) : '—'}
                </td>
                <td
                  style={{
                    padding: '9px 10px',
                    color: a.target != null ? 'var(--foreground)' : 'var(--muted-foreground)',
                    opacity: a.target != null ? 1 : 0.5,
                  }}
                >
                  {a.target != null ? fmt(a.target) : '—'}
                </td>
                <td
                  style={{
                    padding: '9px 10px',
                    color: a.recDaily != null ? COLORS.success : 'var(--muted-foreground)',
                    opacity: a.recDaily != null ? 1 : 0.5,
                  }}
                >
                  {a.isLifetime ? (
                    <span style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}>
                      n/a
                    </span>
                  ) : a.recDaily != null ? (
                    fmt(a.recDaily)
                  ) : (
                    '—'
                  )}
                </td>
                <td
                  style={{
                    padding: '9px 10px',
                    color:
                      a.delta == null
                        ? 'var(--muted-foreground)'
                        : a.delta > 0
                          ? COLORS.success
                          : a.delta < 0
                            ? COLORS.error
                            : 'var(--foreground)',
                    fontWeight: 700,
                    opacity: a.delta == null ? 0.5 : 1,
                  }}
                >
                  {a.delta != null
                    ? `${a.delta >= 0 ? '+' : ''}${fmt(a.delta)}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1px solid var(--border)' }}>
              <td
                colSpan={4}
                style={{
                  padding: '9px 10px',
                  color: 'var(--muted-foreground)',
                  fontWeight: 700,
                  fontSize: 10,
                  textTransform: 'uppercase',
                }}
              >
                Totals
              </td>
              <td style={{ padding: '9px 10px', color: 'var(--muted-foreground)', fontSize: 9 }}>
                —
              </td>
              <td style={{ padding: '9px 10px', color: COLORS.daily, fontWeight: 700 }}>
                {fmt(totalProjected)}
              </td>
              <td style={{ padding: '9px 10px', color: COLORS.lifetime, fontWeight: 700 }}>
                {totalActual > 0 ? fmt(totalActual) : '—'}
              </td>
              <td style={{ padding: '9px 10px', color: 'var(--foreground)', fontWeight: 700 }}>
                {totalTarget > 0 ? fmt(totalTarget) : '—'}
              </td>
              <td colSpan={2} />
            </tr>
            {acctBudget != null && (
              <tr
                style={{
                  borderTop: '1px solid var(--border)',
                  background: 'var(--muted)',
                }}
              >
                <td
                  colSpan={4}
                  style={{
                    padding: '9px 10px',
                    color: 'var(--muted-foreground)',
                    fontSize: 9,
                    textTransform: 'uppercase',
                  }}
                >
                  Account Budget Goal
                </td>
                <td colSpan={3} style={{ padding: '9px 10px' }}>
                  <span style={{ color: allocColor, fontWeight: 700 }}>
                    {fmt(totalAllocated)}
                  </span>
                  <span style={{ color: 'var(--muted-foreground)' }}> / </span>
                  <span style={{ color: COLORS.daily, fontWeight: 700 }}>
                    {fmt(acctBudget)}
                  </span>
                  <span
                    style={{
                      color:
                        remaining != null && remaining < 0 ? COLORS.error : COLORS.success,
                      marginLeft: 10,
                    }}
                  >
                    ({remaining != null && remaining < 0 ? '-' : '+'}
                    {fmt(Math.abs(remaining ?? 0))})
                  </span>
                </td>
                <td colSpan={3} />
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Admin account picker ────────────────────────────────────────────────────
function AdminAccountPicker({
  accounts,
  value,
  onChange,
}: {
  accounts: Record<string, { dealer: string }>;
  value: string | null;
  onChange: (key: string) => void;
}) {
  const options = Object.entries(accounts)
    .filter(([key]) => !key.startsWith('_'))
    .map(([key, data]) => ({ key, name: data.dealer || key }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'var(--input)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        color: 'var(--foreground)',
        fontSize: 13,
        padding: '8px 12px',
        outline: 'none',
        minWidth: 240,
      }}
    >
      <option value="" disabled>
        — Select an account —
      </option>
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

// ─── Main tool component ─────────────────────────────────────────────────────
function MetaAdsPacerTool() {
  const { accountKey, accounts, accountsLoaded, isAdmin } = useAccount();
  const [adminPickedKey, setAdminPickedKey] = useState<string | null>(null);

  // When a sub-account is selected globally, it wins. Otherwise fall back to the
  // admin-picked key scoped to this tool.
  const activeKey = accountKey ?? adminPickedKey;
  const activeAccount = activeKey ? accounts[activeKey] : null;

  const [pacerData, setPacerData] = useState<PacerData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [activeTab, setActiveTab] = useState<'budgeting' | 'summary'>('budgeting');

  // Load when active key changes
  useEffect(() => {
    if (!activeKey) {
      setPacerData(null);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    try {
      const raw = localStorage.getItem(storageKeyFor(activeKey));
      setPacerData(raw ? (JSON.parse(raw) as PacerData) : emptyPacerData());
    } catch {
      setPacerData(emptyPacerData());
    }
    setLoaded(true);
  }, [activeKey]);

  // Save (debounced)
  useEffect(() => {
    if (!loaded || !activeKey || !pacerData) return;
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKeyFor(activeKey), JSON.stringify(pacerData));
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('error');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [pacerData, activeKey, loaded]);

  const totals = useMemo(() => {
    if (!pacerData) return { proj: 0, actual: 0 };
    let proj = 0;
    let actual = 0;
    pacerData.ads.forEach((ad) => {
      const isLifetime = ad.budgetType === 'lifetime';
      const days = calcDays(ad.start, ad.end);
      proj += isLifetime ? ad.currentBudget : ad.currentBudget * Math.max(days, 1);
      const a =
        ad.actualSpend !== '' && ad.actualSpend != null ? parseFloat(ad.actualSpend) : 0;
      actual += isNaN(a) ? 0 : a;
    });
    return { proj, actual };
  }, [pacerData]);

  const saveIndicatorColor =
    saveStatus === 'saved'
      ? COLORS.success
      : saveStatus === 'saving'
        ? COLORS.warn
        : saveStatus === 'error'
          ? COLORS.error
          : 'var(--muted-foreground)';
  const saveIndicatorLabel =
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
      {/* Page header: title / centered tabs / save indicator */}
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <MegaphoneIcon className="w-7 h-7 text-[var(--primary)]" />
          <div>
            <h2 className="text-2xl font-bold">Meta Ads Pacer</h2>
            <p className="text-[var(--muted-foreground)] text-sm mt-0.5">
              Multi-account pacing & budget management
            </p>
          </div>
        </div>

        {activeKey ? (
          <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('budgeting')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'budgeting'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
              Budgeting
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('summary')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'summary'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <TableCellsIcon className="w-3.5 h-3.5" />
              Summary
            </button>
          </div>
        ) : (
          <div />
        )}

        <div
          className="flex items-center gap-1.5 text-[10px]"
          style={{ color: saveIndicatorColor }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: saveIndicatorColor }}
          />
          {saveIndicatorLabel}
        </div>
      </div>

      {/* Scope row: pacing-for selector on left, spend totals on right — no background */}
      <div className="mb-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            style={{
              color: 'var(--muted-foreground)',
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              opacity: 0.85,
            }}
          >
            Pacing for:
          </span>
          {isAdmin ? (
            accountsLoaded ? (
              <AdminAccountPicker
                accounts={accounts}
                value={activeKey}
                onChange={setAdminPickedKey}
              />
            ) : (
              <span style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
                Loading accounts…
              </span>
            )
          ) : (
            <span
              style={{
                color: 'var(--foreground)',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {activeAccount?.dealer || activeKey || '—'}
            </span>
          )}
        </div>

        {activeKey && (
          <div className="flex gap-5 items-center flex-wrap">
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-wider text-[var(--muted-foreground)]">
                Projected Spend
              </div>
              <div style={{ color: COLORS.daily }} className="text-lg font-bold">
                {fmt(totals.proj)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-wider text-[var(--muted-foreground)]">
                Actual Spend
              </div>
              <div style={{ color: COLORS.lifetime }} className="text-lg font-bold">
                {fmt(totals.actual)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      {!activeKey ? (
        <div
          className="text-center rounded-xl"
          style={{
            padding: '60px 22px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
          }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'var(--muted)' }}
          >
            <MegaphoneIcon className="w-6 h-6 text-[var(--muted-foreground)]" />
          </div>
          <p className="text-[var(--foreground)] text-sm font-medium mb-1">
            Select an account to begin pacing
          </p>
          <p className="text-[var(--muted-foreground)] text-xs">
            Pick a store from the selector above to start planning ad budgets.
          </p>
        </div>
      ) : !loaded || !pacerData ? (
        <div className="text-center py-16 text-[var(--muted-foreground)] text-sm">
          Loading saved data…
        </div>
      ) : (
        <div
          className="rounded-xl"
          style={{
            padding: '24px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
          }}
        >
          {activeTab === 'budgeting' ? (
            <BudgetingPanel data={pacerData} onChange={setPacerData} />
          ) : (
            <SummaryPanel data={pacerData} />
          )}
        </div>
      )}
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
