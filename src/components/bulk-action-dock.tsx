'use client';

import type { ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export interface BulkActionDockItem {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface BulkActionDockProps {
  count: number;
  itemLabel: string;
  actions: BulkActionDockItem[];
  onClose: () => void;
}

export default function BulkActionDock({
  count,
  itemLabel,
  actions,
  onClose,
}: BulkActionDockProps) {
  const visibleActions = actions.filter((action) => !action.disabled || action.id === 'select-all');

  return (
    <div className="fixed bottom-6 left-1/2 z-40 w-fit max-w-[calc(100vw-2rem)] -translate-x-1/2 animate-fade-in-up">
      <div className="flex items-center rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 px-2 py-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-[var(--primary)] px-2 text-xs font-semibold text-white">
            {count}
          </span>
          <span className="text-sm font-semibold text-[var(--foreground)] whitespace-nowrap">
            {count} {itemLabel} selected
          </span>
        </div>

        <span className="mx-1 h-8 w-px bg-[var(--border)]" />

        <div className="flex items-center">
          {visibleActions.map((action, index) => (
            <div key={action.id} className="flex items-center">
              <button
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className={`inline-flex min-w-[88px] flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  action.danger
                    ? 'text-red-400 hover:bg-red-500/10'
                    : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                }`}
              >
                <span className="h-4 w-4">{action.icon}</span>
                <span className="whitespace-nowrap">{action.label}</span>
              </button>
              {index < visibleActions.length - 1 && <span className="mx-1 h-8 w-px bg-[var(--border)]" />}
            </div>
          ))}
        </div>

        <span className="mx-1 h-8 w-px bg-[var(--border)]" />

        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          aria-label="Close bulk actions"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
