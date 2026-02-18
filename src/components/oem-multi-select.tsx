'use client';

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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 w-full min-w-[280px] glass-dropdown shadow-lg animate-fade-in-up">
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

          <div className="max-h-[260px] overflow-y-auto p-1.5">
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
        </div>
      )}
    </div>
  );
}
