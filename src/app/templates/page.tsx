'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  PlusIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
  ListBulletIcon,
  TrashIcon,
  PencilSquareIcon,
  ArrowPathIcon,
  EnvelopeIcon,
  CodeBracketIcon,
  EllipsisVerticalIcon,
  ArrowUpTrayIcon,
  ExclamationTriangleIcon,
  BuildingStorefrontIcon,
  ArrowLeftIcon,
  ChevronDownIcon,
  CheckIcon,
  CheckCircleIcon,
  CursorArrowRaysIcon,
  BookOpenIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { toast } from '@/lib/toast';
import { useAccount, type AccountData } from '@/contexts/account-context';
import { AccountAvatar } from '@/components/account-avatar';
import { LibraryPickerContent } from '@/components/library-picker-content';

// ── Types ──

interface EspTemplateRecord {
  id: string;
  accountKey: string;
  provider: string;
  remoteId: string | null;
  name: string;
  subject: string | null;
  previewText: string | null;
  html: string;
  status: string;
  editorType: string | null;
  thumbnailUrl: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProviderInfo {
  id: string;
  displayName: string;
  iconSrc?: string;
}

// ── Helpers ──

const VIEW_KEY = 'loomi-templates-view';

function loadView(): 'card' | 'list' {
  if (typeof window === 'undefined') return 'card';
  return (localStorage.getItem(VIEW_KEY) as 'card' | 'list') || 'card';
}
function saveView(view: 'card' | 'list') {
  localStorage.setItem(VIEW_KEY, view);
}

const statusColors: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#f59e0b20', text: '#f59e0b' },
  active: { bg: '#10b98120', text: '#10b981' },
  archived: { bg: '#6b728020', text: '#6b7280' },
};

const KNOWN_STATUSES = new Set(Object.keys(statusColors));
/** Normalize status for display — map unrecognized values to "draft". */
function displayStatus(status: string): string {
  return KNOWN_STATUSES.has(status) ? status : 'draft';
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

// Known providers — used for pills and filter
const PROVIDER_META: Record<string, ProviderInfo> = {
  ghl: {
    id: 'ghl',
    displayName: 'GoHighLevel',
    iconSrc: 'https://storage.googleapis.com/msgsndr/CVpny6EUSHRxlXfqAFb7/media/6992d3c254da0462343bf828.jpg',
  },
  klaviyo: {
    id: 'klaviyo',
    displayName: 'Klaviyo',
    iconSrc: 'https://storage.googleapis.com/msgsndr/CVpny6EUSHRxlXfqAFb7/media/6992d3ac3b3cc9155bdaf06e.png',
  },
};

function providerLabel(provider: string): string {
  return PROVIDER_META[provider]?.displayName || provider;
}

function providerIcon(provider: string): string | undefined {
  return PROVIDER_META[provider]?.iconSrc;
}

// ── Extracted sub-components (stable references — never defined inside a render) ──

function ProviderPill({ provider }: { provider: string }) {
  const icon = providerIcon(provider);
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--muted)] text-[10px] font-medium text-[var(--muted-foreground)]">
      {icon && (
        <img src={icon} alt={providerLabel(provider)} className="w-3.5 h-3.5 rounded-full object-cover" />
      )}
      {providerLabel(provider)}
    </span>
  );
}

interface AccountPillProps {
  acctKey: string;
  accounts: Record<string, AccountData>;
}

function AccountPill({ acctKey, accounts }: AccountPillProps) {
  const name = accounts[acctKey]?.dealer || acctKey;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--primary)]/10 text-[10px] font-medium text-[var(--primary)]">
      <BuildingStorefrontIcon className="w-3 h-3" />
      {name}
    </span>
  );
}

interface EspHtmlPreviewProps {
  html: string;
  height?: number;
}

function EspHtmlPreview({ html, height = 160 }: EspHtmlPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    resizeObserver.observe(el);
    setContainerWidth(el.clientWidth);
    return () => resizeObserver.disconnect();
  }, []);

  const iframeWidth = 600;
  const scale = containerWidth > 0 ? containerWidth / iframeWidth : 0.4;

  // Only render if we have properly compiled HTML (starts with <!DOCTYPE or <html)
  // Raw Maizzle source (frontmatter, <x- tags) should not be rendered in an iframe
  const trimmed = html?.trim() ?? '';
  const isCompiledHtml = trimmed.length > 0 && (
    trimmed.startsWith('<!') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')
  );
  const hasPreview = isCompiledHtml;

  return (
    <div ref={containerRef} className="relative overflow-hidden bg-[var(--muted)]" style={{ height }}>
      {hasPreview && containerWidth > 0 && (
        <iframe
          srcDoc={`<style>html,body{overflow:hidden !important;margin:0;}</style>${html}`}
          className="border-0 pointer-events-none absolute top-0 left-0"
          scrolling="no"
          style={{
            width: `${iframeWidth}px`,
            height: `${Math.round(height / scale)}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          title="Template preview"
          sandbox="allow-same-origin"
          tabIndex={-1}
        />
      )}
      {!hasPreview && (
        <div className="absolute inset-0 flex items-center justify-center">
          <EnvelopeIcon className="w-10 h-10 text-[var(--muted-foreground)] opacity-30" />
        </div>
      )}
    </div>
  );
}

interface TemplateCardProps {
  t: EspTemplateRecord;
  showAccount?: boolean;
  isMenuOpen: boolean;
  isSelected: boolean;
  selectMode: boolean;
  accounts: Record<string, AccountData>;
  onMenuToggle: (id: string | null) => void;
  onPreview: (t: EspTemplateRecord) => void;
  onEdit: (id: string) => void;
  onDelete: (t: EspTemplateRecord) => void;
  onSelect: (id: string) => void;
}

function TemplateCard({
  t,
  showAccount = false,
  isMenuOpen,
  isSelected,
  selectMode,
  accounts,
  onMenuToggle,
  onPreview,
  onEdit,
  onDelete,
  onSelect,
}: TemplateCardProps) {
  const normStatus = displayStatus(t.status);
  const sc = statusColors[normStatus];

  return (
    <div className={`glass-card rounded-xl group animate-fade-in-up relative ${isMenuOpen ? 'z-10' : ''}`}>
      {/* Selection ring overlay – renders above iframe */}
      {isSelected && (
        <div className="absolute inset-0 border-3 border-[var(--primary)] rounded-xl z-20 pointer-events-none" />
      )}
      <div
        className="rounded-t-xl cursor-pointer relative overflow-hidden"
        onClick={() => selectMode ? onSelect(t.id) : onPreview(t)}
      >
        {t.thumbnailUrl ? (
          <div className="h-[160px] bg-[var(--muted)]">
            <img src={t.thumbnailUrl} alt={t.name} className="w-full h-full object-cover" />
          </div>
        ) : (
          <EspHtmlPreview html={t.html} height={160} />
        )}
        {/* Selection overlay */}
        {selectMode && (
          <div className="absolute inset-0 bg-black/10">
            <div className={`absolute top-2.5 left-2.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                : 'border-white/80 bg-black/20'
            }`}>
              {isSelected && <CheckIcon className="w-3.5 h-3.5" />}
            </div>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <ProviderPill provider={t.provider} />
            {showAccount && <AccountPill acctKey={t.accountKey} accounts={accounts} />}
          </div>
          {!selectMode && (
            <div className="relative flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); onMenuToggle(isMenuOpen ? null : t.id); }}
                className={`p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors ${isMenuOpen ? 'opacity-100 bg-[var(--muted)]' : 'opacity-0 group-hover:opacity-100'}`}
              >
                <EllipsisVerticalIcon className="w-4 h-4" />
              </button>
              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-44 glass-dropdown" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => { onMenuToggle(null); onPreview(t); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                  >
                    <EyeIcon className="w-4 h-4" /> View
                  </button>
                  <button
                    onClick={() => { onMenuToggle(null); onEdit(t.id); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                  >
                    <PencilSquareIcon className="w-4 h-4" /> Edit
                  </button>
                  <button
                    onClick={() => { onMenuToggle(null); onDelete(t); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" /> Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <h3
          className="text-sm font-semibold cursor-pointer hover:text-[var(--primary)] transition-colors truncate"
          onClick={() => selectMode ? onSelect(t.id) : onEdit(t.id)}
        >
          {t.name}
        </h3>
        {t.subject && (
          <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5 truncate">{t.subject}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span
            className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ backgroundColor: sc.bg, color: sc.text }}
          >
            {normStatus}
          </span>
          {t.remoteId && (
            <ArrowUpTrayIcon className="w-3 h-3 text-[var(--muted-foreground)]" title="Published" />
          )}
          <span className="text-[10px] text-[var(--muted-foreground)] ml-auto">{timeAgo(t.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}

interface TemplateRowProps {
  t: EspTemplateRecord;
  showAccount?: boolean;
  isMenuOpen: boolean;
  isSelected: boolean;
  selectMode: boolean;
  accounts: Record<string, AccountData>;
  onMenuToggle: (id: string | null) => void;
  onPreview: (t: EspTemplateRecord) => void;
  onEdit: (id: string) => void;
  onDelete: (t: EspTemplateRecord) => void;
  onSelect: (id: string) => void;
}

function TemplateRow({
  t,
  showAccount = false,
  isMenuOpen,
  isSelected,
  selectMode,
  accounts,
  onMenuToggle,
  onPreview,
  onEdit,
  onDelete,
  onSelect,
}: TemplateRowProps) {
  const normStatus = displayStatus(t.status);
  const sc = statusColors[normStatus];

  return (
    <div
      className={`flex items-center gap-4 p-3 glass-card rounded-xl group animate-fade-in-up relative ${isMenuOpen ? 'z-10' : ''}`}
      onClick={selectMode ? () => onSelect(t.id) : undefined}
    >
      {/* Selection ring overlay */}
      {isSelected && (
        <div className="absolute inset-0 border-3 border-[var(--primary)] rounded-xl z-20 pointer-events-none" />
      )}
      {/* Selection checkbox */}
      {selectMode && (
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors ${
          isSelected
            ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
            : 'border-[var(--border)] hover:border-[var(--primary)]'
        }`}>
          {isSelected && <CheckIcon className="w-3 h-3" />}
        </div>
      )}
      <div className="w-10 h-10 rounded-lg bg-[var(--muted)] flex items-center justify-center flex-shrink-0 overflow-hidden">
        {t.thumbnailUrl ? (
          <img src={t.thumbnailUrl} alt={t.name} className="w-full h-full object-cover" />
        ) : (
          <EnvelopeIcon className="w-5 h-5 text-[var(--muted-foreground)] opacity-40" />
        )}
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={selectMode ? undefined : () => onEdit(t.id)}>
        <h3 className="font-semibold text-sm truncate">{t.name}</h3>
        <p className="text-[10px] text-[var(--muted-foreground)] truncate">
          {t.subject || 'No subject'}
        </p>
      </div>
      {showAccount && <AccountPill acctKey={t.accountKey} accounts={accounts} />}
      <ProviderPill provider={t.provider} />
      <span
        className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: sc.bg, color: sc.text }}
      >
        {normStatus}
      </span>
      {t.remoteId && (
        <ArrowUpTrayIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)] flex-shrink-0" title="Published" />
      )}
      <span className="text-[10px] text-[var(--muted-foreground)] flex-shrink-0 w-14 text-right">
        {timeAgo(t.updatedAt)}
      </span>
      {!selectMode && (
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onMenuToggle(isMenuOpen ? null : t.id); }}
            className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <EllipsisVerticalIcon className="w-4 h-4" />
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-44 glass-dropdown" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => { onMenuToggle(null); onPreview(t); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              >
                <EyeIcon className="w-4 h-4" /> View
              </button>
              <button
                onClick={() => { onMenuToggle(null); onEdit(t.id); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              >
                <PencilSquareIcon className="w-4 h-4" /> Edit
              </button>
              <button
                onClick={() => { onMenuToggle(null); onDelete(t); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <TrashIcon className="w-4 h-4" /> Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ToolbarProps {
  showAccountFilter?: boolean;
  search: string;
  setSearch: (v: string) => void;
  isAdmin: boolean;
  accountFilter: string;
  setAccountFilter: (v: string) => void;
  accountDropdownOpen: boolean;
  setAccountDropdownOpen: (v: boolean) => void;
  accountDropdownRef: React.RefObject<HTMLDivElement | null>;
  accountFilterLabel: string;
  selectedAccountData: AccountData | null;
  allAccountKeys: string[];
  accounts: Record<string, AccountData>;
  providerFilter: string;
  setProviderFilter: (v: string) => void;
  uniqueProviders: string[];
  viewMode: 'card' | 'list';
  toggleView: (mode: 'card' | 'list') => void;
  syncing: boolean;
  handleSync: () => void;
  effectiveAccountKey: string | null;
  setShowCreateChoice: (v: boolean) => void;
  setCreateAccountKey: (v: string | null) => void;
  // Bulk selection
  selectMode: boolean;
  setSelectMode: (v: boolean) => void;
  selectedIds: Set<string>;
  setSelectedIds: (v: Set<string>) => void;
  filteredCount: number;
  filteredIds: string[];
  onBulkDelete: () => void;
}

function Toolbar({
  showAccountFilter = false,
  search,
  setSearch,
  isAdmin,
  accountFilter,
  setAccountFilter,
  accountDropdownOpen,
  setAccountDropdownOpen,
  accountDropdownRef,
  accountFilterLabel,
  selectedAccountData,
  allAccountKeys,
  accounts,
  providerFilter,
  setProviderFilter,
  uniqueProviders,
  viewMode,
  toggleView,
  syncing,
  handleSync,
  effectiveAccountKey,
  setShowCreateChoice,
  setCreateAccountKey,
  selectMode,
  setSelectMode,
  selectedIds,
  setSelectedIds,
  filteredCount,
  filteredIds,
  onBulkDelete,
}: ToolbarProps) {
  // Selection toolbar when items are selected
  if (selectMode) {
    return (
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[var(--foreground)]">
            <CheckCircleIcon className="w-4 h-4 inline mr-1.5 text-[var(--primary)]" />
            {selectedIds.size} selected
          </span>
          <button
            onClick={() => {
              if (selectedIds.size === filteredCount) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(filteredIds));
              }
            }}
            className="text-xs text-[var(--primary)] hover:underline"
          >
            {selectedIds.size === filteredCount ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={onBulkDelete}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-400 border border-red-400/30 rounded-lg hover:bg-red-500/10 transition-colors"
            >
              <TrashIcon className="w-4 h-4" /> Delete Selected
            </button>
          )}
          <button
            onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
            className="px-3 py-2 text-sm font-medium text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-[var(--foreground)]"
            placeholder={isAdmin ? 'Search templates or sub-accounts...' : 'Search templates...'}
          />
        </div>

        {/* Account filter dropdown (admin flat list only) */}
        {showAccountFilter && allAccountKeys.length > 1 && (
          <div ref={accountDropdownRef} className="relative">
            <button
              onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
              className={`inline-flex items-center gap-1.5 h-[38px] px-3 text-sm rounded-lg border transition-colors ${
                accountDropdownOpen
                  ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5'
                  : accountFilter !== 'all'
                    ? 'border-[var(--primary)]/50 text-[var(--primary)] bg-[var(--primary)]/5'
                    : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)]'
              }`}
            >
              {accountFilter !== 'all' ? (
                <AccountAvatar
                  name={accountFilterLabel}
                  accountKey={accountFilter}
                  storefrontImage={selectedAccountData?.storefrontImage}
                  logos={selectedAccountData?.logos}
                  size={16}
                  className="w-4 h-4 rounded-[3px] object-cover flex-shrink-0 border border-[var(--border)]"
                />
              ) : (
                <BuildingStorefrontIcon className="w-3.5 h-3.5" />
              )}
              <span className="max-w-[140px] truncate">{accountFilterLabel}</span>
              {accountFilter !== 'all' ? (
                <XMarkIcon
                  className="w-3 h-3 hover:text-[var(--foreground)]"
                  onClick={(e) => { e.stopPropagation(); setAccountFilter('all'); setAccountDropdownOpen(false); }}
                />
              ) : (
                <ChevronDownIcon className={`w-3 h-3 transition-transform ${accountDropdownOpen ? 'rotate-180' : ''}`} />
              )}
            </button>

            {accountDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 z-50 glass-dropdown shadow-lg animate-fade-in-up" style={{ minWidth: '260px' }}>
                <div className="p-1.5">
                  <p className="px-2 py-1 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                    Filter by Account
                  </p>
                  <button
                    onClick={() => { setAccountFilter('all'); setAccountDropdownOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-colors ${
                      accountFilter === 'all'
                        ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                        : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                    }`}
                  >
                    All Accounts
                    {accountFilter === 'all' && <CheckIcon className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="border-t border-[var(--border)] max-h-[280px] overflow-y-auto p-1.5">
                  {allAccountKeys.map(k => {
                    const acct = accounts[k];
                    const isSelected = accountFilter === k;
                    const location = [acct?.city, acct?.state].filter(Boolean).join(', ');
                    return (
                      <button
                        key={k}
                        onClick={() => { setAccountFilter(k); setAccountDropdownOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors ${
                          isSelected
                            ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                            : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                        }`}
                      >
                        <AccountAvatar
                          name={acct?.dealer || k}
                          accountKey={k}
                          storefrontImage={acct?.storefrontImage}
                          logos={acct?.logos}
                          size={20}
                          className="w-5 h-5 rounded-md object-cover flex-shrink-0 border border-[var(--border)]"
                        />
                        <span className="flex-1 min-w-0 text-left">
                          <span className="block truncate">{acct?.dealer || k}</span>
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
        )}

        {/* Provider filter */}
        {uniqueProviders.length > 1 && (
          <div className="flex items-center gap-1 bg-[var(--muted)] rounded-lg p-0.5">
            <button
              onClick={() => setProviderFilter('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${providerFilter === 'all' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}
            >
              All
            </button>
            {uniqueProviders.map(p => (
              <button
                key={p}
                onClick={() => setProviderFilter(p)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${providerFilter === p ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}
              >
                {providerIcon(p) && (
                  <img src={providerIcon(p)} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                )}
                {providerLabel(p)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Select toggle */}
        <button
          onClick={() => setSelectMode(true)}
          className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] text-[var(--foreground)] rounded-lg text-sm font-medium hover:bg-[var(--muted)] transition-colors"
        >
          <CheckCircleIcon className="w-4 h-4" /> Select
        </button>

        {/* View toggle */}
        <div className="flex items-center bg-[var(--muted)] rounded-lg p-0.5">
          <button
            onClick={() => toggleView('card')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'card' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}
            title="Card view"
          >
            <Squares2X2Icon className="w-4 h-4" />
          </button>
          <button
            onClick={() => toggleView('list')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}
            title="List view"
          >
            <ListBulletIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Sync */}
        {(effectiveAccountKey || accountFilter !== 'all') && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] text-[var(--foreground)] rounded-lg text-sm font-medium hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
          >
            <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        )}

        {/* Create */}
        {(isAdmin || effectiveAccountKey) && (
          <button
            onClick={() => {
              setCreateAccountKey(accountFilter !== 'all' ? accountFilter : null);
              setShowCreateChoice(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <PlusIcon className="w-4 h-4" /> Add Template
          </button>
        )}
      </div>
    </div>
  );
}

interface TemplateListViewProps {
  templates: EspTemplateRecord[];
  showAccount?: boolean;
  loading: boolean;
  allTemplatesEmpty: boolean;
  viewMode: 'card' | 'list';
  providerFilter: string;
  search: string;
  openMenu: string | null;
  selectMode: boolean;
  selectedIds: Set<string>;
  accounts: Record<string, AccountData>;
  onMenuToggle: (id: string | null) => void;
  onPreview: (t: EspTemplateRecord) => void;
  onEdit: (id: string) => void;
  onDelete: (t: EspTemplateRecord) => void;
  onSelect: (id: string) => void;
}

function TemplateListView({
  templates: items,
  showAccount = false,
  loading,
  allTemplatesEmpty,
  viewMode,
  providerFilter,
  search,
  openMenu,
  selectMode,
  selectedIds,
  accounts,
  onMenuToggle,
  onPreview,
  onEdit,
  onDelete,
  onSelect,
}: TemplateListViewProps) {
  return (
    <>
      <p className="text-xs text-[var(--muted-foreground)] mb-4">
        {loading ? 'Loading...' : `${items.length} template${items.length !== 1 ? 's' : ''}`}
        {providerFilter !== 'all' && ` from ${providerLabel(providerFilter)}`}
        {search && ` matching "${search}"`}
      </p>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-card rounded-xl animate-pulse">
              <div className="h-32 rounded-t-xl bg-[var(--muted)]" />
              <div className="p-4 space-y-2">
                <div className="h-3 bg-[var(--muted)] rounded w-16" />
                <div className="h-4 bg-[var(--muted)] rounded w-3/4" />
                <div className="h-3 bg-[var(--muted)] rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="text-center py-16 text-[var(--muted-foreground)]">
          <EnvelopeIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          {allTemplatesEmpty ? (
            <>
              <p className="text-sm font-medium mb-1">No templates yet</p>
              <p className="text-xs mb-4">Click &quot;Sync&quot; to pull templates from your connected platform, or create a new one.</p>
            </>
          ) : (
            <p className="text-sm">No templates match your filters.</p>
          )}
        </div>
      )}

      {!loading && items.length > 0 && (
        viewMode === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {items.map(t => (
              <TemplateCard
                key={t.id}
                t={t}
                showAccount={showAccount}
                isMenuOpen={openMenu === t.id}
                isSelected={selectedIds.has(t.id)}
                selectMode={selectMode}
                accounts={accounts}
                onMenuToggle={onMenuToggle}
                onPreview={onPreview}
                onEdit={onEdit}
                onDelete={onDelete}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map(t => (
              <TemplateRow
                key={t.id}
                t={t}
                showAccount={showAccount}
                isMenuOpen={openMenu === t.id}
                isSelected={selectedIds.has(t.id)}
                selectMode={selectMode}
                accounts={accounts}
                onMenuToggle={onMenuToggle}
                onPreview={onPreview}
                onEdit={onEdit}
                onDelete={onDelete}
                onSelect={onSelect}
              />
            ))}
          </div>
        )
      )}
    </>
  );
}

// ── Page ──

export default function TemplatesPage() {
  const { isAdmin, isAccount, accountKey, accountData, accounts } = useAccount();
  const router = useRouter();
  const pathname = usePathname();

  // State
  const [allTemplates, setAllTemplates] = useState<EspTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');

  // Modals
  const [showCreateChoice, setShowCreateChoice] = useState(false);
  const [deleteTemplate, setDeleteTemplate] = useState<EspTemplateRecord | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EspTemplateRecord | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Library picker (inside create modal)
  const [libraryPickerMode, setLibraryPickerMode] = useState(false);
  const [createAccountKey, setCreateAccountKey] = useState<string | null>(null);

  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);
  const menuClickRef = useRef(false);

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setViewMode(loadView());
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handler = () => {
      if (menuClickRef.current) { menuClickRef.current = false; return; }
      setOpenMenu(null);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Close account dropdown on outside click
  useEffect(() => {
    if (!accountDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setAccountDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [accountDropdownOpen]);

  // Derive the effective account key for single-account mode
  const effectiveAccountKey = isAccount ? accountKey : null;

  // ── Data Loading ──

  const loadTemplates = useCallback(async () => {
    try {
      const url = effectiveAccountKey
        ? `/api/esp/templates?accountKey=${encodeURIComponent(effectiveAccountKey)}`
        : '/api/esp/templates';
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setAllTemplates(data.templates || []);
      } else {
        console.error('Failed to load templates:', data.error);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
    setLoading(false);
  }, [effectiveAccountKey]);

  useEffect(() => {
    setLoading(true);
    loadTemplates();
  }, [loadTemplates]);

  // ── Sync from ESP ──

  const handleSync = async () => {
    const syncKey = accountFilter !== 'all' ? accountFilter : effectiveAccountKey;
    if (!syncKey || syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/esp/templates/sync?accountKey=${encodeURIComponent(syncKey)}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Synced ${data.sync.total} templates (${data.sync.created} new, ${data.sync.updated} updated)`);
        await loadTemplates();
      } else {
        toast.error(data.error || 'Failed to sync');
      }
    } catch {
      toast.error('Failed to sync templates');
    }
    setSyncing(false);
  };

  // ── Grouped data for admin overview ──

  const accountGroups = useMemo(() => {
    const groups: Record<string, { templates: EspTemplateRecord[]; providers: Set<string> }> = {};
    for (const t of allTemplates) {
      if (!groups[t.accountKey]) {
        groups[t.accountKey] = { templates: [], providers: new Set() };
      }
      groups[t.accountKey].templates.push(t);
      groups[t.accountKey].providers.add(t.provider);
    }
    return groups;
  }, [allTemplates]);

  // All account keys that have templates OR are accessible
  const allAccountKeys = useMemo(() => {
    const keys = new Set(Object.keys(accounts));
    Object.keys(accountGroups).forEach(k => keys.add(k));
    return Array.from(keys).sort((a, b) => {
      const nameA = accounts[a]?.dealer || a;
      const nameB = accounts[b]?.dealer || b;
      return nameA.localeCompare(nameB);
    });
  }, [accounts, accountGroups]);

  // Account filter label
  const selectedAccountData = accountFilter !== 'all' ? accounts[accountFilter] : null;
  const accountFilterLabel = accountFilter === 'all'
    ? 'All Accounts'
    : selectedAccountData?.dealer || accountFilter;

  // ── Filtering (for flat list view and account-level view) ──

  const filtered = useMemo(() => {
    let result = allTemplates;

    // Account filter
    if (accountFilter !== 'all') {
      result = result.filter(t => t.accountKey === accountFilter);
    }

    // Provider filter
    if (providerFilter !== 'all') {
      result = result.filter(t => t.provider === providerFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) ||
        (t.subject && t.subject.toLowerCase().includes(q)) ||
        (isAdmin && (accounts[t.accountKey]?.dealer || '').toLowerCase().includes(q))
      );
    }

    return result;
  }, [allTemplates, providerFilter, search, accountFilter, isAdmin, accounts]);

  const filteredIds = useMemo(() => filtered.map(t => t.id), [filtered]);

  const uniqueProviders = useMemo(() => {
    const set = new Set(allTemplates.map(t => t.provider));
    return Array.from(set).sort();
  }, [allTemplates]);

  const toggleView = (mode: 'card' | 'list') => { setViewMode(mode); saveView(mode); };

  // ── Handlers ──

  const navigateToEditor = (templateId: string) => {
    router.push(`/templates/editor?id=${templateId}`);
  };

  const handleCreateChoice = (mode: 'visual' | 'code') => {
    const createKey = createAccountKey || (accountFilter !== 'all' ? accountFilter : null) || effectiveAccountKey;
    if (!createKey) return;
    setShowCreateChoice(false);
    setLibraryPickerMode(false);
    setCreateAccountKey(null);
    router.push(`/templates/editor?mode=${mode}&accountKey=${encodeURIComponent(createKey)}`);
  };

  const selectLibraryTemplate = (slug: string) => {
    const createKey = createAccountKey || (accountFilter !== 'all' ? accountFilter : null) || effectiveAccountKey;
    if (!createKey) return;
    setShowCreateChoice(false);
    setLibraryPickerMode(false);
    setCreateAccountKey(null);
    router.push(`/templates/editor?mode=visual&accountKey=${encodeURIComponent(createKey)}&libraryTemplate=${encodeURIComponent(slug)}`);
  };

  const handleDelete = async (deleteFromRemote: boolean) => {
    if (!deleteTemplate) return;
    try {
      const url = `/api/esp/templates/${deleteTemplate.id}${deleteFromRemote ? '?deleteFromRemote=true' : ''}`;
      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.remoteDeleted ? 'Template deleted from Loomi and connected platform' : 'Template deleted locally');
        setDeleteTemplate(null);
        await loadTemplates();
      } else {
        toast.error(data.error || 'Failed to delete');
      }
    } catch {
      toast.error('Failed to delete template');
    }
  };

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = confirm(`Delete ${selectedIds.size} template${selectedIds.size !== 1 ? 's' : ''}?`);
    if (!confirmed) return;

    const results = await Promise.allSettled(
      Array.from(selectedIds).map(id =>
        fetch(`/api/esp/templates/${id}`, { method: 'DELETE' })
      )
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    if (failed > 0) {
      toast.error(`Deleted ${succeeded}, failed ${failed}`);
    } else {
      toast.success(`Deleted ${succeeded} template${succeeded !== 1 ? 's' : ''}`);
    }

    setSelectMode(false);
    setSelectedIds(new Set());
    await loadTemplates();
  };

  // ── No connection state (account-level) ──
  const connectedProviders = accountData?.connectedProviders;
  const hasConnection = effectiveAccountKey && connectedProviders && connectedProviders.length > 0;

  // Shared toolbar props
  const toolbarProps = {
    search,
    setSearch,
    isAdmin,
    accountFilter,
    setAccountFilter,
    accountDropdownOpen,
    setAccountDropdownOpen,
    accountDropdownRef,
    accountFilterLabel,
    selectedAccountData: selectedAccountData || null,
    allAccountKeys,
    accounts,
    providerFilter,
    setProviderFilter,
    uniqueProviders,
    viewMode,
    toggleView,
    syncing,
    handleSync,
    effectiveAccountKey,
    setShowCreateChoice,
    setCreateAccountKey,
    selectMode,
    setSelectMode,
    selectedIds,
    setSelectedIds,
    filteredCount: filtered.length,
    filteredIds,
    onBulkDelete: handleBulkDelete,
  };

  // Shared list view props
  const listViewProps = {
    loading,
    allTemplatesEmpty: allTemplates.length === 0,
    viewMode,
    providerFilter,
    search,
    openMenu,
    selectMode,
    selectedIds,
    accounts,
    onMenuToggle: (id: string | null) => { if (id !== null) menuClickRef.current = true; setOpenMenu(id); },
    onPreview: setPreviewTemplate,
    onEdit: navigateToEditor,
    onDelete: setDeleteTemplate,
    onSelect: handleToggleSelect,
  };

  // ── Render ──

  return (
    <div>
      {/* Header */}
      <div className="page-sticky-header mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <EnvelopeIcon className="w-7 h-7 text-[var(--primary)]" />
            <div>
              <h2 className="text-2xl font-bold">Templates</h2>
              <p className="text-[var(--muted-foreground)] text-sm mt-0.5">
                {isAdmin
                  ? 'Manage email templates across all accounts'
                  : isAccount && accountData
                    ? `Email templates for ${accountData.dealer}`
                    : 'Manage your email templates'}
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* Route-based tab bar */}
      <div className="flex items-center gap-1 mb-6 border-b border-[var(--border)]">
        <Link
          href="/templates"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            pathname === '/templates'
              ? 'border-[var(--primary)] text-[var(--primary)]'
              : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          }`}
        >
          Account Templates
        </Link>
        <Link
          href="/templates/library"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            pathname === '/templates/library'
              ? 'border-[var(--primary)] text-[var(--primary)]'
              : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          }`}
        >
          Template Library
        </Link>
      </div>

      {/* ── Admin Mode — flat list with account filter ── */}
      {isAdmin && (
        <>
          <Toolbar showAccountFilter {...toolbarProps} />
          <TemplateListView templates={filtered} showAccount {...listViewProps} />
        </>
      )}

      {/* ── Account Mode ── */}
      {!isAdmin && (
        <>
          {/* No account selected */}
          {!effectiveAccountKey && (
            <div className="text-center py-16 text-[var(--muted-foreground)]">
              <EnvelopeIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select an account to view its email templates.</p>
            </div>
          )}

          {/* No integration connection */}
          {effectiveAccountKey && !hasConnection && !loading && (
            <div className="text-center py-16 text-[var(--muted-foreground)]">
              <ExclamationTriangleIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium mb-1">No Integration Connected</p>
              <p className="text-xs">Connect an integration in your account settings to manage email templates.</p>
            </div>
          )}

          {/* Account-level template view */}
          {effectiveAccountKey && (hasConnection || loading) && (
            <>
              <Toolbar {...toolbarProps} />
              <TemplateListView templates={filtered} {...listViewProps} />
            </>
          )}
        </>
      )}

      {/* ── Create Choice Modal ── */}
      {showCreateChoice && (() => {
        const modalAccountKey = createAccountKey || (accountFilter !== 'all' ? accountFilter : null) || effectiveAccountKey;
        const needsAccountPicker = isAdmin && !modalAccountKey;
        const selectedAccountName = modalAccountKey ? (accounts[modalAccountKey]?.dealer || modalAccountKey) : null;

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in" onClick={() => { setShowCreateChoice(false); setLibraryPickerMode(false); setCreateAccountKey(null); }}>
          <div className={`glass-modal flex flex-col ${libraryPickerMode ? 'w-[960px] max-w-[calc(100vw-3rem)] h-[70vh] max-h-[720px]' : 'w-[640px]'}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
              <div className="flex items-center gap-2">
                {(libraryPickerMode || (!needsAccountPicker && isAdmin && !effectiveAccountKey)) && (
                  <button
                    onClick={() => {
                      if (libraryPickerMode) {
                        setLibraryPickerMode(false);
                      } else {
                        setCreateAccountKey(null);
                      }
                    }}
                    className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  >
                    <ArrowLeftIcon className="w-4 h-4" />
                  </button>
                )}
                <h3 className="text-base font-semibold">
                  {needsAccountPicker
                    ? 'Select Account'
                    : libraryPickerMode
                      ? 'Select from Library'
                      : 'Add New Template'}
                </h3>
              </div>
              <button onClick={() => { setShowCreateChoice(false); setLibraryPickerMode(false); setCreateAccountKey(null); }} className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            {libraryPickerMode ? (
              <div className="flex-1 min-h-0">
                <LibraryPickerContent onSelect={selectLibraryTemplate} />
              </div>
            ) : (
            <div className="p-5">
              {/* Account picker step for admins */}
              {needsAccountPicker ? (
                <>
                  <p className="text-sm text-[var(--muted-foreground)] mb-4">Which account should this template be created for?</p>
                  <div className="max-h-[360px] overflow-y-auto space-y-1">
                    {allAccountKeys.map(k => {
                      const acct = accounts[k];
                      const location = [acct?.city, acct?.state].filter(Boolean).join(', ');
                      return (
                        <button
                          key={k}
                          onClick={() => setCreateAccountKey(k)}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border)] hover:border-[var(--primary)] bg-[var(--card)] hover:bg-[var(--primary)]/5 transition-all text-left"
                        >
                          <AccountAvatar
                            name={acct?.dealer || k}
                            accountKey={k}
                            storefrontImage={acct?.storefrontImage}
                            logos={acct?.logos}
                            size={32}
                            className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-[var(--border)]"
                          />
                          <div className="min-w-0">
                            <span className="block text-sm font-medium truncate">{acct?.dealer || k}</span>
                            {location && (
                              <span className="block text-[11px] text-[var(--muted-foreground)] truncate">{location}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  {isAdmin && selectedAccountName && (
                    <p className="text-xs text-[var(--muted-foreground)] mb-3">
                      Creating for: <span className="font-medium text-[var(--foreground)]">{selectedAccountName}</span>
                    </p>
                  )}
                  <p className="text-sm text-[var(--muted-foreground)] mb-4">Choose how you&apos;d like to build your template:</p>
                  <div className="grid grid-cols-3 gap-3">
                    {/* From Library */}
                    <button
                      onClick={() => setLibraryPickerMode(true)}
                      className="group flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-[var(--border)] hover:border-[var(--primary)] bg-[var(--card)] hover:bg-[var(--primary)]/5 transition-all text-center"
                    >
                      <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center group-hover:bg-[var(--primary)]/20 transition-colors">
                        <BookOpenIcon className="w-6 h-6 text-[var(--primary)]" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold mb-1">From Library</h4>
                        <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                          Start from a library template
                        </p>
                      </div>
                    </button>

                    {/* Drag & Drop */}
                    <button
                      onClick={() => handleCreateChoice('visual')}
                      className="group flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-[var(--border)] hover:border-[var(--primary)] bg-[var(--card)] hover:bg-[var(--primary)]/5 transition-all text-center"
                    >
                      <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center group-hover:bg-[var(--primary)]/20 transition-colors">
                        <CursorArrowRaysIcon className="w-6 h-6 text-[var(--primary)]" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Drag & Drop</h4>
                        <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                          Visual builder with sections
                        </p>
                      </div>
                    </button>

                    {/* HTML Editor */}
                    <button
                      onClick={() => handleCreateChoice('code')}
                      className="group flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-[var(--border)] hover:border-[var(--primary)] bg-[var(--card)] hover:bg-[var(--primary)]/5 transition-all text-center"
                    >
                      <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center group-hover:bg-[var(--primary)]/20 transition-colors">
                        <CodeBracketIcon className="w-6 h-6 text-[var(--primary)]" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold mb-1">HTML Editor</h4>
                        <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                          Write or paste raw HTML
                        </p>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* ── Delete Confirmation Modal ── */}
      {deleteTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in" onClick={() => setDeleteTemplate(null)}>
          <div className="glass-modal w-[420px]" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <h3 className="text-base font-semibold">Delete Template</h3>
            </div>
            <div className="p-5">
              <p className="text-sm text-[var(--foreground)] mb-1">
                Are you sure you want to delete <strong>{deleteTemplate.name}</strong>?
              </p>
              {isAdmin && (
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  Account: {accounts[deleteTemplate.accountKey]?.dealer || deleteTemplate.accountKey}
                </p>
              )}
              {deleteTemplate.remoteId && (
                <p className="text-xs text-[var(--muted-foreground)] mt-3">
                  This template is synced with {providerLabel(deleteTemplate.provider)}. You can delete it locally only, or also remove it from the connected platform.
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)]">
              <button
                onClick={() => setDeleteTemplate(null)}
                className="px-4 py-2 text-sm font-medium text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(false)}
                className="px-4 py-2 text-sm font-medium text-red-400 border border-red-400/30 rounded-lg hover:bg-red-500/10 transition-colors"
              >
                Delete Locally
              </button>
              {deleteTemplate.remoteId && (
                <button
                  onClick={() => handleDelete(true)}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                >
                  Delete Everywhere
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Preview Modal ── */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in" onClick={() => setPreviewTemplate(null)}>
          <div className="glass-modal w-[720px] h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
              <div className="min-w-0">
                <h3 className="text-base font-semibold truncate">{previewTemplate.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <ProviderPill provider={previewTemplate.provider} />
                  {isAdmin && <AccountPill acctKey={previewTemplate.accountKey} accounts={accounts} />}
                  {previewTemplate.subject && (
                    <span className="text-[10px] text-[var(--muted-foreground)] truncate">
                      Subject: {previewTemplate.subject}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => { setPreviewTemplate(null); navigateToEditor(previewTemplate.id); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--primary)] border border-[var(--primary)]/30 rounded-lg hover:bg-[var(--primary)]/5 transition-colors"
                >
                  <PencilSquareIcon className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => setPreviewTemplate(null)} className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-[var(--muted)]">
              {previewTemplate.html && (previewTemplate.html.trim().startsWith('<!') || previewTemplate.html.trim().startsWith('<html')) ? (
                <iframe
                  srcDoc={previewTemplate.html}
                  className="w-full h-full border-0"
                  style={{ minHeight: '500px' }}
                  title={`Preview: ${previewTemplate.name}`}
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="flex items-center justify-center h-64 text-[var(--muted-foreground)]">
                  <div className="text-center">
                    <EnvelopeIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No preview available</p>
                    <p className="text-xs mt-1">Open the template in the editor to generate a preview.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
