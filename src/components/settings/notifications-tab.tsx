'use client';

import { useEffect, useState } from 'react';
import { BoltIcon, ClockIcon } from '@heroicons/react/24/outline';
import { toast } from '@/lib/toast';

interface PreferenceItem {
  type: string;
  label: string;
  description: string;
  category: string;
  channel: 'digest' | 'immediate';
  defaultEnabled: boolean;
  enabled: boolean;
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
      style={{
        background: checked ? 'var(--primary)' : 'var(--muted)',
        border: '1px solid var(--border)',
      }}
    >
      <span
        className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

export function NotificationsTab() {
  const [items, setItems] = useState<PreferenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/notifications/preferences')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items: PreferenceItem[] }) => {
        setItems(Array.isArray(data?.items) ? data.items : []);
      })
      .catch(() => {
        toast.error('Failed to load notification preferences');
      })
      .finally(() => setLoading(false));
  }, []);

  const updateOne = async (type: string, enabled: boolean) => {
    // Optimistic UI
    const previous = items;
    setItems((prev) => prev.map((i) => (i.type === type ? { ...i, enabled } : i)));
    setSaving(type);
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: [{ type, enabled }] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      toast.error('Could not save preference — reverting');
      setItems(previous);
    } finally {
      setSaving(null);
    }
  };

  const setAll = async (enabled: boolean) => {
    const previous = items;
    setItems((prev) => prev.map((i) => ({ ...i, enabled })));
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: previous.map((i) => ({ type: i.type, enabled })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(enabled ? 'All notifications enabled' : 'All notifications disabled');
    } catch {
      toast.error('Could not save preferences — reverting');
      setItems(previous);
    }
  };

  // Group by category
  const byCategory = items.reduce<Record<string, PreferenceItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const categories = Object.keys(byCategory);
  const totalEnabled = items.filter((i) => i.enabled).length;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <p className="text-xs text-[var(--muted-foreground)]">
          Choose which alerts you receive in-app and by email. Defaults are on.
        </p>
        {!loading && items.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--muted-foreground)] tabular-nums">
              {totalEnabled} of {items.length} on
            </span>
            <button
              type="button"
              onClick={() => setAll(true)}
              className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            >
              Enable all
            </button>
            <button
              type="button"
              onClick={() => setAll(false)}
              className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Disable all
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted-foreground)]">Loading preferences…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No notification types are registered for your account yet.
        </p>
      ) : (
        <div className="max-w-3xl space-y-6">
          {categories.map((cat) => (
            <section key={cat} className="glass-section-card rounded-xl p-6">
              <h3 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4">
                {cat}
              </h3>
              <div className="space-y-3">
                {byCategory[cat].map((item) => (
                  <div
                    key={item.type}
                    className="flex items-start justify-between gap-4 px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--muted)]/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--foreground)]">
                          {item.label}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{
                            background:
                              item.channel === 'immediate'
                                ? 'rgba(56,189,248,0.18)'
                                : 'rgba(167,139,250,0.18)',
                            color:
                              item.channel === 'immediate' ? '#7dd3fc' : '#c4b5fd',
                          }}
                          title={
                            item.channel === 'immediate'
                              ? 'Sent right away'
                              : 'Bundled into the daily 8am digest'
                          }
                        >
                          {item.channel === 'immediate' ? (
                            <BoltIcon className="w-3 h-3" />
                          ) : (
                            <ClockIcon className="w-3 h-3" />
                          )}
                          {item.channel === 'immediate' ? 'Immediate' : 'Daily digest'}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                        {item.description}
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={item.enabled}
                      onChange={(next) => updateOne(item.type, next)}
                      disabled={saving === item.type}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}

          <p className="text-[11px] text-[var(--muted-foreground)] max-w-2xl">
            In-app notifications appear in the bell-icon panel in the top-right.
            Immediate alerts also email you in real time. Daily-digest alerts are
            bundled into a single 8am email and continue to show in the bell panel.
          </p>
        </div>
      )}
    </div>
  );
}
