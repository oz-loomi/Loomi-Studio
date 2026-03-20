'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import {
  MagnifyingGlassIcon,
  ArrowTopRightOnSquareIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
  EllipsisHorizontalIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  PauseCircleIcon,
  XCircleIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';
import { AccountAvatar as SharedAccountAvatar } from '@/components/account-avatar';
import { useLoomiDialog } from '@/contexts/loomi-dialog-context';
import { getCampaignEditUrl, getCampaignStatsUrl } from '@/lib/esp/provider-links';
import { resolveLocationId, resolveProviderId } from '@/lib/esp/provider-resolution';

// ── Types ──

interface Campaign {
  id: string;
  campaignId?: string;
  scheduleId?: string;
  name: string;
  status: string;
  provider?: string;
  createdAt?: string;
  updatedAt?: string;
  scheduledAt?: string;
  sentAt?: string;
  sentCount?: number;
  locationId?: string;
  accountKey?: string;
  dealer?: string;
  bulkRequestId?: string;
  parentId?: string;
}

export interface AccountMeta {
  dealer: string;
  category?: string;
  oem?: string;
  oems?: string[];
  state?: string;
  city?: string;
  locationId?: string;
  storefrontImage?: string;
  logos?: { light?: string; dark?: string; white?: string; black?: string };
  accountRepId?: string | null;
  accountRepName?: string | null;
  accountRepEmail?: string | null;
}

interface CampaignPageListProps {
  campaigns: Campaign[];
  loading?: boolean;
  accountNames?: Record<string, string>;
  accountMeta?: Record<string, AccountMeta>;
  accountProviders?: Record<string, string>;
  emptyState?: {
    title: string;
    subtitle?: string;
    actionLabel?: string;
    actionHref?: string;
  } | null;
}

interface PreviewPayload {
  previewUrl: string;
  html: string;
}

// ── Provider Deep Link ──

function getCampaignEditId(campaign: Campaign): string | null {
  return campaign.campaignId || campaign.id || null;
}

function getCampaignScheduleId(campaign: Campaign): string | null {
  return campaign.scheduleId || campaign.id || null;
}

function getCampaignKey(campaign: Campaign): string {
  return [
    campaign.accountKey || 'no-account',
    campaign.scheduleId || campaign.id || 'no-id',
    campaign.campaignId || 'no-campaign',
    campaign.createdAt || campaign.updatedAt || 'no-date',
  ].join('|');
}

function campaignAccountKey(campaign: Campaign): string | null {
  return campaign.accountKey || null;
}

// ── Helpers ──

const STATUS_BADGE: Record<string, string> = {
  sent:       'bg-green-500/10 text-green-400',
  scheduled:  'bg-blue-500/10 text-blue-400',
  draft:      'bg-zinc-500/10 text-zinc-400',
  paused:     'bg-orange-500/10 text-orange-400',
  cancelled:  'bg-red-500/10 text-red-400',
};

const STATUS_ICON: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  sent:       CheckCircleIcon,
  scheduled:  ClockIcon,
  draft:      DocumentTextIcon,
  paused:     PauseCircleIcon,
  cancelled:  XCircleIcon,
};

const PAGE_SIZE = 10;

function normalizeStatus(status: string): string {
  const s = status.toLowerCase().trim();
  if (s.includes('complete') || s.includes('deliver') || s.includes('finish') || s.includes('sent')) return 'sent';
  if (s.includes('active') || s.includes('sched') || s.includes('queue') || s.includes('start') || s.includes('running') || s.includes('progress')) return 'scheduled';
  if (s.includes('draft')) return 'draft';
  if (s.includes('pause')) return 'paused';
  if (s.includes('stop') || s.includes('cancel') || s.includes('inactive')) return 'cancelled';
  return s;
}

function statusBadgeClass(status: string): string {
  return STATUS_BADGE[normalizeStatus(status)] || 'bg-zinc-500/10 text-zinc-400';
}

function statusLabel(status: string): string {
  const normalized = normalizeStatus(status);
  if (normalized === 'draft') return 'In Progress';
  const withSpaces = normalized.replace(/_/g, ' ');
  return withSpaces.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getDateTimeParts(dateStr?: string): { date: string; time: string } | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const day = d.getDate();
  const year = d.getFullYear();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return {
    date: `${month} ${day}, ${year}`,
    time,
  };
}

function getTimestamp(dateStr?: string): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function getScheduledTs(campaign: Campaign): number {
  return getTimestamp(campaign.scheduledAt);
}

function getLastUpdatedTs(campaign: Campaign): number {
  return getTimestamp(campaign.updatedAt || campaign.createdAt);
}

function getScheduledDateParts(campaign: Campaign): { date: string; time: string } | null {
  return getDateTimeParts(campaign.scheduledAt);
}

function getLastUpdatedDateParts(campaign: Campaign): { date: string; time: string } | null {
  return getDateTimeParts(campaign.updatedAt || campaign.createdAt);
}

function formatShortDate(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Sort ──

type CampaignSortField = 'status' | 'scheduled' | 'updated';
type SortDir = 'asc' | 'desc';

const STATUS_ORDER: Record<string, number> = {
  sent: 0, scheduled: 1, draft: 2, paused: 3, cancelled: 4,
};

function compareCampaigns(a: Campaign, b: Campaign, field: CampaignSortField, dir: SortDir): number {
  let cmp = 0;
  if (field === 'status') {
    const aOrder = STATUS_ORDER[normalizeStatus(a.status)] ?? 99;
    const bOrder = STATUS_ORDER[normalizeStatus(b.status)] ?? 99;
    cmp = aOrder - bOrder;
  } else if (field === 'scheduled') {
    cmp = getScheduledTs(a) - getScheduledTs(b);
  } else if (field === 'updated') {
    cmp = getLastUpdatedTs(a) - getLastUpdatedTs(b);
  } else {
    cmp = getLastUpdatedTs(a) - getLastUpdatedTs(b);
  }
  return dir === 'desc' ? -cmp : cmp;
}

// ── Account table sort ──

type AccountSortField = 'dealer' | 'campaigns' | 'sent' | 'lastActivity';

interface AccountRow {
  key: string;
  label: string;
  campaigns: Campaign[];
  sentCount: number;
  scheduledCount: number;
  lastActivityTs: number;
  storefrontImage?: string;
  logos?: { light?: string; dark?: string; white?: string; black?: string };
}

function compareAccountRows(a: AccountRow, b: AccountRow, field: AccountSortField, dir: SortDir): number {
  let cmp = 0;
  if (field === 'dealer') {
    cmp = a.label.toLowerCase().localeCompare(b.label.toLowerCase());
  } else if (field === 'campaigns') {
    cmp = a.campaigns.length - b.campaigns.length;
  } else if (field === 'sent') {
    cmp = a.sentCount - b.sentCount;
  } else if (field === 'lastActivity') {
    cmp = a.lastActivityTs - b.lastActivityTs;
  }
  if (cmp === 0) cmp = a.label.toLowerCase().localeCompare(b.label.toLowerCase());
  return dir === 'desc' ? -cmp : cmp;
}

// ── Download helpers ──

function sanitizeFileName(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const safe = trimmed.replace(/[^a-z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return safe || 'campaign-email';
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadServerScreenshot(
  accountKey: string,
  scheduleId: string,
  fileBaseName: string,
): Promise<void> {
  const params = new URLSearchParams({ accountKey, scheduleId });
  const res = await fetch(`/api/esp/campaigns/screenshot?${params.toString()}`);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : `Screenshot failed (${res.status})`,
    );
  }

  const blob = await res.blob();
  if (!blob || blob.size === 0) {
    throw new Error('Screenshot returned empty data');
  }

  downloadBlob(blob, `${sanitizeFileName(fileBaseName)}.png`);
}

// ── Pagination helper ──

function getVisiblePages(currentPage: number, totalPages: number, maxVisible = 5): number[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const halfWindow = Math.floor(maxVisible / 2);
  let start = Math.max(1, currentPage - halfWindow);
  let end = start + maxVisible - 1;
  if (end > totalPages) {
    end = totalPages;
    start = Math.max(1, end - maxVisible + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

// ── Sortable Column Header ──

function SortHeader<F extends string>({
  label,
  field,
  activeField,
  activeDir,
  onToggle,
  className,
}: {
  label: string;
  field: F;
  activeField: F | null;
  activeDir: SortDir;
  onToggle: (f: F) => void;
  className?: string;
}) {
  const isActive = activeField === field;
  return (
    <button
      type="button"
      onClick={() => onToggle(field)}
      className={`inline-flex items-center gap-1 hover:text-[var(--foreground)] transition-colors ${
        isActive ? 'text-[var(--foreground)]' : ''
      } ${className || ''}`}
    >
      {label}
      {isActive ? (
        activeDir === 'desc'
          ? <ChevronDownIcon className="w-2.5 h-2.5" />
          : <ChevronUpIcon className="w-2.5 h-2.5" />
      ) : (
        <ChevronUpDownIcon className="w-2.5 h-2.5 opacity-60" />
      )}
    </button>
  );
}

// ── Campaign Row (table row) ──

function CampaignTableRow({
  item,
  accountMeta,
  accountProviders,
  isMenuOpen,
  downloading,
  onToggleMenu,
  onPreview,
  onDownload,
}: {
  item: Campaign;
  accountMeta?: Record<string, AccountMeta>;
  accountProviders?: Record<string, string>;
  isMenuOpen: boolean;
  downloading: boolean;
  onToggleMenu: (item: Campaign) => void;
  onPreview: (item: Campaign) => void;
  onDownload: (item: Campaign) => void;
}) {
  const accountKey = campaignAccountKey(item);
  const provider = resolveProviderId(item, accountProviders, '');
  const locationId = resolveLocationId(item, accountMeta);
  const providerUrl = getCampaignEditUrl({
    provider,
    locationId,
    editId: getCampaignEditId(item),
  });
  const providerStatsUrl = getCampaignStatsUrl({
    provider,
    locationId,
    scheduleId: getCampaignScheduleId(item),
    bulkRequestId: item.bulkRequestId,
    folderId: item.parentId,
  });
  const normalizedStatus = normalizeStatus(item.status);
  const scheduledParts = getScheduledDateParts(item);
  const updatedParts = getLastUpdatedDateParts(item);
  const StatusIcon = STATUS_ICON[normalizedStatus];
  const canPreview = Boolean(accountKey && getCampaignScheduleId(item));

  return (
    <tr className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)]/50 transition-colors">
      <td className="px-3 py-2.5 align-middle">
        <div className="flex items-center gap-2 min-w-0">
          <EnvelopeIcon className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" />
          <span className="text-sm font-medium truncate">{item.name || '(Untitled)'}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 align-middle">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadgeClass(item.status)}`}>
          {StatusIcon && <StatusIcon className="w-3 h-3" />}
          {statusLabel(item.status)}
        </span>
      </td>
      <td className="px-3 py-2.5 align-middle text-right tabular-nums leading-tight">
        {scheduledParts ? (
          <>
            <span className="block text-xs text-[var(--muted-foreground)]">{scheduledParts.date}</span>
            <span className="block text-[10px] text-[var(--muted-foreground)]">{scheduledParts.time}</span>
          </>
        ) : (
          <span className="text-xs text-[var(--muted-foreground)]">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 align-middle text-right tabular-nums leading-tight">
        {updatedParts ? (
          <>
            <span className="block text-xs text-[var(--muted-foreground)]">{updatedParts.date}</span>
            <span className="block text-[10px] text-[var(--muted-foreground)]">{updatedParts.time}</span>
          </>
        ) : (
          <span className="text-xs text-[var(--muted-foreground)]">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 align-middle">
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <div className="relative">
            <button
              type="button"
              onClick={() => onToggleMenu(item)}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--primary)] transition-colors"
              aria-label="More actions"
            >
              <EllipsisHorizontalIcon className="w-4 h-4" />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-44 glass-dropdown shadow-lg p-1.5">
                {providerUrl ? (
                  <a
                    href={providerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                  >
                    Edit
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg text-[var(--muted-foreground)] opacity-50 cursor-not-allowed"
                  >
                    Edit
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onPreview(item)}
                  disabled={!canPreview}
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Preview Email
                  <EyeIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                </button>

                <button
                  type="button"
                  onClick={() => onDownload(item)}
                  disabled={!canPreview || downloading}
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloading ? 'Downloading...' : 'Download Email'}
                  <ArrowDownTrayIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                </button>

                {normalizedStatus === 'sent' && providerStatsUrl && (
                  <a
                    href={providerStatsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                  >
                    View Analytics
                    <ChartBarIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Pagination UI ──

function PaginationBar({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = 'items',
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  itemLabel?: string;
}) {
  if (totalPages <= 1) return null;
  const showingStart = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingEnd = Math.min(page * pageSize, totalItems);
  const visiblePages = getVisiblePages(page, totalPages);

  return (
    <div className="flex items-center justify-between mt-3">
      <p className="text-xs text-[var(--muted-foreground)]">
        Showing {showingStart}-{showingEnd} of {totalItems} {itemLabel}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="px-2 py-1 text-xs rounded-md border border-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--muted)] transition-colors"
        >
          First
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-2 py-1 text-xs rounded-md border border-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--muted)] transition-colors"
        >
          Prev
        </button>
        {visiblePages.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => onPageChange(pageNumber)}
            className={`px-2 py-1 text-xs rounded-md border transition-colors ${
              pageNumber === page
                ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                : 'border-[var(--border)] hover:bg-[var(--muted)]'
            }`}
          >
            {pageNumber}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="px-2 py-1 text-xs rounded-md border border-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--muted)] transition-colors"
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className="px-2 py-1 text-xs rounded-md border border-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--muted)] transition-colors"
        >
          Last
        </button>
      </div>
    </div>
  );
}

// ── Component ──

export function CampaignPageList({
  campaigns,
  loading,
  accountNames,
  accountMeta,
  accountProviders,
  emptyState,
}: CampaignPageListProps) {
  const { alert } = useLoomiDialog();

  // Search
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Drill-down state: null = accounts table, string = that account's campaigns
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  // Account table state
  const [accountPage, setAccountPage] = useState(1);
  const [accountSortField, setAccountSortField] = useState<AccountSortField>('lastActivity');
  const [accountSortDir, setAccountSortDir] = useState<SortDir>('desc');

  // Campaign table state
  const [campaignPage, setCampaignPage] = useState(1);
  const [campaignSortField, setCampaignSortField] = useState<CampaignSortField | null>(null);
  const [campaignSortDir, setCampaignSortDir] = useState<SortDir>('desc');

  // Menu/preview/download state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewCacheRef = useRef<Map<string, PreviewPayload>>(new Map());

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  // Reset pagination on search change
  useEffect(() => {
    setAccountPage(1);
    setCampaignPage(1);
  }, [debouncedSearch, campaigns.length]);

  // When drilling into an account, reset campaign table state
  function drillInto(accountKey: string) {
    setSelectedAccount(accountKey);
    setCampaignPage(1);
    setCampaignSortField(null);
    setCampaignSortDir('desc');
    setSearch('');
    setOpenMenuId(null);
  }

  function drillOut() {
    setSelectedAccount(null);
    setSearch('');
    setOpenMenuId(null);
  }

  // ── Build account rows ──
  const accountRows: AccountRow[] = useMemo(() => {
    const map = new Map<string, Campaign[]>();
    campaigns.forEach((c) => {
      const key = campaignAccountKey(c) || c.dealer || '_unknown';
      const arr = map.get(key);
      if (arr) arr.push(c);
      else map.set(key, [c]);
    });

    return [...map.entries()].map(([key, items]) => {
      const sentCount = items.filter(c => normalizeStatus(c.status) === 'sent').length;
      const scheduledCount = items.filter(c => normalizeStatus(c.status) === 'scheduled').length;
      const lastActivityTs = Math.max(...items.map(c => getLastUpdatedTs(c)), 0);
      const meta = accountMeta?.[key];
      return {
        key,
        label: accountNames?.[key] || items[0]?.dealer || key,
        campaigns: items,
        sentCount,
        scheduledCount,
        lastActivityTs,
        storefrontImage: meta?.storefrontImage,
        logos: meta?.logos,
      };
    });
  }, [campaigns, accountNames, accountMeta]);

  // ── Accounts table: filter + sort + paginate ──
  const filteredAccountRows = useMemo(() => {
    if (!debouncedSearch) return accountRows;
    const q = debouncedSearch.toLowerCase();
    return accountRows.filter(r => r.label.toLowerCase().includes(q));
  }, [accountRows, debouncedSearch]);

  const sortedAccountRows = useMemo(() => {
    return [...filteredAccountRows].sort((a, b) =>
      compareAccountRows(a, b, accountSortField, accountSortDir),
    );
  }, [filteredAccountRows, accountSortField, accountSortDir]);

  const accountTotalPages = Math.max(1, Math.ceil(sortedAccountRows.length / PAGE_SIZE));

  useEffect(() => {
    if (accountPage > accountTotalPages) setAccountPage(accountTotalPages);
  }, [accountPage, accountTotalPages]);

  const pagedAccountRows = useMemo(() => {
    const start = (accountPage - 1) * PAGE_SIZE;
    return sortedAccountRows.slice(start, start + PAGE_SIZE);
  }, [sortedAccountRows, accountPage]);

  function toggleAccountSort(field: AccountSortField) {
    if (accountSortField === field) {
      setAccountSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setAccountSortField(field);
      setAccountSortDir('asc');
    }
    setAccountPage(1);
  }

  const accountSortIndicator = (field: AccountSortField) => {
    if (accountSortField !== field) return '↕';
    return accountSortDir === 'asc' ? '↑' : '↓';
  };

  // ── Campaign table (drill-down): filter + sort + paginate ──
  const selectedAccountRow = useMemo(
    () => accountRows.find(r => r.key === selectedAccount) || null,
    [accountRows, selectedAccount],
  );

  const selectedCampaigns = useMemo(() => {
    if (!selectedAccountRow) return [];
    let result = selectedAccountRow.campaigns;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q) ||
        statusLabel(c.status).toLowerCase().includes(q),
      );
    }
    if (campaignSortField) {
      result = [...result].sort((a, b) => compareCampaigns(a, b, campaignSortField, campaignSortDir));
    }
    return result;
  }, [selectedAccountRow, debouncedSearch, campaignSortField, campaignSortDir]);

  const campaignTotalPages = Math.max(1, Math.ceil(selectedCampaigns.length / PAGE_SIZE));

  useEffect(() => {
    if (campaignPage > campaignTotalPages) setCampaignPage(campaignTotalPages);
  }, [campaignPage, campaignTotalPages]);

  const pagedCampaigns = useMemo(() => {
    const start = (campaignPage - 1) * PAGE_SIZE;
    return selectedCampaigns.slice(start, start + PAGE_SIZE);
  }, [selectedCampaigns, campaignPage]);

  function toggleCampaignSort(field: CampaignSortField) {
    if (campaignSortField === field) {
      if (campaignSortDir === 'desc') setCampaignSortDir('asc');
      else { setCampaignSortField(null); setCampaignSortDir('desc'); }
    } else {
      setCampaignSortField(field);
      setCampaignSortDir('desc');
    }
  }

  // ── Preview / Download ──

  async function fetchPreviewForCampaign(campaign: Campaign): Promise<PreviewPayload> {
    const accountKey = campaignAccountKey(campaign);
    const scheduleId = getCampaignScheduleId(campaign);
    if (!accountKey || !scheduleId) {
      throw new Error('Preview is unavailable for this campaign.');
    }

    const cacheKey = `${accountKey}|${scheduleId}`;
    const cached = previewCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const res = await fetch(
      `/api/esp/campaigns/preview?accountKey=${encodeURIComponent(accountKey)}&scheduleId=${encodeURIComponent(scheduleId)}`,
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.error === 'string'
          ? data.error
          : `Failed to fetch campaign preview (${res.status})`,
      );
    }

    const payload: PreviewPayload = {
      previewUrl: typeof data.previewUrl === 'string' ? data.previewUrl : '',
      html: typeof data.html === 'string' ? data.html : '',
    };

    if (!payload.html.trim()) {
      throw new Error('Preview HTML is unavailable for this campaign.');
    }

    previewCacheRef.current.set(cacheKey, payload);
    return payload;
  }

  async function handlePreview(campaign: Campaign) {
    setOpenMenuId(null);
    setPreviewCampaign(campaign);
    setPreviewError(null);
    setPreviewHtml('');
    setPreviewUrl('');
    setPreviewLoading(true);

    try {
      const payload = await fetchPreviewForCampaign(campaign);
      setPreviewHtml(payload.html);
      setPreviewUrl(payload.previewUrl);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to load preview.');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleDownload(campaign: Campaign) {
    const key = getCampaignKey(campaign);
    setOpenMenuId(null);
    setDownloadingId(key);
    try {
      const accountKey = campaignAccountKey(campaign);
      const scheduleId = getCampaignScheduleId(campaign);
      if (!accountKey || !scheduleId) {
        throw new Error('Download is unavailable for this campaign.');
      }
      await downloadServerScreenshot(accountKey, scheduleId, campaign.name || 'campaign-email');
    } catch (err) {
      console.error('PNG download failed:', err instanceof Error ? err.message : err);
      await alert({
        title: 'Download Failed',
        message: 'Failed to download campaign email. Please try again.',
      });
    } finally {
      setDownloadingId(null);
    }
  }

  // ── Loading skeleton ──

  if (loading) {
    return (
      <div className="glass-card rounded-xl p-6 animate-pulse">
        <div className="w-40 h-5 bg-[var(--muted)] rounded mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-48 h-4 bg-[var(--muted)] rounded" />
              <div className="w-20 h-4 bg-[var(--muted)] rounded" />
              <div className="flex-1" />
              <div className="w-16 h-4 bg-[var(--muted)] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Render ──

  return (
    <>
      <div className="animate-fade-in-up animate-stagger-3">
        {/* Header bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {selectedAccount && (
              <button
                type="button"
                onClick={drillOut}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                <ChevronLeftIcon className="w-3.5 h-3.5" />
                All Accounts
              </button>
            )}
            <p className="text-sm text-[var(--muted-foreground)]">
              {selectedAccount
                ? (
                  <>
                    <span className="text-[var(--foreground)] font-medium">{selectedAccountRow?.label}</span>
                    {' · '}
                    {selectedCampaigns.length} campaign{selectedCampaigns.length !== 1 ? 's' : ''}
                    {debouncedSearch ? ' found' : ''}
                  </>
                )
                : (
                  <>
                    {sortedAccountRows.length} account{sortedAccountRows.length !== 1 ? 's' : ''}
                    {debouncedSearch ? ' found' : ''}
                    {' · '}
                    {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
                  </>
                )}
            </p>
          </div>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)]" />
            <input
              type="text"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                if (selectedAccount) setCampaignPage(1);
                else setAccountPage(1);
              }}
              placeholder={selectedAccount ? 'Search campaigns...' : 'Search sub-accounts...'}
              className="w-52 pl-8 pr-3 py-1.5 text-xs bg-[var(--input)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>
        </div>

        {/* ── Accounts Table (Level 1) ── */}
        {!selectedAccount && (
          <>
            {sortedAccountRows.length === 0 ? (
              <div className="text-center py-16 text-[var(--muted-foreground)]">
                <p className="text-sm">
                  {debouncedSearch
                    ? 'No sub-accounts match your search.'
                    : (emptyState?.title || 'No campaigns found')}
                </p>
                {!debouncedSearch && emptyState?.subtitle && (
                  <p className="text-xs mt-1">{emptyState.subtitle}</p>
                )}
                {!debouncedSearch && emptyState?.actionHref && emptyState?.actionLabel && (
                  <a
                    href={emptyState.actionHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--primary)] bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 transition-colors"
                  >
                    {emptyState.actionLabel}
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto glass-table">
                <table className="w-full min-w-[600px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[var(--muted)] border-b border-[var(--border)]">
                      <th className="w-12 px-3 py-2"></th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                        <button type="button" onClick={() => toggleAccountSort('dealer')} className="inline-flex items-center gap-1 hover:text-[var(--foreground)] transition-colors">
                          Sub-Account
                          <span className="text-[10px]">{accountSortIndicator('dealer')}</span>
                        </button>
                      </th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                        <button type="button" onClick={() => toggleAccountSort('campaigns')} className="inline-flex items-center gap-1 hover:text-[var(--foreground)] transition-colors">
                          Campaigns
                          <span className="text-[10px]">{accountSortIndicator('campaigns')}</span>
                        </button>
                      </th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                        <button type="button" onClick={() => toggleAccountSort('sent')} className="inline-flex items-center gap-1 hover:text-[var(--foreground)] transition-colors">
                          Sent
                          <span className="text-[10px]">{accountSortIndicator('sent')}</span>
                        </button>
                      </th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                        Scheduled
                      </th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                        <button type="button" onClick={() => toggleAccountSort('lastActivity')} className="inline-flex items-center gap-1 hover:text-[var(--foreground)] transition-colors">
                          Last Activity
                          <span className="text-[10px]">{accountSortIndicator('lastActivity')}</span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedAccountRows.map((row) => (
                      <tr
                        key={row.key}
                        onClick={() => drillInto(row.key)}
                        className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)]/50 transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-2 align-middle">
                          <div className="flex items-center justify-center h-full">
                            <SharedAccountAvatar
                              name={row.label}
                              accountKey={row.key}
                              storefrontImage={row.storefrontImage}
                              logos={row.logos}
                              size={36}
                              className="w-9 h-9 rounded-md object-cover flex-shrink-0 border border-[var(--border)]"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <span className="text-sm font-medium">{row.label}</span>
                        </td>
                        <td className="px-3 py-2 align-middle text-center">
                          <span className="text-xs tabular-nums text-[var(--muted-foreground)]">{row.campaigns.length}</span>
                        </td>
                        <td className="px-3 py-2 align-middle text-center">
                          {row.sentCount > 0 ? (
                            <span className="text-xs tabular-nums text-green-400">{row.sentCount}</span>
                          ) : (
                            <span className="text-xs text-[var(--muted-foreground)]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle text-center">
                          {row.scheduledCount > 0 ? (
                            <span className="text-xs tabular-nums text-blue-400">{row.scheduledCount}</span>
                          ) : (
                            <span className="text-xs text-[var(--muted-foreground)]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle text-right">
                          <span className="text-xs tabular-nums text-[var(--muted-foreground)]">
                            {formatShortDate(row.lastActivityTs)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <PaginationBar
              page={accountPage}
              totalPages={accountTotalPages}
              totalItems={sortedAccountRows.length}
              pageSize={PAGE_SIZE}
              onPageChange={setAccountPage}
              itemLabel="accounts"
            />
          </>
        )}

        {/* ── Campaign Table (Level 2 — drill-down) ── */}
        {selectedAccount && (
          <>
            {selectedCampaigns.length === 0 ? (
              <div className="text-center py-16 text-[var(--muted-foreground)]">
                <p className="text-sm">
                  {debouncedSearch
                    ? 'No campaigns match your search.'
                    : 'No campaigns found for this account.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto glass-table">
                <table className="w-full min-w-[600px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[var(--muted)] border-b border-[var(--border)]">
                      <th className="text-left px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                        Name
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                        <SortHeader label="Status" field="status" activeField={campaignSortField} activeDir={campaignSortDir} onToggle={toggleCampaignSort} />
                      </th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                        <SortHeader label="Scheduled" field="scheduled" activeField={campaignSortField} activeDir={campaignSortDir} onToggle={toggleCampaignSort} />
                      </th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                        <SortHeader label="Last Updated" field="updated" activeField={campaignSortField} activeDir={campaignSortDir} onToggle={toggleCampaignSort} />
                      </th>
                      <th className="w-14 px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCampaigns.map((item) => {
                      const rowKey = getCampaignKey(item);
                      return (
                        <CampaignTableRow
                          key={rowKey}
                          item={item}
                          accountMeta={accountMeta}
                          accountProviders={accountProviders}
                          isMenuOpen={openMenuId === rowKey}
                          downloading={downloadingId === rowKey}
                          onToggleMenu={(campaign) => {
                            const key = getCampaignKey(campaign);
                            setOpenMenuId((prev) => (prev === key ? null : key));
                          }}
                          onPreview={handlePreview}
                          onDownload={handleDownload}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <PaginationBar
              page={campaignPage}
              totalPages={campaignTotalPages}
              totalItems={selectedCampaigns.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCampaignPage}
              itemLabel="campaigns"
            />
          </>
        )}
      </div>

      {/* Preview modal */}
      {previewCampaign && (
        <div
          className="fixed inset-0 z-[130] bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => setPreviewCampaign(null)}
        >
          <div
            className="glass-modal w-[1120px] max-w-[96vw] h-[86vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold truncate">Email Preview</h3>
                <p className="text-xs text-[var(--muted-foreground)] truncate mt-0.5">
                  {previewCampaign.name || 'Untitled campaign'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {previewUrl && (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--primary)] bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 transition-colors"
                  >
                    Open Source
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewCampaign(null)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--primary)] transition-colors"
                  aria-label="Close preview"
                >
                  <XMarkIcon className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-3 overflow-hidden">
              {previewLoading ? (
                <div className="h-full rounded-xl border border-[var(--border)] flex items-center justify-center text-sm text-[var(--muted-foreground)]">
                  Loading preview...
                </div>
              ) : previewError ? (
                <div className="h-full rounded-xl border border-red-500/20 bg-red-500/10 flex items-center justify-center text-sm text-red-300 px-4 text-center">
                  {previewError}
                </div>
              ) : (
                <iframe
                  title="Campaign email preview"
                  srcDoc={previewHtml}
                  sandbox="allow-same-origin"
                  className="w-full h-full rounded-xl border border-[var(--border)] bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
