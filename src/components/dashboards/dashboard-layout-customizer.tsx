'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowsUpDownIcon,
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

export type DashboardWidgetCategory =
  | 'overview'
  | 'campaigns'
  | 'flows'
  | 'contacts'
  | 'operations'
  | 'technical'
  | 'engagement';

export type DashboardWidgetDefinition = {
  id: string;
  title: string;
  category: DashboardWidgetCategory;
  description?: string;
};

type DashboardCustomizationOptions = {
  enabled: boolean;
  mode: string;
  scope: string;
  widgets: DashboardWidgetDefinition[];
};

type DashboardCustomizationState = {
  ready: boolean;
  saving: boolean;
  editMode: boolean;
  setEditMode: (value: boolean) => void;
  widgetMap: Record<string, DashboardWidgetDefinition>;
  widgetOrder: string[];
  hiddenWidgetIds: string[];
  visibleWidgetIds: string[];
  moveWidget: (fromWidgetId: string, toWidgetId: string) => void;
  hideWidget: (widgetId: string) => void;
  showWidget: (widgetId: string) => void;
  toggleWidget: (widgetId: string) => void;
  resetLayout: () => void;
};

const MAX_WIDGETS = 80;
const CATEGORY_ORDER: DashboardWidgetCategory[] = [
  'overview',
  'campaigns',
  'flows',
  'contacts',
  'operations',
  'technical',
  'engagement',
];

const CATEGORY_LABELS: Record<DashboardWidgetCategory, string> = {
  overview: 'Overview',
  campaigns: 'Campaigns',
  flows: 'Flows',
  contacts: 'Contacts',
  operations: 'Operations',
  technical: 'Technical',
  engagement: 'Engagement',
};

function normalizeWidgetIds(raw: string[], validIds: Set<string>, fallbackOrder: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const widgetId of raw) {
    if (!validIds.has(widgetId) || seen.has(widgetId)) continue;
    deduped.push(widgetId);
    seen.add(widgetId);
    if (deduped.length >= MAX_WIDGETS) break;
  }

  for (const widgetId of fallbackOrder) {
    if (seen.has(widgetId)) continue;
    deduped.push(widgetId);
    seen.add(widgetId);
    if (deduped.length >= MAX_WIDGETS) break;
  }

  return deduped;
}

function parseLayoutArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const parsed: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const next = item.trim();
    if (!next) continue;
    parsed.push(next);
    if (parsed.length >= MAX_WIDGETS) break;
  }
  return parsed;
}

function layoutHash(order: string[], hidden: string[]): string {
  return `${order.join('|')}::${hidden.join('|')}`;
}

export function useDashboardCustomization({
  enabled,
  mode,
  scope,
  widgets,
}: DashboardCustomizationOptions): DashboardCustomizationState {
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const widgetIds = useMemo(() => widgets.map((widget) => widget.id), [widgets]);
  const validWidgetIdSet = useMemo(() => new Set(widgetIds), [widgetIds]);
  const widgetMap = useMemo(
    () => Object.fromEntries(widgets.map((widget) => [widget.id, widget])) as Record<string, DashboardWidgetDefinition>,
    [widgets],
  );

  const [widgetOrder, setWidgetOrder] = useState<string[]>(widgetIds);
  const [hiddenWidgetIds, setHiddenWidgetIds] = useState<string[]>([]);
  const savedLayoutHashRef = useRef('');

  useEffect(() => {
    setWidgetOrder((prev) => normalizeWidgetIds(prev, validWidgetIdSet, widgetIds));
    setHiddenWidgetIds((prev) => normalizeWidgetIds(prev, validWidgetIdSet, []));
  }, [validWidgetIdSet, widgetIds]);

  useEffect(() => {
    if (!enabled || !mode || !scope) {
      setReady(true);
      return;
    }

    let cancelled = false;
    setReady(false);

    fetch(`/api/dashboard/layout?mode=${encodeURIComponent(mode)}&scope=${encodeURIComponent(scope)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to load dashboard layout');
        return response.json();
      })
      .then((data: { order?: unknown; hidden?: unknown }) => {
        if (cancelled) return;
        const nextOrder = normalizeWidgetIds(parseLayoutArray(data.order), validWidgetIdSet, widgetIds);
        const nextHidden = normalizeWidgetIds(parseLayoutArray(data.hidden), validWidgetIdSet, []);
        setWidgetOrder(nextOrder);
        setHiddenWidgetIds(nextHidden);
        savedLayoutHashRef.current = layoutHash(nextOrder, nextHidden);
      })
      .catch(() => {
        if (cancelled) return;
        const defaultOrder = normalizeWidgetIds(widgetIds, validWidgetIdSet, widgetIds);
        setWidgetOrder(defaultOrder);
        setHiddenWidgetIds([]);
        savedLayoutHashRef.current = layoutHash(defaultOrder, []);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, mode, scope, validWidgetIdSet, widgetIds]);

  useEffect(() => {
    if (!enabled || !ready || !mode || !scope) return;

    const serialized = layoutHash(widgetOrder, hiddenWidgetIds);
    if (serialized === savedLayoutHashRef.current) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSaving(true);
      fetch('/api/dashboard/layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          scope,
          order: widgetOrder,
          hidden: hiddenWidgetIds,
        }),
      })
        .then((response) => {
          if (!response.ok) throw new Error('Failed to save dashboard layout');
          savedLayoutHashRef.current = serialized;
        })
        .catch(() => {
          // Keep local state even if persistence fails.
        })
        .finally(() => {
          if (!cancelled) setSaving(false);
        });
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, ready, mode, scope, widgetOrder, hiddenWidgetIds]);

  const hiddenSet = useMemo(() => new Set(hiddenWidgetIds), [hiddenWidgetIds]);

  const visibleWidgetIds = useMemo(
    () => widgetOrder.filter((widgetId) => !hiddenSet.has(widgetId) && validWidgetIdSet.has(widgetId)),
    [hiddenSet, validWidgetIdSet, widgetOrder],
  );

  function moveWidget(fromWidgetId: string, toWidgetId: string) {
    if (!fromWidgetId || !toWidgetId || fromWidgetId === toWidgetId) return;

    setWidgetOrder((prev) => {
      const fromIndex = prev.indexOf(fromWidgetId);
      const toIndex = prev.indexOf(toWidgetId);
      if (fromIndex < 0 || toIndex < 0) return prev;

      const next = [...prev];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, fromWidgetId);
      return next;
    });
  }

  function hideWidget(widgetId: string) {
    if (!validWidgetIdSet.has(widgetId)) return;
    setHiddenWidgetIds((prev) => {
      if (prev.includes(widgetId)) return prev;
      return [...prev, widgetId];
    });
  }

  function showWidget(widgetId: string) {
    if (!validWidgetIdSet.has(widgetId)) return;
    setHiddenWidgetIds((prev) => prev.filter((id) => id !== widgetId));
  }

  function toggleWidget(widgetId: string) {
    if (!validWidgetIdSet.has(widgetId)) return;
    setHiddenWidgetIds((prev) => {
      if (prev.includes(widgetId)) return prev.filter((id) => id !== widgetId);
      return [...prev, widgetId];
    });
  }

  function resetLayout() {
    const defaultOrder = normalizeWidgetIds(widgetIds, validWidgetIdSet, widgetIds);
    setWidgetOrder(defaultOrder);
    setHiddenWidgetIds([]);
  }

  return {
    ready,
    saving,
    editMode,
    setEditMode,
    widgetMap,
    widgetOrder,
    hiddenWidgetIds,
    visibleWidgetIds,
    moveWidget,
    hideWidget,
    showWidget,
    toggleWidget,
    resetLayout,
  };
}

type DashboardWidgetFrameProps = {
  widget: DashboardWidgetDefinition;
  editMode: boolean;
  order: number;
  onDragStart: (widgetId: string) => void;
  onDragOver: () => void;
  onDrop: (targetWidgetId: string) => void;
  onHide: (widgetId: string) => void;
  children: ReactNode;
};

export function DashboardWidgetFrame({
  widget,
  editMode,
  order,
  onDragStart,
  onDragOver,
  onDrop,
  onHide,
  children,
}: DashboardWidgetFrameProps) {
  return (
    <section
      draggable={editMode}
      style={{ order }}
      onDragStart={() => {
        if (!editMode) return;
        onDragStart(widget.id);
      }}
      onDragOver={(event) => {
        if (!editMode) return;
        event.preventDefault();
        onDragOver();
      }}
      onDrop={(event) => {
        if (!editMode) return;
        event.preventDefault();
        onDrop(widget.id);
      }}
      className={editMode
        ? 'rounded-2xl border border-dashed border-[var(--primary)]/40 bg-[var(--card)]/40 p-2'
        : ''}
    >
      {editMode ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5">
          <div className="flex min-w-0 items-center gap-2 text-[11px]">
            <ArrowsUpDownIcon className="h-3.5 w-3.5 text-[var(--primary)]" />
            <span className="truncate font-medium text-[var(--foreground)]">{widget.title}</span>
            <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
              {CATEGORY_LABELS[widget.category]}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onHide(widget.id)}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            <EyeSlashIcon className="h-3 w-3" />
            Hide
          </button>
        </div>
      ) : null}
      {children}
    </section>
  );
}

type DashboardCustomizePanelProps = {
  open: boolean;
  onClose: () => void;
  widgets: DashboardWidgetDefinition[];
  hiddenWidgetIds: string[];
  toggleWidget: (widgetId: string) => void;
  resetLayout: () => void;
  saving: boolean;
};

export function DashboardCustomizePanel({
  open,
  onClose,
  widgets,
  hiddenWidgetIds,
  toggleWidget,
  resetLayout,
  saving,
}: DashboardCustomizePanelProps) {
  const hiddenSet = useMemo(() => new Set(hiddenWidgetIds), [hiddenWidgetIds]);
  const groupedWidgets = useMemo(() => {
    const grouped = new Map<DashboardWidgetCategory, DashboardWidgetDefinition[]>();
    for (const category of CATEGORY_ORDER) grouped.set(category, []);

    for (const widget of widgets) {
      const list = grouped.get(widget.category) || [];
      list.push(widget);
      grouped.set(widget.category, list);
    }

    for (const category of CATEGORY_ORDER) {
      const list = grouped.get(category) || [];
      list.sort((a, b) => a.title.localeCompare(b.title));
      grouped.set(category, list);
    }

    return grouped;
  }, [widgets]);

  return (
    <aside
      aria-hidden={!open}
      className={`glass-panel glass-panel-strong w-full rounded-2xl flex flex-col overflow-hidden transition-[opacity,transform,max-height] duration-300 ease-out lg:sticky lg:top-24 lg:w-[360px] ${
        open
          ? 'pointer-events-auto max-h-[calc(100vh-8rem)] translate-x-0 opacity-100 animate-slide-in-right'
          : 'pointer-events-none max-h-0 translate-x-4 opacity-0'
      }`}
    >
      <div className="border-b border-[var(--sidebar-border-soft)] px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold tracking-tight">Customize Dashboard</h3>
            <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
              Drag widgets directly on the dashboard. Toggle visibility by category here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-[var(--sidebar-muted-foreground)] transition-colors hover:bg-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)]"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={resetLayout}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
            Reset Layout
          </button>
          <span className="text-[10px] text-[var(--muted-foreground)]">
            {saving ? 'Saving…' : 'Saved'}
          </span>
        </div>
      </div>

      <div className="themed-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
        {CATEGORY_ORDER.map((category) => {
          const rows = groupedWidgets.get(category) || [];
          if (rows.length === 0) return null;

          return (
            <section key={category}>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                {CATEGORY_LABELS[category]}
              </h4>
              <div className="space-y-1.5 rounded-xl border border-[var(--border)] p-1.5">
                {rows.map((widget) => {
                  const hidden = hiddenSet.has(widget.id);
                  return (
                    <button
                      key={widget.id}
                      type="button"
                      onClick={() => toggleWidget(widget.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors ${
                        hidden
                          ? 'text-[var(--muted-foreground)] hover:bg-[var(--muted)]/30'
                          : 'bg-[var(--primary)]/10 text-[var(--primary)]'
                      }`}
                    >
                      <span className="truncate text-left">{widget.title}</span>
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px]">
                        {hidden ? <EyeIcon className="h-3 w-3" /> : <EyeSlashIcon className="h-3 w-3" />}
                        {hidden ? 'Show' : 'Visible'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
