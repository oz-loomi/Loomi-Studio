'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from '@/contexts/account-context';
import { AdminOnly } from '@/components/route-guard';
import { CampaignPageAnalytics } from '@/components/campaigns/campaign-page-analytics';
import { CampaignPageList, type AccountMeta } from '@/components/campaigns/campaign-page-list';
import type { CampaignFilterState, CampaignFilterOptions } from '@/components/filters/campaign-toolbar';
import { CampaignFilterSidebar } from '@/components/filters/campaign-filter-sidebar';
import { DashboardToolbar, type CustomDateRange } from '@/components/filters/dashboard-toolbar';
import { DEFAULT_DATE_RANGE, getDateRangeBounds, type DateRangeKey } from '@/lib/date-ranges';
import { formatInlineEngagement } from '@/lib/campaign-engagement';
import { resolveAccountLocationId, resolveAccountProvider } from '@/lib/account-resolvers';
import { providerDisplayName } from '@/lib/esp/provider-display';
import {
  getCampaignCreateLinks,
  getCampaignStatsUrl,
  type CampaignCreateLinks,
} from '@/lib/esp/provider-links';
import {
  PaperAirplaneIcon,
  EnvelopeIcon,
  DevicePhoneMobileIcon,
  FunnelIcon,
  EyeIcon,
  XMarkIcon,
  ChartBarIcon,
  PlusIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { getAccountOems, industryHasBrands } from '@/lib/oems';
import { FlowIcon } from '@/components/icon-map';

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

interface AccountData {
  dealer: string;
  category?: string;
  oem?: string;
  oems?: string[];
  espProvider?: string;
  activeEspProvider?: string;
  activeLocationId?: string | null;
  state?: string;
  city?: string;
  storefrontImage?: string;
  logos?: { light?: string; dark?: string; white?: string; black?: string };
}

// ── Helpers ──

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function resolveAccountLabel(
  accountKey: string,
  accountNames: Record<string, string>,
  accountMeta: Record<string, AccountMeta>,
): string {
  return accountNames[accountKey] || accountMeta[accountKey]?.dealer || accountKey;
}

function campaignAccountKey(campaign: Campaign): string | null {
  return campaign.accountKey || null;
}

function getCampaignDate(campaign: Campaign): Date | null {
  const raw =
    campaign.sentAt ||
    campaign.scheduledAt ||
    campaign.updatedAt ||
    campaign.createdAt;

  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function inRange(campaign: Campaign, start: Date, end: Date): boolean {
  const date = getCampaignDate(campaign);
  if (!date) return false;
  const value = date.getTime();
  return value >= start.getTime() && value <= end.getTime();
}

function withCampaignErrorHint(message: string): string {
  if (
    message.includes('not yet supported by the IAM Service') ||
    message.includes('emails/schedule.readonly') ||
    message.includes('not authorized')
  ) {
    return `${message} Reconnect this account's integration to grant campaign schedule scope.`;
  }
  return message;
}

function normalizeCampaignStatus(status: string): string {
  const s = status.toLowerCase().trim();
  if (s.includes('complete') || s.includes('deliver') || s.includes('finish') || s.includes('sent')) return 'sent';
  if (s.includes('active') || s.includes('sched') || s.includes('queue') || s.includes('start') || s.includes('running') || s.includes('progress')) return 'scheduled';
  if (s.includes('draft')) return 'draft';
  if (s.includes('pause')) return 'paused';
  if (s.includes('stop') || s.includes('cancel') || s.includes('inactive')) return 'cancelled';
  return s || 'unknown';
}

function formatCampaignDate(date?: string): string {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getCampaignLastUpdatedDate(campaign: Campaign): string {
  return formatCampaignDate(campaign.updatedAt || campaign.createdAt);
}

// ── Inner Page ──

function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});
  const [accountMeta, setAccountMeta] = useState<Record<string, AccountMeta>>({});
  const [accountProviders, setAccountProviders] = useState<Record<string, string>>({});
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRangeKey>(DEFAULT_DATE_RANGE);
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);

  // Filter state — lifted to page level
  const [filters, setFilters] = useState<CampaignFilterState>({
    account: [],
    status: [],
    oem: [],
    industry: [],
  });
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const createMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [campaignHttp, accountsHttp] = await Promise.all([
          fetch('/api/esp/campaigns/aggregate'),
          fetch('/api/accounts'),
        ]);
        const campaignRes = await campaignHttp.json().catch(() => ({}));
        const accountsRes = await accountsHttp.json().catch(() => ({}));

        if (cancelled) return;

        if (campaignHttp.ok && Array.isArray(campaignRes.campaigns)) {
          setCampaigns(campaignRes.campaigns);
        } else {
          setCampaignError(
            typeof campaignRes.error === 'string'
              ? withCampaignErrorHint(campaignRes.error)
              : `Failed to fetch campaigns (${campaignHttp.status})`,
          );
        }

        if (
          campaignHttp.ok &&
          campaignRes.errors &&
          typeof campaignRes.errors === 'object' &&
          Object.keys(campaignRes.errors as Record<string, string>).length > 0
        ) {
          const firstError = Object.values(campaignRes.errors as Record<string, string>)[0];
          const msg = withCampaignErrorHint(`Some accounts returned campaign API errors. ${firstError}`);
          setCampaignError((prev) => prev || msg);
        }

        // Build account names from campaign response
        const names: Record<string, string> = {};
        if (campaignRes.perAccount && typeof campaignRes.perAccount === 'object') {
          Object.entries(campaignRes.perAccount).forEach(([key, val]) => {
            if ((val as { dealer: string }).dealer) names[key] = (val as { dealer: string }).dealer;
          });
        }
        setAccountNames(names);

        // Build account metadata from accounts API
        const meta: Record<string, AccountMeta> = {};
        const providers: Record<string, string> = {};
        if (accountsRes && typeof accountsRes === 'object') {
          Object.entries(accountsRes).forEach(([key, acct]) => {
            const a = acct as AccountData;
            const accountOems = getAccountOems(a);
            meta[key] = {
              dealer: a.dealer || key,
              category: a.category,
              oem: accountOems[0],
              oems: accountOems,
              state: a.state,
              city: a.city,
              storefrontImage: a.storefrontImage,
              logos: a.logos,
              locationId: resolveAccountLocationId(a) || undefined,
            };
            const preferredProvider = resolveAccountProvider(a, '');
            providers[key] = preferredProvider;
          });
        }
        if (campaignRes.perAccount && typeof campaignRes.perAccount === 'object') {
          Object.entries(campaignRes.perAccount).forEach(([key, val]) => {
            const provider = (val as { provider?: string }).provider;
            if (typeof provider === 'string' && provider.trim()) {
              providers[key] = provider.trim();
            }
          });
        }
        setAccountMeta(meta);
        setAccountProviders(providers);
      } catch {
        setCampaignError('Failed to fetch campaign data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!showCreateMenu) return;
    function handleMouseDown(event: MouseEvent) {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setShowCreateMenu(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showCreateMenu]);

  const bounds = useMemo(
    () =>
      dateRange === 'custom' && customRange
        ? getDateRangeBounds('custom', customRange.start, customRange.end)
        : getDateRangeBounds(dateRange),
    [dateRange, customRange],
  );

  const accessibleAccountKeys = useMemo(() => {
    const fromAggregate = Object.keys(accountNames);
    if (fromAggregate.length > 0) return fromAggregate;
    return Object.keys(accountMeta);
  }, [accountNames, accountMeta]);

  // Derive filter options from all accessible accounts + campaign data
  const filterOptions: CampaignFilterOptions = useMemo(() => {
    const accountsByLabel = new Map<string, CampaignFilterOptions['accounts'][number]>();
    const statuses = new Set<string>();
    const oems = new Set<string>();
    const industries = new Set<string>();

    function upsertAccountOption(label: string, key?: string) {
      if (!label) return;
      const meta = key ? accountMeta[key] : undefined;
      const existing = accountsByLabel.get(label);
      accountsByLabel.set(label, {
        label,
        key: key ?? existing?.key,
        storefrontImage: meta?.storefrontImage ?? existing?.storefrontImage,
        logos: meta?.logos ?? existing?.logos,
        city: meta?.city ?? existing?.city,
        state: meta?.state ?? existing?.state,
      });
    }

    accessibleAccountKeys.forEach((key) => {
      upsertAccountOption(resolveAccountLabel(key, accountNames, accountMeta), key);
      const meta = accountMeta[key];
      if (meta?.category && industryHasBrands(meta.category)) {
        getAccountOems(meta).forEach((brand) => oems.add(brand));
      }
      if (meta?.category) industries.add(meta.category);
    });

    campaigns.forEach((c) => {
      const accountKey = campaignAccountKey(c);
      const name = accountKey
        ? resolveAccountLabel(accountKey, accountNames, accountMeta)
        : c.dealer;
      if (name) upsertAccountOption(name, accountKey || undefined);
      if (c.status) statuses.add(capitalize(normalizeCampaignStatus(c.status)));
    });

    return {
      accounts: [...accountsByLabel.values()].sort((a, b) => a.label.localeCompare(b.label)),
      statuses: [...statuses].sort(),
      oems: [...oems].sort(),
      industries: [...industries].sort(),
    };
  }, [campaigns, accountNames, accountMeta, accessibleAccountKeys]);

  // Apply page-level filters
  const filteredCampaigns = useMemo(() => {
    let result = campaigns;

    if (filters.account.length > 0) {
      result = result.filter(c => {
        const accountKey = campaignAccountKey(c);
        const name = accountKey
          ? resolveAccountLabel(accountKey, accountNames, accountMeta)
          : c.dealer;
        return Boolean(name && filters.account.includes(name));
      });
    }

    if (filters.status.length > 0) {
      result = result.filter(c => filters.status.includes(capitalize(normalizeCampaignStatus(c.status))));
    }

    if (filters.oem.length > 0) {
      result = result.filter(c => {
        const accountKey = campaignAccountKey(c);
        if (!accountKey) return false;
        const meta = accountMeta[accountKey];
        if (meta?.category?.trim().toLowerCase() !== 'automotive') return false;
        const brands = getAccountOems(meta);
        return brands.some((brand) => filters.oem.includes(brand));
      });
    }

    if (filters.industry.length > 0) {
      result = result.filter(c => {
        const accountKey = campaignAccountKey(c);
        if (!accountKey) return false;
        const meta = accountMeta[accountKey];
        return Boolean(meta?.category && filters.industry.includes(meta.category));
      });
    }

    if (bounds.start) {
      result = result.filter(c => inRange(c, bounds.start!, bounds.end));
    }

    return result;
  }, [campaigns, filters, accountNames, accountMeta, bounds]);

  const selectedAccountLabel = filters.account.length === 1 ? filters.account[0] : null;

  const selectedAccountKey = useMemo(() => {
    if (!selectedAccountLabel) return null;
    return (
      accessibleAccountKeys.find(
        (key) => resolveAccountLabel(key, accountNames, accountMeta) === selectedAccountLabel,
      ) || null
    );
  }, [selectedAccountLabel, accessibleAccountKeys, accountNames, accountMeta]);

  const inferredProvider = useMemo(() => {
    const providers = new Set(
      accessibleAccountKeys
        .map((key) => accountProviders[key])
        .filter((provider): provider is string => Boolean(provider && provider.trim())),
    );
    if (providers.size === 1) return [...providers][0];
    return null;
  }, [accessibleAccountKeys, accountProviders]);

  const selectedAccountProvider = selectedAccountKey
    ? accountProviders[selectedAccountKey] || null
    : null;
  const campaignBuilderProvider = selectedAccountProvider || inferredProvider;
  const campaignBuilderLabel = providerDisplayName(campaignBuilderProvider);
  const selectedAccountLocationId =
    (selectedAccountKey && accountMeta[selectedAccountKey]?.locationId) || null;
  const createCampaignLinks = getCampaignCreateLinks(campaignBuilderProvider, selectedAccountLocationId);

  function openCreateCampaignInProvider(target: keyof CampaignCreateLinks) {
    setShowCreateMenu(false);
    const href = createCampaignLinks[target];
    if (!href) {
      setCampaignError(`${campaignBuilderLabel} campaign builder link is unavailable.`);
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  const campaignEmptyState = selectedAccountLabel
    ? {
        title: `No campaigns found for ${selectedAccountLabel}`,
        subtitle: `Create a campaign in ${providerDisplayName(selectedAccountProvider)} to get started for this account.`,
        actionLabel: createCampaignLinks.email ? `Create in ${providerDisplayName(selectedAccountProvider)}` : undefined,
        actionHref: createCampaignLinks.email || undefined,
      }
    : filters.account.length > 1
      ? {
          title: 'No campaigns found for selected accounts',
          subtitle: 'Create campaigns in each account\'s connected platform to get started.',
        }
    : null;

  const adminEmptyTitle =
    campaigns.length === 0
      ? 'No campaign data yet'
      : 'No campaigns match current filters';
  const adminEmptySubtitle =
    campaigns.length === 0
      ? 'Accounts may need to reconnect their integration with campaign scopes'
      : 'Try expanding the selected account/date/status/industry filters.';

  return (
    <div>
      {/* Sticky header with title + filters */}
      <div className="page-sticky-header mb-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <PaperAirplaneIcon className="w-7 h-7 text-[var(--primary)]" />
            <div>
              <h2 className="text-2xl font-bold">Campaigns</h2>
              <p className="text-[var(--muted-foreground)] text-sm mt-0.5">
                Email + SMS/MMS campaigns across all accounts
                {filteredCampaigns.length !== campaigns.length && (
                  <span className="ml-1 tabular-nums">
                    · {filteredCampaigns.length} / {campaigns.length}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => setFiltersCollapsed((prev) => !prev)}
              className="inline-flex items-center gap-2 h-10 px-3 text-sm rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)] transition-colors"
              aria-pressed={!filtersCollapsed}
            >
              <FunnelIcon className="w-4 h-4" />
              {filtersCollapsed ? 'Show Filters' : 'Hide Filters'}
            </button>
            <DashboardToolbar
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
            />
            <div ref={createMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setShowCreateMenu((prev) => !prev)}
                className="inline-flex items-center gap-2 h-10 px-4 text-sm rounded-lg border border-[var(--primary)] bg-[var(--primary)]/90 text-white hover:bg-[var(--primary)] transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Create Campaign
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${showCreateMenu ? 'rotate-180' : ''}`} />
              </button>

              {showCreateMenu && (
                <div className="absolute top-full right-0 mt-2 z-[90] glass-dropdown min-w-[320px] p-1.5 shadow-lg">
                  <button
                    type="button"
                    onClick={() => openCreateCampaignInProvider('email')}
                    disabled={!createCampaignLinks.email}
                    className="w-full text-left px-3 py-2.5 text-xs rounded-lg text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="inline-flex items-center gap-2 font-medium">
                      <EnvelopeIcon className="w-3.5 h-3.5" />
                      Email Blast
                    </span>
                    <span className="block text-[10px] text-[var(--muted-foreground)] mt-1">
                      Send a one-time bulk email campaign.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openCreateCampaignInProvider('text')}
                    disabled={!createCampaignLinks.text}
                    className="w-full text-left px-3 py-2.5 text-xs rounded-lg text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="inline-flex items-center gap-2 font-medium">
                      <DevicePhoneMobileIcon className="w-3.5 h-3.5" />
                      Text Blast
                    </span>
                    <span className="block text-[10px] text-[var(--muted-foreground)] mt-1">
                      Send a one-time bulk SMS/MMS message.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openCreateCampaignInProvider('drip')}
                    disabled={!createCampaignLinks.drip}
                    className="w-full text-left px-3 py-2.5 text-xs rounded-lg text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="inline-flex items-center gap-2 font-medium">
                      <FlowIcon className="w-3.5 h-3.5" />
                      Drip Campaign
                    </span>
                    <span className="block text-[10px] text-[var(--muted-foreground)] mt-1">
                      Build a multi-step automated workflow sequence.
                    </span>
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
      <div className="w-full max-w-[1600px] flex flex-col xl:flex-row gap-4 items-start">
        {!filtersCollapsed && (
          <CampaignFilterSidebar
            inline
            className="w-full xl:w-[320px] xl:flex-shrink-0"
            filters={filters}
            onFiltersChange={setFilters}
            options={filterOptions}
          />
        )}

        <div className="w-full max-w-[1250px] flex-1 min-w-0">
          {campaignError && (
            <div className="px-4 py-3 mb-4 rounded-xl border border-red-500/20 bg-red-500/10 text-sm text-red-300">
              {campaignError}
            </div>
          )}


          <div className="space-y-6">
            <CampaignPageAnalytics
              campaigns={filteredCampaigns}
              loading={loading}
              showAccountBreakdown
              accountNames={accountNames}
              emptyTitle={adminEmptyTitle}
              emptySubtitle={adminEmptySubtitle}
            />

            <CampaignPageList
              campaigns={filteredCampaigns}
              loading={loading}
              accountNames={accountNames}
              accountMeta={accountMeta}
              accountProviders={accountProviders}
              emptyState={campaignEmptyState}
            />
          </div>
        </div>
      </div>

    </div>
  );
}

// ── Account Campaigns Page (single-account, read-only) ──

function AccountCampaignsPage() {
  const { accountKey, accountData } = useAccount();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeKey>(DEFAULT_DATE_RANGE);
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const createMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!accountKey) return;

    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/esp/campaigns?accountKey=${encodeURIComponent(accountKey!)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (res.ok && Array.isArray(data.campaigns)) {
          setCampaigns(data.campaigns);
        } else {
          setApiError(
            typeof data.error === 'string'
              ? withCampaignErrorHint(data.error)
              : `Failed to fetch campaigns (${res.status})`,
          );
        }
      } catch {
        if (!cancelled) setApiError('Failed to fetch campaigns.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [accountKey]);

  useEffect(() => {
    if (!showCreateMenu) return;
    function handleMouseDown(event: MouseEvent) {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setShowCreateMenu(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showCreateMenu]);

  const bounds = useMemo(
    () =>
      dateRange === 'custom' && customRange
        ? getDateRangeBounds('custom', customRange.start, customRange.end)
        : getDateRangeBounds(dateRange),
    [dateRange, customRange],
  );

  const visibleCampaigns = useMemo(
    () =>
      campaigns.filter((c) => {
        const status = normalizeCampaignStatus(c.status);
        return status === 'scheduled' || status === 'sent';
      }),
    [campaigns],
  );

  const dateFiltered = useMemo(() => {
    let result = visibleCampaigns;
    if (bounds.start) {
      result = result.filter(c => inRange(c, bounds.start!, bounds.end));
    }
    return result;
  }, [visibleCampaigns, bounds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return dateFiltered;
    const q = search.toLowerCase();
    return dateFiltered.filter((c) => c.name.toLowerCase().includes(q));
  }, [dateFiltered, search]);

  const accountEmptyTitle =
    visibleCampaigns.length === 0
      ? 'No scheduled or sent campaigns yet'
      : 'No campaigns match this date range';
  const accountEmptySubtitle =
    visibleCampaigns.length === 0
      ? 'Scheduled and sent campaigns will appear here.'
      : 'Try expanding the selected date range.';

  const dealerName = accountData?.dealer || 'Your Account';
  const accountProvider = resolveAccountProvider(accountData, '');
  const accountLocationId = resolveAccountLocationId(accountData);
  const accountProviderLabel = providerDisplayName(accountProvider);
  const accountCampaignLinks = getCampaignCreateLinks(
    accountProvider,
    accountLocationId,
  );

  function openAccountCreateCampaignInProvider(target: keyof CampaignCreateLinks) {
    setShowCreateMenu(false);
    const href = accountCampaignLinks[target];
    if (!href) {
      setApiError(`${accountProviderLabel} campaign builder link is unavailable.`);
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  async function openAccountPreview(campaign: Campaign) {
    setPreviewCampaign(campaign);
    setPreviewHtml('');
    setPreviewError(null);
    setPreviewLoading(true);

    try {
      const scheduleId = campaign.scheduleId || campaign.id;
      if (!accountKey || !scheduleId) {
        throw new Error('Preview is unavailable for this campaign.');
      }

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

      const html = typeof data.html === 'string' ? data.html : '';
      if (!html.trim()) {
        throw new Error('Preview HTML is unavailable for this campaign.');
      }
      setPreviewHtml(html);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to load preview.');
    } finally {
      setPreviewLoading(false);
    }
  }


  return (
    <div>
      {/* Sticky header */}
      <div className="page-sticky-header mb-8">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <PaperAirplaneIcon className="w-7 h-7 text-[var(--primary)]" />
            <div>
              <h2 className="text-2xl font-bold">Campaigns</h2>
              <p className="text-[var(--muted-foreground)] text-sm mt-0.5">
                Email + SMS/MMS campaigns for {dealerName}
              </p>
            </div>
          </div>

          <div ref={createMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowCreateMenu((prev) => !prev)}
              className="inline-flex items-center gap-2 h-10 px-4 text-sm rounded-lg border border-[var(--primary)] bg-[var(--primary)]/90 text-white hover:bg-[var(--primary)] transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Create Campaign
              <ChevronDownIcon className={`w-4 h-4 transition-transform ${showCreateMenu ? 'rotate-180' : ''}`} />
            </button>

            {showCreateMenu && (
              <div className="absolute top-full right-0 mt-2 z-[90] glass-dropdown min-w-[320px] p-1.5 shadow-lg">
                <button
                  type="button"
                  onClick={() => openAccountCreateCampaignInProvider('email')}
                  disabled={!accountCampaignLinks.email}
                  className="w-full text-left px-3 py-2.5 text-xs rounded-lg text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="inline-flex items-center gap-2 font-medium">
                    <EnvelopeIcon className="w-3.5 h-3.5" />
                    Email Blast
                  </span>
                  <span className="block text-[10px] text-[var(--muted-foreground)] mt-1">
                    Send a one-time bulk email campaign.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openAccountCreateCampaignInProvider('text')}
                  disabled={!accountCampaignLinks.text}
                  className="w-full text-left px-3 py-2.5 text-xs rounded-lg text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="inline-flex items-center gap-2 font-medium">
                    <DevicePhoneMobileIcon className="w-3.5 h-3.5" />
                    Text Blast
                  </span>
                  <span className="block text-[10px] text-[var(--muted-foreground)] mt-1">
                    Send a one-time bulk SMS/MMS message.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openAccountCreateCampaignInProvider('drip')}
                  disabled={!accountCampaignLinks.drip}
                  className="w-full text-left px-3 py-2.5 text-xs rounded-lg text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="inline-flex items-center gap-2 font-medium">
                    <FlowIcon className="w-3.5 h-3.5" />
                    Drip Campaign
                  </span>
                  <span className="block text-[10px] text-[var(--muted-foreground)] mt-1">
                    Build a multi-step automated workflow sequence.
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="w-full max-w-[1250px]">
        {/* Analytics */}
        <div className="space-y-6">
          {apiError && (
            <div className="px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/10 text-sm text-red-300">
              {apiError}
            </div>
          )}

          <CampaignPageAnalytics
            campaigns={dateFiltered}
            loading={loading}
            showAccountBreakdown={false}
            accountNames={{}}
            emptyTitle={accountEmptyTitle}
            emptySubtitle={accountEmptySubtitle}
          />

          {/* Search + List */}
          <div>
            <div className="mb-4 flex items-center gap-3 flex-wrap">
              <DashboardToolbar
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                customRange={customRange}
                onCustomRangeChange={setCustomRange}
              />
              {dateFiltered.length > 5 && (
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search campaigns..."
                  className="w-full max-w-xs text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
                />
              )}
            </div>

            {loading ? (
              <div className="text-[var(--muted-foreground)] text-sm py-8 text-center">Loading campaigns...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-[var(--border)] rounded-xl">
                <PaperAirplaneIcon className="w-8 h-8 mx-auto mb-3 text-[var(--muted-foreground)]" />
                <p className="text-[var(--muted-foreground)] text-sm">
                  {search ? 'No campaigns match your search.' : 'No campaigns found for this account.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {filtered.map((c) => {
                  const normalizedStatus = normalizeCampaignStatus(c.status);
                  const engagementSummary = formatInlineEngagement(c);
                  const showNoEngagementHint = normalizedStatus === 'sent' && !engagementSummary;
                  const isScheduled = normalizedStatus === 'scheduled';

                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-3 glass-card"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{c.name}</p>
                        <p className="text-[11px] text-[var(--muted-foreground)] mt-1">
                          Updated: {getCampaignLastUpdatedDate(c)}
                        </p>
                        {(engagementSummary || showNoEngagementHint) && (
                          <p className="text-[10px] text-[var(--muted-foreground)] mt-1 truncate">
                            {engagementSummary || 'No engagement data yet'}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          isScheduled
                            ? 'bg-blue-500/10 text-blue-500'
                            : 'bg-green-500/10 text-green-500'
                        }`}>
                          {isScheduled ? 'Scheduled' : 'Sent'}
                        </span>
                        <button
                          type="button"
                          onClick={() => openAccountPreview(c)}
                          disabled={!accountKey || !(c.scheduleId || c.id)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-[var(--border)] text-[var(--primary)] hover:border-[var(--primary)] hover:bg-[var(--primary)]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          aria-label="Preview campaign email"
                          title="Preview campaign email"
                        >
                          <EyeIcon className="w-4 h-4" />
                        </button>
                        {(() => {
                          if (normalizedStatus !== 'sent') return null;
                          const statsUrl = getCampaignStatsUrl({
                            provider: c.provider || accountProvider,
                            locationId: c.locationId || accountLocationId,
                            scheduleId: c.scheduleId || c.id,
                            bulkRequestId: c.bulkRequestId || null,
                          });
                          if (!statsUrl) return null;
                          return (
                            <a
                              href={statsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-[var(--border)] text-[var(--primary)] hover:border-[var(--primary)] hover:bg-[var(--primary)]/10 transition-colors"
                              aria-label="View analytics"
                              title="View analytics"
                            >
                              <ChartBarIcon className="w-4 h-4" />
                            </a>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <p className="text-xs text-[var(--muted-foreground)] mt-3">
                {filtered.length} campaign{filtered.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
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
              <button
                type="button"
                onClick={() => setPreviewCampaign(null)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--primary)] transition-colors"
                aria-label="Close preview"
              >
                <XMarkIcon className="w-4.5 h-4.5" />
              </button>
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

    </div>
  );
}

// ── Exported Page ──

export default function CampaignsPage() {
  const { isAdmin, isAccount } = useAccount();

  if (isAdmin) {
    return (
      <AdminOnly>
        <AdminCampaignsPage />
      </AdminOnly>
    );
  }

  if (isAccount) {
    return <AccountCampaignsPage />;
  }

  return null;
}
