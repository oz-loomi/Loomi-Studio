'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { MAJOR_US_OEMS } from '@/lib/oems';

interface OemMultiSelectProps {
  value: string[];
  onChange: (next: string[]) => void;
  options?: readonly string[];
  placeholder?: string;
  maxSelections?: number;
}

type FloatingState = {
  style: React.CSSProperties;
  listMaxHeight: number;
};

function summarizeSelection(values: string[], placeholder: string): string {
  if (values.length === 0) return placeholder;
  if (values.length <= 2) return values.join(', ');
  return `${values.slice(0, 2).join(', ')} +${values.length - 2}`;
}

export function OemMultiSelect({
  value,
  onChange,
  options = MAJOR_US_OEMS,
  placeholder = 'Select brands...',
  maxSelections = 8,
}: OemMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [floating, setFloating] = useState<FloatingState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function updateFloatingPosition() {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 8;
    const minPanelHeight = 168;
    const preferredPanelHeight = 360;

    const width = Math.min(
      Math.max(rect.width, 280),
      Math.max(280, window.innerWidth - viewportPadding * 2),
    );
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      window.innerWidth - width - viewportPadding,
    );

    const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
    const spaceAbove = rect.top - gap - viewportPadding;
    const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
    const availableSpace = Math.max(placeAbove ? spaceAbove : spaceBelow, minPanelHeight);
    const panelHeight = Math.min(preferredPanelHeight, availableSpace);
    const top = placeAbove
      ? Math.max(viewportPadding, rect.top - gap - panelHeight)
      : Math.min(window.innerHeight - viewportPadding - panelHeight, rect.bottom + gap);

    setFloating({
      style: {
        position: 'fixed',
        top,
        left,
        width,
        zIndex: 240,
      },
      listMaxHeight: Math.max(96, panelHeight - 78),
    });
  }

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const clickedTrigger = rootRef.current?.contains(target);
      const clickedMenu = menuRef.current?.contains(target);
      if (!clickedTrigger && !clickedMenu) setOpen(false);
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setFloating(null);
      return;
    }

    updateFloatingPosition();

    function handleViewportChange() {
      updateFloatingPosition();
    }

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open]);

  const allOptions = useMemo(() => {
    const optionSet = new Set(options);
    const selectedUnknown = value.filter((v) => !optionSet.has(v));
    return [...selectedUnknown, ...options];
  }, [options, value]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return [...allOptions];
    return allOptions.filter((opt) => opt.toLowerCase().includes(normalizedQuery));
  }, [allOptions, normalizedQuery]);

  const selectedValues = useMemo(() => {
    const selectedSet = new Set(value);
    return allOptions.filter((opt) => selectedSet.has(opt));
  }, [allOptions, value]);

  function toggleValue(nextValue: string) {
    if (value.includes(nextValue)) {
      onChange(value.filter((v) => v !== nextValue));
      return;
    }
    if (value.length >= maxSelections) return;
    onChange([...value, nextValue]);
  }

  function clearAll() {
    onChange([]);
  }

  const selectedSet = new Set(value);
  const maxReached = value.length >= maxSelections;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full min-h-[38px] px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--card)] focus:outline-none focus:border-[var(--primary)] flex items-center gap-2"
      >
        <span className="flex-1 min-w-0 text-left truncate">
          {summarizeSelection(selectedValues, placeholder)}
        </span>
        {value.length > 0 ? (
          <XMarkIcon
            className="w-4 h-4 text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
          />
        ) : (
          <ChevronDownIcon
            className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {open && floating && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} className="glass-dropdown shadow-lg animate-fade-in-up" style={floating.style}>
          <div className="p-2 border-b border-[var(--border)]">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search brands..."
              className="w-full px-2.5 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--input)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
            />
            <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
              <span>{value.length} selected</span>
              <span>Max {maxSelections}</span>
            </div>
          </div>

          <div className="overflow-y-auto p-1.5" style={{ maxHeight: floating.listMaxHeight }}>
            <button
              type="button"
              onClick={clearAll}
              className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg transition-colors ${
                value.length === 0
                  ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                  : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
              }`}
            >
              Clear all brands
              {value.length === 0 && <CheckIcon className="w-3.5 h-3.5" />}
            </button>

            {filteredOptions.length === 0 ? (
              <p className="px-2.5 py-3 text-xs text-[var(--muted-foreground)]">No brands found.</p>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedSet.has(opt);
                const isDisabled = !isSelected && maxReached;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleValue(opt)}
                    disabled={isDisabled}
                    className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg transition-colors ${
                      isSelected
                        ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                        : isDisabled
                          ? 'text-[var(--muted-foreground)] opacity-50 cursor-not-allowed'
                          : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                    }`}
                  >
                    <span>{opt}</span>
                    {isSelected && <CheckIcon className="w-3.5 h-3.5" />}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
