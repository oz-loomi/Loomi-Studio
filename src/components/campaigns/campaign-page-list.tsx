'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  MagnifyingGlassIcon,
  ArrowTopRightOnSquareIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
  PaperAirplaneIcon,
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
import { formatInlineEngagement } from '@/lib/campaign-engagement';
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
  deliveredCount?: number;
  openedCount?: number;
  clickedCount?: number;
  repliedCount?: number;
  bouncedCount?: number;
  failedCount?: number;
  unsubscribedCount?: number;
  openRate?: number;
  clickRate?: number;
  replyRate?: number;
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

const PAGE_SIZE = 25;

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

// ── Sort ──

type SortField = 'status' | 'scheduled' | 'updated';
type SortDir = 'asc' | 'desc';

const STATUS_ORDER: Record<string, number> = {
  sent: 0, scheduled: 1, draft: 2, paused: 3, cancelled: 4,
};

function compareCampaigns(a: Campaign, b: Campaign, field: SortField, dir: SortDir): number {
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

/**
 * Download a high-res PNG screenshot of a campaign email via the server-side
 * Puppeteer screenshot API. Much more reliable than client-side html2canvas.
 */
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

interface CampaignGroup {
  key: string;
  label: string;
  campaigns: Campaign[];
}

function groupByAccount(
  campaigns: Campaign[],
  accountNames?: Record<string, string>,
): CampaignGroup[] {
  const map = new Map<string, Campaign[]>();

  campaigns.forEach((c) => {
    const key = campaignAccountKey(c) || c.dealer || '_unknown';
    const arr = map.get(key);
    if (arr) arr.push(c);
    else map.set(key, [c]);
  });

  return [...map.entries()]
    .map(([key, items]) => ({
      key,
      label:
        (accountNames && accountNames[key]) ||
        items[0]?.dealer ||
        key,
      campaigns: items,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ── Sortable Column Header ──

function SortHeader({
  label,
  field,
  activeField,
  activeDir,
  onToggle,
  className,
}: {
  label: string;
  field: SortField;
  activeField: SortField | null;
  activeDir: SortDir;
  onToggle: (f: SortField) => void;
  className?: string;
}) {
  const isActive = activeField === field;
  return (
    <button
      type="button"
      onClick={() => onToggle(field)}
      className={`inline-flex items-center justify-end gap-1 hover:text-[var(--foreground)] transition-colors ${
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

// ── Account Avatar ──

function AccountAvatar({
  accountKey,
  dealer,
  storefrontImage,
  logos,
}: {
  accountKey: string;
  dealer: string;
  storefrontImage?: string;
  logos?: { light?: string; dark?: string; white?: string; black?: string };
}) {
  return (
    <Link
      href={`/accounts/${accountKey}`}
      className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
      title={`${dealer} — View account`}
      onClick={(e) => e.stopPropagation()}
    >
      <SharedAccountAvatar
        name={dealer}
        accountKey={accountKey}
        storefrontImage={storefrontImage}
        logos={logos}
        size={24}
        className="w-6 h-6 rounded-md object-cover flex-shrink-0 border border-[var(--border)]"
      />
      <span className="text-xs text-[var(--muted-foreground)] truncate">{dealer}</span>
    </Link>
  );
}

// ── Campaign Row ──

function CampaignRow({
  item,
  accountNames,
  accountMeta,
  accountProviders,
  showAccount,
  isMenuOpen,
  downloading,
  onToggleMenu,
  onPreview,
  onDownload,
}: {
  item: Campaign;
  accountNames?: Record<string, string>;
  accountMeta?: Record<string, AccountMeta>;
  accountProviders?: Record<string, string>;
  showAccount: boolean;
  isMenuOpen: boolean;
  downloading: boolean;
  onToggleMenu: (item: Campaign) => void;
  onPreview: (item: Campaign) => void;
  onDownload: (item: Campaign) => void;
}) {
  const accountKey = campaignAccountKey(item);
  const accountName = showAccount
    ? (accountKey && accountNames?.[accountKey]) ||
      item.dealer ||
      accountKey ||
      '—'
    : null;
  const meta = accountKey ? accountMeta?.[accountKey] : undefined;
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
  const engagementSummary = formatInlineEngagement(item);
  const showNoEngagementHint = normalizedStatus === 'sent' && !engagementSummary;
  const StatusIcon = STATUS_ICON[normalizedStatus];
  const canPreview = Boolean(accountKey && getCampaignScheduleId(item));

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--muted)] transition-colors group">
      <span className="flex-1 min-w-0 flex items-center gap-2">
        <EnvelopeIcon className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" />
        <span className="min-w-0">
          <span className="text-sm font-medium truncate block">{item.name || '(Untitled)'}</span>
          {(engagementSummary || showNoEngagementHint) && (
            <span className="text-[10px] text-[var(--muted-foreground)] truncate block mt-0.5">
              {engagementSummary || 'No engagement data yet'}
            </span>
          )}
        </span>
      </span>
      {showAccount && accountKey && (
        <span className="w-36">
          <AccountAvatar
            accountKey={accountKey}
            dealer={accountName || '—'}
            storefrontImage={meta?.storefrontImage}
            logos={meta?.logos}
          />
        </span>
      )}
      <span className="w-20 flex justify-end">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${statusBadgeClass(item.status)}`}>
          {StatusIcon && <StatusIcon className="w-3 h-3" />}
          {normalizedStatus.replace(/_/g, ' ')}
        </span>
      </span>
      <span className="w-36 text-right tabular-nums leading-tight">
        {scheduledParts ? (
          <>
            <span className="block text-xs text-[var(--muted-foreground)]">{scheduledParts.date}</span>
            <span className="block text-[10px] text-[var(--muted-foreground)]">{scheduledParts.time}</span>
          </>
        ) : (
          <span className="block text-xs text-[var(--muted-foreground)]">—</span>
        )}
      </span>
      <span className="w-36 text-right tabular-nums leading-tight">
        {updatedParts ? (
          <>
            <span className="block text-xs text-[var(--muted-foreground)]">{updatedParts.date}</span>
            <span className="block text-[10px] text-[var(--muted-foreground)]">{updatedParts.time}</span>
          </>
        ) : (
          <span className="block text-xs text-[var(--muted-foreground)]">—</span>
        )}
      </span>
      <div className="w-14 flex justify-end gap-1.5">
        <div className="relative" onClick={(e) => e.stopPropagation()}>
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
    </div>
  );
}

// ── Group Header ──

function GroupHeader({
  groupKey,
  label,
  isOpen,
  campaignCount,
  sentCount,
  storefrontImage,
  onToggle,
}: {
  groupKey: string;
  label: string;
  isOpen: boolean;
  campaignCount: number;
  sentCount: number;
  storefrontImage?: string;
  onToggle: () => void;
}) {
  const avatar = (
    <SharedAccountAvatar
      name={label}
      accountKey={groupKey}
      storefrontImage={storefrontImage}
      size={24}
      className="w-6 h-6 rounded-md object-cover flex-shrink-0 border border-[var(--border)]"
    />
  );

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity text-left flex-1 min-w-0"
      >
        <ChevronRightIcon
          className="chevron-icon w-3.5 h-3.5 text-[var(--muted-foreground)] flex-shrink-0"
          data-open={isOpen}
        />
        {avatar}
        <span className="text-sm font-semibold text-[var(--foreground)] truncate">
          {label}
        </span>
        <span className="text-[10px] tabular-nums text-[var(--muted-foreground)] flex-shrink-0">
          {campaignCount} campaign{campaignCount !== 1 ? 's' : ''}
        </span>
        {sentCount > 0 && (
          <span className="text-[10px] tabular-nums text-green-400 flex-shrink-0">
            {sentCount} sent
          </span>
        )}
      </button>
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
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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

  // Apply text search
  const searchedCampaigns = useMemo(() => {
    if (!debouncedSearch) return campaigns;
    const q = debouncedSearch.toLowerCase();
    return campaigns.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.status.toLowerCase().includes(q) ||
      (c.dealer || '').toLowerCase().includes(q)
    );
  }, [campaigns, debouncedSearch]);

  // Apply sorting
  const filteredCampaigns = useMemo(() => {
    if (!sortField) return searchedCampaigns;
    return [...searchedCampaigns].sort((a, b) => compareCampaigns(a, b, sortField, sortDir));
  }, [searchedCampaigns, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / PAGE_SIZE));

  const pagedCampaigns = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredCampaigns.slice(start, start + PAGE_SIZE);
  }, [filteredCampaigns, page]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, campaigns.length]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Group into account sections (use ALL filtered campaigns, not paged)
  const groups = useMemo(
    () => groupByAccount(filteredCampaigns, accountNames),
    [filteredCampaigns, accountNames],
  );

  const hasMultipleAccounts = groups.length > 1;

  function toggleGroup(key: string) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function collapseAll() {
    const next: Record<string, boolean> = {};
    groups.forEach(g => { next[g.key] = true; });
    setCollapsed(next);
  }

  function expandAll() {
    setCollapsed({});
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      if (sortDir === 'desc') setSortDir('asc');
      else { setSortField(null); setSortDir('desc'); }
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

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
      // Fallback: download the HTML file if screenshot fails
      console.error('Screenshot download failed, falling back to HTML:', err instanceof Error ? err.message : err);
      try {
        const payload = await fetchPreviewForCampaign(campaign);
        const htmlBlob = new Blob([payload.html], { type: 'text/html;charset=utf-8' });
        downloadBlob(htmlBlob, `${sanitizeFileName(campaign.name || 'campaign-email')}.html`);
      } catch {
        // If even fallback fails, just alert
        alert('Failed to download campaign email. Please try again.');
      }
    } finally {
      setDownloadingId(null);
    }
  }

  const allCollapsed = groups.length > 0 && groups.every(g => collapsed[g.key]);

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

  return (
    <>
      <div className="glass-card rounded-xl overflow-hidden animate-fade-in-up animate-stagger-3">
        {/* Header + Search */}
        <div className="flex items-center justify-between gap-4 px-4 pt-4 pb-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)]">
            <PaperAirplaneIcon className="w-3.5 h-3.5" />
            Campaigns
            <span className="ml-1 tabular-nums opacity-60">
              {filteredCampaigns.length !== campaigns.length
                ? `${filteredCampaigns.length} / ${campaigns.length}`
                : campaigns.length}
            </span>
            {!hasMultipleAccounts && totalPages > 1 && (
              <span className="ml-1 opacity-60">
                · Page {page} of {totalPages}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Collapse / Expand toggle */}
            {hasMultipleAccounts && (
              <button
                onClick={allCollapsed ? expandAll : collapseAll}
                className="text-[10px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors px-1.5 py-1"
              >
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </button>
            )}

            <div className="relative">
              <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search campaigns..."
                className="w-44 pl-8 pr-3 py-1.5 text-xs rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
            </div>

          </div>
        </div>

        {/* List */}
        <div className="px-4 pb-4">
          {filteredCampaigns.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-[var(--muted-foreground)]">
                {debouncedSearch
                  ? 'No campaigns match your search'
                  : (emptyState?.title || 'No campaigns found')}
              </p>
              {!debouncedSearch && emptyState?.subtitle && (
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  {emptyState.subtitle}
                </p>
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
          ) : hasMultipleAccounts ? (
            /* ── Grouped view ── */
            <div className="space-y-1 mt-1">
              {groups.map((group) => {
                const isOpen = !collapsed[group.key];
                const sentCount = group.campaigns.filter(
                  c => normalizeStatus(c.status) === 'sent'
                ).length;

                return (
                  <div key={group.key}>
                    {/* Group header */}
                    <GroupHeader
                    groupKey={group.key}
                    label={group.label}
                    isOpen={isOpen}
                    campaignCount={group.campaigns.length}
                    sentCount={sentCount}
                    storefrontImage={accountMeta?.[group.key]?.storefrontImage}
                    onToggle={() => toggleGroup(group.key)}
                  />

                    {/* Collapsible content */}
                    <div className="collapsible-wrapper" data-open={isOpen}>
                      <div className="collapsible-inner">
                        {/* Column header */}
                        <div className="flex items-center gap-3 px-3 py-1 ml-5.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                          <span className="flex-1">Name</span>
                          <span className="w-20 text-right">
                            <SortHeader label="STATUS" field="status" activeField={sortField} activeDir={sortDir} onToggle={toggleSort} />
                          </span>
                          <span className="w-36 text-right">
                            <SortHeader label="SCHEDULED" field="scheduled" activeField={sortField} activeDir={sortDir} onToggle={toggleSort} />
                          </span>
                          <span className="w-36 text-right">
                            <SortHeader label="LAST UPDATED" field="updated" activeField={sortField} activeDir={sortDir} onToggle={toggleSort} />
                          </span>
                          <span className="w-14 text-right" />
                        </div>
                        <div className="ml-5.5 divide-y divide-[var(--border)]">
                          {group.campaigns.map((item) => {
                            const rowKey = getCampaignKey(item);
                            return (
                              <CampaignRow
                                key={rowKey}
                                item={item}
                                accountNames={accountNames}
                                accountMeta={accountMeta}
                                accountProviders={accountProviders}
                                showAccount={false}
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
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Flat view (single account or no grouping needed) ── */
            <div className="mt-1">
              <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                <span className="flex-1">Name</span>
                <span className="w-36">Account</span>
                <span className="w-20 text-right">
                  <SortHeader label="STATUS" field="status" activeField={sortField} activeDir={sortDir} onToggle={toggleSort} />
                </span>
                <span className="w-36 text-right">
                  <SortHeader label="SCHEDULED" field="scheduled" activeField={sortField} activeDir={sortDir} onToggle={toggleSort} />
                </span>
                <span className="w-36 text-right">
                  <SortHeader label="LAST UPDATED" field="updated" activeField={sortField} activeDir={sortDir} onToggle={toggleSort} />
                </span>
                <span className="w-14 text-right" />
              </div>
              <div className="divide-y divide-[var(--border)]">
              {pagedCampaigns.map((item) => {
                const rowKey = getCampaignKey(item);
                return (
                  <CampaignRow
                    key={rowKey}
                    item={item}
                    accountNames={accountNames}
                    accountMeta={accountMeta}
                    accountProviders={accountProviders}
                    showAccount={true}
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
              </div>
            </div>
          )}

          {/* Pagination (flat view only — grouped view shows all) */}
          {!hasMultipleAccounts && totalPages > 1 && (
            <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between">
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredCampaigns.length)} of {filteredCampaigns.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

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
