'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  BuildingStorefrontIcon,
  PlusIcon,
  XMarkIcon,
  ChevronDownIcon,
  CheckIcon,
  ListBulletIcon,
} from '@heroicons/react/24/outline';
import type { FilterDefinition, PresetFilter } from '@/lib/smart-list-types';
import { LIFECYCLE_PRESETS } from '@/lib/smart-list-presets';
import { AccountAvatar } from '@/components/account-avatar';
import { evaluateFilter } from '@/lib/smart-list-engine';
import type { Contact } from './contacts-table';

interface ContactsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  hasAccountFilter?: boolean;
  activePresetId: string | null;
  onPresetChange: (preset: PresetFilter | null) => void;
  activeAudienceId: string | null;
  onAudienceChange: (id: string | null, definition: FilterDefinition | null) => void;
  savedAudiences: { id: string; name: string; filters: string; color?: string | null }[];
  onOpenFilterBuilder: () => void;
  hasCustomFilter: boolean;
  onClearFilter: () => void;
  totalCount: number;
  filteredCount: number;
  loading: boolean;
  onRefresh?: () => void;
  contacts: import('./contacts-table').Contact[];
}

export function ContactsToolbar({
  search,
  onSearchChange,
  hasAccountFilter = false,
  activePresetId,
  onPresetChange,
  activeAudienceId,
  onAudienceChange,
  savedAudiences,
  onOpenFilterBuilder,
  hasCustomFilter,
  onClearFilter,
  totalCount,
  filteredCount,
  loading,
  onRefresh,
  contacts,
}: ContactsToolbarProps) {
  const hasActiveFilter = activePresetId || activeAudienceId || hasCustomFilter;
  const showFilteredCount =
    Boolean(search.trim()) ||
    hasAccountFilter ||
    Boolean(activePresetId) ||
    Boolean(activeAudienceId) ||
    Boolean(hasCustomFilter) ||
    filteredCount !== totalCount;

  // Compute preset match counts
  const presetCounts = usePresetCounts(contacts);
  const audienceCounts = useAudienceCounts(contacts, savedAudiences);

  return (
    <div className="space-y-3 mb-4">
      {/* Row 1: Count + Refresh + Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted-foreground)]">
            {showFilteredCount
              ? `${filteredCount.toLocaleString()} / ${totalCount.toLocaleString()}`
              : `${totalCount.toLocaleString()}`
            } contact{totalCount !== 1 ? 's' : ''}
          </span>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              title="Refresh"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        <div className="relative flex-1 max-w-md min-w-[260px] ml-auto">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name, email, phone, vehicle, tag..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--card)] focus:outline-none focus:border-[var(--primary)]"
          />
        </div>
      </div>

      {/* Row 2: Lifecycle + Custom audiences + Filter Builder */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {LIFECYCLE_PRESETS.map((preset) => {
          const isActive = activePresetId === preset.id;
          const count = presetCounts[preset.id] ?? 0;
          return (
            <button
              key={preset.id}
              onClick={() => onPresetChange(isActive ? null : preset)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                isActive
                  ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/10'
                  : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)]'
              }`}
              title={preset.description}
            >
              <span className={`w-2 h-2 rounded-full bg-${preset.color}-400`} />
              {preset.name}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-[var(--primary)]/20' : 'bg-[var(--muted)]'
              }`}>
                {count}
              </span>
            </button>
          );
        })}

        <div className="w-px h-5 bg-[var(--border)] mx-1" />

        {savedAudiences.map((audience) => {
          const isActive = activeAudienceId === audience.id;
          const count = audienceCounts[audience.id] ?? 0;
          return (
            <button
              key={audience.id}
              onClick={() => {
                if (isActive) {
                  onAudienceChange(null, null);
                  return;
                }
                const definition = parseAudienceDefinition(audience.filters);
                if (definition) {
                  onAudienceChange(audience.id, definition);
                }
              }}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                isActive
                  ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/10'
                  : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full bg-${audience.color || 'blue'}-400`} />
              <span className="truncate max-w-[150px]">{audience.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-[var(--primary)]/20' : 'bg-[var(--muted)]'
              }`}>
                {count}
              </span>
            </button>
          );
        })}

        {savedAudiences.length > 0 && <div className="w-px h-5 bg-[var(--border)] mx-1" />}

        {/* Filter Builder trigger */}
        <button
          onClick={onOpenFilterBuilder}
          className={`flex-shrink-0 p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors ${
            hasCustomFilter ? 'text-[var(--primary)]' : ''
          }`}
          title="Create custom filter"
        >
          <PlusIcon className="w-4 h-4" />
        </button>

        {/* Clear active filter */}
        {hasActiveFilter && (
          <button
            onClick={onClearFilter}
            className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            <XMarkIcon className="w-3 h-3" />
            Clear Filter
          </button>
        )}
      </div>
    </div>
  );
}

interface ContactAccountFilterOption {
  key: string;
  dealer: string;
  storefrontImage?: string;
  city?: string;
  state?: string;
}

interface ContactsAccountFilterProps {
  values: string[];
  onChange: (values: string[]) => void;
  accounts: ContactAccountFilterOption[];
  className?: string;
}

function TinyAccountAvatar({
  dealer,
  accountKey,
  storefrontImage,
}: {
  dealer: string;
  accountKey: string;
  storefrontImage?: string;
}) {
  return (
    <AccountAvatar
      name={dealer}
      accountKey={accountKey}
      storefrontImage={storefrontImage}
      size={16}
      className="w-4 h-4 rounded-[3px] object-cover flex-shrink-0 border border-[var(--border)]"
    />
  );
}

function DropdownAccountAvatar({
  dealer,
  accountKey,
  storefrontImage,
}: {
  dealer: string;
  accountKey: string;
  storefrontImage?: string;
}) {
  return (
    <AccountAvatar
      name={dealer}
      accountKey={accountKey}
      storefrontImage={storefrontImage}
      size={20}
      className="w-5 h-5 rounded-md object-cover flex-shrink-0 border border-[var(--border)]"
    />
  );
}

export function ContactsAccountFilter({
  values,
  onChange,
  accounts,
  className,
}: ContactsAccountFilterProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  if (accounts.length === 0) return null;

  const selectedAccounts = accounts.filter((account) => values.includes(account.key));
  const selectedAccount = selectedAccounts.length === 1 ? selectedAccounts[0] : null;
  const hasSelection = values.length > 0;
  const triggerLabel = selectedAccount
    ? selectedAccount.dealer
    : hasSelection
      ? `Account (${values.length})`
      : 'Account';

  return (
    <div ref={dropdownRef} className={`relative ${className || ''}`}>
      <button
        onClick={() => setOpen((current) => !current)}
        className={`flex items-center gap-1.5 px-3 h-10 text-xs rounded-lg border transition-colors ${
          open
            ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5'
            : hasSelection
              ? 'border-[var(--primary)]/50 text-[var(--primary)] bg-[var(--primary)]/5'
              : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)]'
        }`}
      >
        {selectedAccount ? (
          <TinyAccountAvatar
            dealer={selectedAccount.dealer}
            accountKey={selectedAccount.key}
            storefrontImage={selectedAccount.storefrontImage}
          />
        ) : (
          <BuildingStorefrontIcon className="w-3.5 h-3.5" />
        )}
        <span className="max-w-[140px] truncate">{triggerLabel}</span>
        {hasSelection ? (
          <XMarkIcon
            className="w-3 h-3 hover:text-[var(--foreground)]"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
          />
        ) : (
          <ChevronDownIcon className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && (
        <div
          className="absolute top-full right-0 mt-2 z-50 glass-dropdown shadow-lg animate-fade-in-up"
          style={{ minWidth: '260px' }}
        >
          <div className="p-1.5">
            <p className="px-2 py-1 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
              Filter by Account
            </p>
            <button
              onClick={() => onChange([])}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-colors ${
                !hasSelection
                  ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                  : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
              }`}
            >
              All Accounts
              {!hasSelection && <CheckIcon className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="border-t border-[var(--border)] max-h-[280px] overflow-y-auto p-1.5">
            {accounts.map((account) => {
              const isSelected = values.includes(account.key);
              const location = [account.city, account.state].filter(Boolean).join(', ');
              return (
                <button
                  key={account.key}
                  onClick={() =>
                    onChange(
                      isSelected
                        ? values.filter((selectedKey) => selectedKey !== account.key)
                        : [...values, account.key],
                    )
                  }
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors ${
                    isSelected
                      ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                  }`}
                >
                  <DropdownAccountAvatar
                    dealer={account.dealer}
                    accountKey={account.key}
                    storefrontImage={account.storefrontImage}
                  />
                  <span className="flex-1 min-w-0 text-left">
                    <span className="block truncate">{account.dealer}</span>
                    {location && (
                      <span className="block text-[10px] text-[var(--muted-foreground)] truncate">{location}</span>
                    )}
                  </span>
                  {isSelected && <CheckIcon className="w-3.5 h-3.5 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface AudiencesMenuButtonProps {
  activeAudienceId: string | null;
  onAudienceChange: (id: string | null, definition: FilterDefinition | null) => void;
  savedAudiences: { id: string; name: string; filters: string; color?: string | null }[];
  align?: 'left' | 'right';
  className?: string;
}

export function AudiencesMenuButton({
  activeAudienceId,
  onAudienceChange,
  savedAudiences,
  align = 'right',
  className,
}: AudiencesMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div ref={dropdownRef} className={`relative ${className || ''}`}>
      <button
        onClick={() => setOpen((current) => !current)}
        className={`flex items-center gap-1.5 px-3 h-10 text-sm rounded-lg border transition-colors ${
          activeAudienceId
            ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
            : 'border-[var(--primary)] bg-[var(--primary)]/90 text-white hover:bg-[var(--primary)]'
        }`}
      >
        <ListBulletIcon className="w-4 h-4" />
        Audiences
        <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <AudienceDropdown
          savedAudiences={savedAudiences}
          activeAudienceId={activeAudienceId}
          align={align}
          onSelect={(id, definition) => {
            onAudienceChange(id, definition);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── Audience Dropdown ──

function AudienceDropdown({
  savedAudiences,
  activeAudienceId,
  align,
  onSelect,
}: {
  savedAudiences: { id: string; name: string; filters: string; color?: string | null }[];
  activeAudienceId: string | null;
  align: 'left' | 'right';
  onSelect: (id: string | null, definition: FilterDefinition | null) => void;
}) {
  return (
    <div
      className={`absolute top-full mt-2 z-50 glass-dropdown shadow-lg animate-fade-in-up max-h-[420px] overflow-y-auto ${align === 'right' ? 'right-0' : 'left-0'}`}
      style={{ minWidth: '240px' }}
    >
      {/* Lifecycle Presets section */}
      <div className="p-1.5">
        <p className="px-2 py-1 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
          Lifecycle
        </p>
        <p className="px-2 pb-1 text-[10px] text-[var(--muted-foreground)]/80">
          Default filters (visible to all users)
        </p>
        {LIFECYCLE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onSelect(preset.id, preset.definition)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors ${
              activeAudienceId === preset.id
                ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
            }`}
          >
            <span className={`w-2 h-2 rounded-full bg-${preset.color}-400 flex-shrink-0`} />
            <span className="flex-1 text-left truncate">{preset.name}</span>
            {activeAudienceId === preset.id && <CheckIcon className="w-3.5 h-3.5 flex-shrink-0" />}
          </button>
        ))}
      </div>

      {/* Audiences section */}
      {savedAudiences.length > 0 && (
        <>
          <div className="border-t border-[var(--border)]" />
          <div className="p-1.5">
            <p className="px-2 py-1 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
              Custom
            </p>
            {savedAudiences.map((list) => (
              <button
                key={list.id}
                onClick={() => {
                  const definition = parseAudienceDefinition(list.filters);
                  if (definition) {
                    onSelect(list.id, definition);
                  }
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors ${
                  activeAudienceId === list.id
                    ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                    : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                }`}
              >
                <span className={`w-2 h-2 rounded-full bg-${list.color || 'blue'}-400 flex-shrink-0`} />
                <span className="flex-1 text-left truncate">{list.name}</span>
                {activeAudienceId === list.id && <CheckIcon className="w-3.5 h-3.5 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Clear selection */}
      {activeAudienceId && (
        <>
          <div className="border-t border-[var(--border)]" />
          <div className="p-1.5">
            <button
              onClick={() => onSelect(null, null)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
              Clear Selection
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Preset Match Count Hook ──

type SavedAudience = { id: string; name: string; filters: string; color?: string | null };

function parseAudienceDefinition(filters: string): FilterDefinition | null {
  try {
    const parsed = JSON.parse(filters) as FilterDefinition;
    if (!parsed || !Array.isArray(parsed.groups)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function usePresetCounts(contacts: Contact[]): Record<string, number> {
  return useMemo(() => {
    const counts: Record<string, number> = {};
    for (const preset of LIFECYCLE_PRESETS) {
      counts[preset.id] = evaluateFilter(contacts, preset.definition).length;
    }
    return counts;
  }, [contacts]);
}

function useAudienceCounts(
  contacts: Contact[],
  savedAudiences: SavedAudience[],
): Record<string, number> {
  return useMemo(() => {
    const counts: Record<string, number> = {};
    for (const audience of savedAudiences) {
      const definition = parseAudienceDefinition(audience.filters);
      counts[audience.id] = definition ? evaluateFilter(contacts, definition).length : 0;
    }
    return counts;
  }, [contacts, savedAudiences]);
}
