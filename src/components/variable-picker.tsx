'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon, ChevronRightIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useAccount } from '@/contexts/account-context';
import espVariablesData from '@/data/esp-variables.json';

// ─── Types ──────────────────────────────────────────────────────
type VariableEntry = {
  variable: string;
  label: string;
  description: string;
};

type VariableCatalog = Record<string, VariableEntry[]>;

interface VariablePickerButtonProps {
  onInsert: (token: string) => void;
}

// ─── Helpers ────────────────────────────────────────────────────
const CATALOG = espVariablesData as VariableCatalog;

/**
 * Build the complete variable catalog including account-specific custom values.
 */
function buildCatalog(
  accountCustomValues?: Record<string, { name: string; value: string }> | null,
): VariableCatalog {
  if (!accountCustomValues || Object.keys(accountCustomValues).length === 0) {
    return CATALOG;
  }

  // Merge account-specific custom values into the Custom Values category
  const existingKeys = new Set(
    (CATALOG['Custom Values'] || []).map((e) => e.variable),
  );

  const accountEntries: VariableEntry[] = [];
  for (const [fieldKey, def] of Object.entries(accountCustomValues)) {
    const token = `{{custom_values.${fieldKey}}}`;
    if (!existingKeys.has(token)) {
      accountEntries.push({
        variable: token,
        label: def.name || fieldKey,
        description: def.value ? `Current: ${def.value}` : 'Account custom value',
      });
    }
  }

  if (accountEntries.length === 0) return CATALOG;

  return {
    ...CATALOG,
    'Custom Values': [...(CATALOG['Custom Values'] || []), ...accountEntries],
  };
}

// ─── Category order ─────────────────────────────────────────────
const CATEGORY_ORDER = ['Custom Values', 'Contact', 'Vehicle', 'Dealership', 'System'];

/** Display name overrides for categories (JSON key → display label). */
const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  'Location': 'Dealership',
};

// ─── Component ──────────────────────────────────────────────────
export function VariablePickerButton({ onInsert }: VariablePickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['Custom Values']),
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  // Get account custom values via context
  const { accountData } = useAccount();
  const accountCustomValues = useMemo(() => {
    if (!accountData?.customValues) return null;
    if (typeof accountData.customValues === 'string') {
      try {
        return JSON.parse(accountData.customValues) as Record<string, { name: string; value: string }>;
      } catch {
        return null;
      }
    }
    return accountData.customValues as Record<string, { name: string; value: string }>;
  }, [accountData?.customValues]);

  const catalog = useMemo(
    () => buildCatalog(accountCustomValues),
    [accountCustomValues],
  );

  // Sort categories according to defined order (using display names for ordering)
  const sortedCategories = useMemo(() => {
    const cats = Object.keys(catalog);
    return cats.sort((a, b) => {
      const aDisplay = CATEGORY_DISPLAY_NAMES[a] || a;
      const bDisplay = CATEGORY_DISPLAY_NAMES[b] || b;
      const ai = CATEGORY_ORDER.indexOf(aDisplay);
      const bi = CATEGORY_ORDER.indexOf(bDisplay);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [catalog]);

  // Filter by search
  const filteredCatalog = useMemo(() => {
    if (!search.trim()) return catalog;
    const q = search.toLowerCase();
    const result: VariableCatalog = {};
    for (const [category, entries] of Object.entries(catalog)) {
      const filtered = entries.filter(
        (e) =>
          e.label.toLowerCase().includes(q) ||
          e.variable.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q),
      );
      if (filtered.length > 0) result[category] = filtered;
    }
    return result;
  }, [catalog, search]);

  // Calculate dropdown position when opening
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropW = 288; // w-72 = 18rem = 288px
    const dropH = 320; // max-h-80 = 20rem = 320px
    // Prefer below-right; flip up if not enough space below
    const top = rect.bottom + 4 + dropH > window.innerHeight
      ? rect.top - dropH - 4
      : rect.bottom + 4;
    const left = Math.max(8, Math.min(rect.right - dropW, window.innerWidth - dropW - 8));
    setDropdownPos({ top, left });
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Close on scroll of any ancestor (but not scrolling within the dropdown itself)
  useEffect(() => {
    if (!open) return;
    function handleScroll(e: Event) {
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return;
      setOpen(false);
      setSearch('');
    }
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open && dropdownPos) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, dropdownPos]);

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const handleInsert = useCallback(
    (token: string) => {
      onInsert(token);
      setOpen(false);
      setSearch('');
    },
    [onInsert],
  );

  // When searching, expand all categories with matches
  const effectiveExpanded = search.trim()
    ? new Set(Object.keys(filteredCatalog))
    : expandedCategories;

  const dropdown = open && dropdownPos && createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[9999] w-72 max-h-80 rounded-lg border border-[var(--border)] backdrop-blur-xl backdrop-saturate-150 shadow-[0_4px_16px_rgba(0,0,0,0.1),inset_0_0.5px_0_rgba(255,255,255,0.04)] overflow-hidden flex flex-col"
      style={{
        top: dropdownPos.top,
        left: dropdownPos.left,
        background: "color-mix(in srgb, var(--background) 96%, transparent)",
      }}
    >
          {/* Search */}
          <div className="p-2 border-b border-[var(--border)]">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)]" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search variables..."
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-[var(--input)] border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>

          {/* Categories */}
          <div className="flex-1 overflow-y-auto">
            {sortedCategories
              .filter((cat) => filteredCatalog[cat])
              .map((category) => {
                const entries = filteredCatalog[category] || [];
                const isExpanded = effectiveExpanded.has(category);

                return (
                  <div key={category}>
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider hover:bg-[var(--muted)] transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDownIcon className="w-3 h-3 flex-shrink-0" />
                      ) : (
                        <ChevronRightIcon className="w-3 h-3 flex-shrink-0" />
                      )}
                      {CATEGORY_DISPLAY_NAMES[category] || category}
                      <span className="ml-auto text-[10px] font-normal opacity-60">
                        {entries.length}
                      </span>
                    </button>

                    {isExpanded && (
                      <div>
                        {entries.map((entry) => (
                          <button
                            key={entry.variable}
                            onClick={() => handleInsert(entry.variable)}
                            className="w-full text-left px-3 py-1.5 hover:bg-[var(--primary)]/10 transition-colors group"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors">
                                {entry.label}
                              </span>
                              <code className="text-[9px] font-mono text-[var(--muted-foreground)] opacity-60 truncate max-w-[140px]">
                                {entry.variable}
                              </code>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

            {Object.keys(filteredCatalog).length === 0 && (
              <div className="px-3 py-4 text-xs text-[var(--muted-foreground)] text-center">
                No variables match &ldquo;{search}&rdquo;
              </div>
            )}
          </div>
    </div>,
    document.body,
  );

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex-shrink-0 p-1.5 rounded-lg border border-[var(--border)] bg-[var(--input)] text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-colors"
        title="Insert variable"
      >
        <span className="w-4 h-4 flex items-center justify-center text-xs font-bold leading-none">{'{x}'}</span>
      </button>
      {dropdown}
    </div>
  );
}
