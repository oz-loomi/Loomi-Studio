'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from '@/contexts/account-context';
import { useCampaignsAggregate, useWorkflowsAggregate } from '@/hooks/use-dashboard-data';
import { AdminOnly } from '@/components/route-guard';
import { CampaignPageAnalytics } from '@/components/campaigns/campaign-page-analytics';
import { CampaignPageList, type AccountMeta } from '@/components/campaigns/campaign-page-list';
import type { CampaignFilterState, CampaignFilterOptions, RepFilterOption } from '@/components/filters/campaign-toolbar';
import { CampaignFilterSidebar } from '@/components/filters/campaign-filter-sidebar';
import { DashboardToolbar, type CustomDateRange } from '@/components/filters/dashboard-toolbar';
import { DEFAULT_DATE_RANGE, getDateRangeBounds, type DateRangeKey } from '@/lib/date-ranges';
import { resolveAccountLocationId, resolveAccountProvider } from '@/lib/account-resolvers';
import { providerDisplayName } from '@/lib/esp/provider-display';
import {
  getCampaignCreateLinks,
  type CampaignCreateLinks,
} from '@/lib/esp/provider-links';
import {
  PaperAirplaneIcon,
  EnvelopeIcon,
  DevicePhoneMobileIcon,
  FunnelIcon,
  PlusIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { getAccountOems, industryHasBrands } from '@/lib/oems';
import { FlowIcon } from '@/components/icon-map';

// ── Tab Icons (from icons8) ──

function AnalyticsTabIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="currentColor" className={className}>
      <path d="M 64 1 C 56.28 1 50 7.28 50 15 L 50 93 C 50 100.72 56.28 107 64 107 C 71.72 107 78 100.72 78 93 L 78 15 C 78 7.28 71.72 1 64 1 z M 64 7 C 68.41 7 72 10.59 72 15 L 72 93 C 72 97.41 68.41 101 64 101 C 59.59 101 56 97.41 56 93 L 56 15 C 56 10.59 59.59 7 64 7 z M 108 31 C 100.28 31 94 37.28 94 45 L 94 103 C 94 104.66 95.34 106 97 106 C 98.66 106 100 104.66 100 103 L 100 45 C 100 40.59 103.59 37 108 37 C 112.41 37 116 40.59 116 45 L 116 112 C 116 116.41 112.41 120 108 120 L 9 120 C 7.34 120 6 121.34 6 123 C 6 124.66 7.34 126 9 126 L 108 126 C 115.72 126 122 119.72 122 112 L 122 45 C 122 37.28 115.72 31 108 31 z M 20 61 C 12.28 61 6 67.28 6 75 L 6 93 C 6 100.72 12.28 107 20 107 C 27.72 107 34 100.72 34 93 L 34 75 C 34 67.28 27.72 61 20 61 z M 20 67 C 24.41 67 28 70.59 28 75 L 28 93 C 28 97.41 24.41 101 20 101 C 15.59 101 12 97.41 12 93 L 12 75 C 12 70.59 15.59 67 20 67 z" />
    </svg>
  );
}

function ListTabIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="currentColor" className={className}>
      <path d="M 12.988281 6.9882812 A 1.0001 1.0001 0 0 0 12.232422 7.359375 L 7.8398438 12.630859 L 4.5996094 10.199219 A 1.0003907 1.0003907 0 0 0 3.4003906 11.800781 L 7.4003906 14.800781 A 1.0001 1.0001 0 0 0 8.7675781 14.640625 L 13.767578 8.640625 A 1.0001 1.0001 0 0 0 12.988281 6.9882812 z M 18.984375 8.9863281 A 1.0001 1.0001 0 0 0 18 10 L 18 12 C 18 13.093063 18.906937 14 20 14 L 43 14 C 44.093063 14 45 13.093063 45 12 L 45 10 A 1.0001 1.0001 0 1 0 43 10 L 43 12 L 20 12 L 20 10 A 1.0001 1.0001 0 0 0 18.984375 8.9863281 z M 12.988281 19.988281 A 1.0001 1.0001 0 0 0 12.232422 20.359375 L 7.8398438 25.630859 L 4.5996094 23.199219 A 1.0003907 1.0003907 0 1 0 3.4003906 24.800781 L 7.4003906 27.800781 A 1.0001 1.0001 0 0 0 8.7675781 27.640625 L 13.767578 21.640625 A 1.0001 1.0001 0 0 0 12.988281 19.988281 z M 18.984375 21.986328 A 1.0001 1.0001 0 0 0 18 23 L 18 25 C 18 26.093063 18.906937 27 20 27 L 43 27 C 44.093063 27 45 26.093063 45 25 L 45 23 A 1.0001 1.0001 0 1 0 43 23 L 43 25 L 20 25 L 20 23 A 1.0001 1.0001 0 0 0 18.984375 21.986328 z M 8 33 C 6.7500003 33 5.6852256 33.504756 5.0019531 34.273438 C 4.3186806 35.042119 4 36.027778 4 37 C 4 37.972222 4.3186806 38.957881 5.0019531 39.726562 C 5.6852256 40.495244 6.7500003 41 8 41 C 9.2499997 41 10.314774 40.495244 10.998047 39.726562 C 11.681319 38.957881 12 37.972222 12 37 C 12 36.027778 11.681319 35.042119 10.998047 34.273438 C 10.314774 33.504756 9.2499997 33 8 33 z M 18.984375 34.986328 A 1.0001 1.0001 0 0 0 18 36 L 18 38 C 18 39.093063 18.906937 40 20 40 L 43 40 C 44.093063 40 45 39.093063 45 38 L 45 36 A 1.0001 1.0001 0 1 0 43 36 L 43 38 L 20 38 L 20 36 A 1.0001 1.0001 0 0 0 18.984375 34.986328 z M 8 35 C 8.7499995 35 9.1852261 35.245244 9.5019531 35.601562 C 9.8186802 35.957881 10 36.472222 10 37 C 10 37.527778 9.8186802 38.042119 9.5019531 38.398438 C 9.1852261 38.754756 8.7499995 39 8 39 C 7.2500005 39 6.8147739 38.754756 6.4980469 38.398438 C 6.1813198 38.042119 6 37.527778 6 37 C 6 36.472222 6.1813198 35.957881 6.4980469 35.601562 C 6.8147739 35.245244 7.2500005 35 8 35 z" />
    </svg>
  );
}

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
  accountRepId?: string | null;
  accountRep?: { id: string; name: string; email: string } | null;
}

interface Workflow {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  locationId: string;
  accountKey?: string;
  dealer?: string;
}

type PageTab = 'analytics' | 'list';

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

// ── Inner Page ──

function AdminCampaignsPage() {
  const router = useRouter();
  const { data: aggData, error: aggError, isLoading: aggLoading } = useCampaignsAggregate();
  const { data: wfData, isLoading: wfLoading } = useWorkflowsAggregate();
  const [localError, setLocalError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PageTab>('analytics');
  const [sideRailMounted, setSideRailMounted] = useState(false);

  const campaigns = (aggData?.campaigns ?? []) as Campaign[];
  const campaignError = useMemo(() => {
    if (localError) return localError;
    if (aggError) {
      return withCampaignErrorHint(aggError instanceof Error ? aggError.message : 'Failed to fetch campaign data.');
    }
    if (aggData?.errors && Object.keys(aggData.errors).length > 0) {
      const firstError = Object.values(aggData.errors)[0];
      return withCampaignErrorHint(`Some accounts returned campaign API errors. ${firstError}`);
    }
    const skippedCreds = (aggData?.meta as Record<string, unknown>)?.skippedNoCredentials;
    if (typeof skippedCreds === 'number' && skippedCreds > 0) {
      return `${skippedCreds} sub-account${skippedCreds === 1 ? '' : 's'} skipped — no ESP credentials found. Check that each sub-account has a linked location in its Integration settings.`;
    }
    return null;
  }, [localError, aggError, aggData]);

  const accountNames = useMemo(() => {
    const names: Record<string, string> = {};
    if (aggData?.perAccount) {
      Object.entries(aggData.perAccount).forEach(([key, val]) => {
        if (val.dealer) names[key] = val.dealer;
      });
    }
    return names;
  }, [aggData]);

  const [accountMeta, setAccountMeta] = useState<Record<string, AccountMeta>>({});
  const [accountProviders, setAccountProviders] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRangeKey>(DEFAULT_DATE_RANGE);
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);

  // Filter state — lifted to page level
  const [filters, setFilters] = useState<CampaignFilterState>({
    account: [],
    status: [],
    oem: [],
    industry: [],
    rep: [],
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = [filters.account, filters.status, filters.oem, filters.industry, filters.rep]
    .filter((a) => a.length > 0).length;
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const createMenuRef = useRef<HTMLDivElement | null>(null);

  const workflows = (wfData?.workflows ?? []) as Workflow[];

  // Side-rail mount/unmount (delayed unmount for slide-out animation)
  useEffect(() => {
    if (filtersOpen) {
      setSideRailMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setSideRailMounted(false), 260);
    return () => window.clearTimeout(timer);
  }, [filtersOpen]);

  // Sync loading state with SWR
  useEffect(() => {
    if (!aggLoading && !wfLoading) setLoading(false);
  }, [aggLoading, wfLoading]);

  // Fetch account metadata (separate from SWR-managed campaigns)
  useEffect(() => {
    let cancelled = false;

    async function loadAccountMeta() {
      try {
        const accountsHttp = await fetch('/api/accounts');
        const accountsRes = await accountsHttp.json().catch(() => ({}));

        if (cancelled) return;

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
              accountRepId: a.accountRepId || a.accountRep?.id || null,
              accountRepName: a.accountRep?.name || null,
              accountRepEmail: a.accountRep?.email || null,
            };
            const preferredProvider = resolveAccountProvider(a, '');
            providers[key] = preferredProvider;
          });
        }
        // Merge provider info from aggregate perAccount
        if (aggData?.perAccount) {
          Object.entries(aggData.perAccount).forEach(([key, val]) => {
            if (typeof val.provider === 'string' && val.provider.trim()) {
              providers[key] = val.provider.trim();
            }
          });
        }
        setAccountMeta(meta);
        setAccountProviders(providers);
      } catch {
        // Account meta is non-critical
      }
    }

    loadAccountMeta();
    return () => { cancelled = true; };
  }, [aggData]);

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

    // Build rep options from accountMeta
    const repMap = new Map<string, RepFilterOption>();
    let unassignedRepCount = 0;
    for (const key of accessibleAccountKeys) {
      const m = accountMeta[key];
      const repId = m?.accountRepId;
      if (!repId) { unassignedRepCount++; continue; }
      const label = m.accountRepName?.trim() || m.accountRepEmail || `Rep ${repId.slice(0, 6)}`;
      const existing = repMap.get(repId);
      if (existing) { existing.accountCount++; } else { repMap.set(repId, { id: repId, label, accountCount: 1 }); }
    }
    const reps = [...repMap.values()].sort((a, b) => a.label.localeCompare(b.label));
    if (unassignedRepCount > 0) reps.push({ id: '__unassigned__', label: 'Unassigned', accountCount: unassignedRepCount });

    return {
      accounts: [...accountsByLabel.values()].sort((a, b) => a.label.localeCompare(b.label)),
      statuses: [...statuses].sort(),
      oems: [...oems].sort(),
      industries: [...industries].sort(),
      reps,
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

  // Apply same account/industry/date filters to workflows
  const filteredWorkflows = useMemo(() => {
    let result = workflows;

    if (filters.account.length > 0) {
      result = result.filter(w => {
        const key = w.accountKey;
        const name = key
          ? resolveAccountLabel(key, accountNames, accountMeta)
          : w.dealer;
        return Boolean(name && filters.account.includes(name));
      });
    }

    if (filters.industry.length > 0) {
      result = result.filter(w => {
        if (!w.accountKey) return false;
        const meta = accountMeta[w.accountKey];
        return Boolean(meta?.category && filters.industry.includes(meta.category));
      });
    }

    if (bounds.start) {
      result = result.filter(w => {
        const raw = w.updatedAt || w.createdAt;
        if (!raw) return false;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return false;
        return d.getTime() >= bounds.start!.getTime() && d.getTime() <= bounds.end.getTime();
      });
    }

    return result;
  }, [workflows, filters, accountNames, accountMeta, bounds]);

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

    // For Klaviyo email campaigns, route to the in-app schedule page
    if (target === 'email' && campaignBuilderProvider === 'klaviyo') {
      router.push('/campaigns/schedule');
      return;
    }

    const href = createCampaignLinks[target];
    if (!href) {
      setLocalError(`${campaignBuilderLabel} campaign builder link is unavailable.`);
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
          title: 'No campaigns found for selected sub-accounts',
          subtitle: 'Create campaigns in each sub-account\'s connected platform to get started.',
        }
    : null;

  const adminEmptyTitle =
    campaigns.length === 0
      ? 'No campaign data yet'
      : 'No campaigns match current filters';
  const adminEmptySubtitle =
    campaigns.length === 0
      ? 'Sub-accounts may need to reconnect their integration with campaign scopes'
      : 'Try expanding the selected sub-account/date/status/industry filters.';

  return (
    <div>
      {/* Sticky header with title + centered tabs + controls */}
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

          {/* Centered tab toggle */}
          <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'analytics'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <AnalyticsTabIcon className="w-3.5 h-3.5" />
              Analytics
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'list'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <ListTabIcon className="w-3.5 h-3.5" />
              Campaigns
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => setFiltersOpen((prev) => !prev)}
              className={`inline-flex items-center gap-2 h-10 px-3 text-sm rounded-lg border transition-colors ${
                filtersOpen
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                  : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)]'
              }`}
              aria-pressed={filtersOpen}
            >
              <FunnelIcon className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-[var(--primary)] text-white text-[10px] flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
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
                    disabled={!createCampaignLinks.email && campaignBuilderProvider !== 'klaviyo'}
                    className="w-full text-left px-3 py-2.5 text-xs rounded-lg text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="inline-flex items-center gap-2 font-medium">
                      <EnvelopeIcon className="w-3.5 h-3.5" />
                      Email Blast
                    </span>
                    <span className="block text-[10px] text-[var(--muted-foreground)] mt-1">
                      {campaignBuilderProvider === 'klaviyo'
                        ? 'Build and schedule in Loomi.'
                        : 'Send a one-time bulk email campaign.'}
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

      {/* Dashboard-style grid: content + inline filter side rail */}
      <div className={sideRailMounted ? 'grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start' : ''}>
        {/* Main content column */}
        <div className="min-w-0">
          {campaignError && (
            <div className="px-4 py-3 mb-4 rounded-xl border border-red-500/20 bg-red-500/10 text-sm text-red-300">
              {campaignError}
            </div>
          )}

          {activeTab === 'analytics' && (
            <CampaignPageAnalytics
              campaigns={filteredCampaigns}
              loading={loading}
              showAccountBreakdown
              accountNames={accountNames}
              emptyTitle={adminEmptyTitle}
              emptySubtitle={adminEmptySubtitle}
              dateRange={dateRange}
              customRange={customRange}
              workflows={filteredWorkflows}
            />
          )}

          {activeTab === 'list' && (
            <CampaignPageList
              campaigns={filteredCampaigns}
              loading={loading}
              accountNames={accountNames}
              accountMeta={accountMeta}
              accountProviders={accountProviders}
              emptyState={campaignEmptyState}
            />
          )}
        </div>

        {/* Inline filter side rail */}
        {sideRailMounted && (
          <CampaignFilterSidebar
            inline
            onClose={() => setFiltersOpen(false)}
            filters={filters}
            onFiltersChange={setFilters}
            options={filterOptions}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
            className={`glass-panel glass-panel-strong w-full transition-[opacity,transform,max-height] duration-300 ease-out lg:sticky lg:top-24 lg:w-[360px] ${
              filtersOpen
                ? 'pointer-events-auto max-h-[calc(100vh-8rem)] translate-x-0 opacity-100 animate-slide-in-right'
                : 'pointer-events-none max-h-0 translate-x-4 opacity-0'
            }`}
          />
        )}
      </div>
    </div>
  );
}

// ── Account Campaigns Page (single-account, read-only) ──

function AccountCampaignsPage() {
  const accountRouter = useRouter();
  const { accountKey, accountData } = useAccount();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PageTab>('analytics');
  const [dateRange, setDateRange] = useState<DateRangeKey>(DEFAULT_DATE_RANGE);
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
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

  const accountNotIntegrated = useMemo(() => {
    const message = (apiError || '').toLowerCase();
    const disconnectedConnection = accountData?.activeConnection?.connected === false;
    const missingConnectionMetadata =
      Boolean(accountData) &&
      !accountData?.activeConnection?.connected &&
      !accountData?.activeConnection?.provider &&
      !accountData?.activeEspProvider &&
      !accountData?.espProvider;
    return (
      message.includes('esp not connected') ||
      message.includes('not connected for this account') ||
      message.includes('not integrated') ||
      disconnectedConnection ||
      missingConnectionMetadata
    );
  }, [accountData, apiError]);

  const accountEmptyTitle =
    accountNotIntegrated
      ? 'Account not integrated'
      : visibleCampaigns.length === 0
      ? 'No scheduled or sent campaigns yet'
      : 'No campaigns match this date range';
  const accountEmptySubtitle =
    accountNotIntegrated
      ? 'Connect your ESP integration to view reporting.'
      : visibleCampaigns.length === 0
      ? 'Scheduled and sent campaigns will appear here.'
      : 'Try expanding the selected date range.';

  const dealerName = accountData?.dealer || 'Your Sub-Account';
  const accountProvider = resolveAccountProvider(accountData, '');
  const accountLocationId = resolveAccountLocationId(accountData);
  const accountProviderLabel = providerDisplayName(accountProvider);
  const accountCampaignLinks = getCampaignCreateLinks(
    accountProvider,
    accountLocationId,
  );
  const accountNames = useMemo(
    () => (accountKey ? { [accountKey]: dealerName } : {}),
    [accountKey, dealerName],
  );
  const accountMeta = useMemo<Record<string, AccountMeta>>(() => {
    if (!accountKey) return {};
    const accountOems = getAccountOems(accountData);
    return {
      [accountKey]: {
        dealer: dealerName,
        category: accountData?.category,
        oem: accountOems[0],
        oems: accountOems,
        state: accountData?.state,
        city: accountData?.city,
        storefrontImage: accountData?.storefrontImage,
        logos: accountData?.logos,
        locationId: accountLocationId || undefined,
      },
    };
  }, [accountData, accountKey, accountLocationId, dealerName]);
  const accountProviders = useMemo(
    () => (accountKey && accountProvider ? { [accountKey]: accountProvider } : {}),
    [accountKey, accountProvider],
  );
  const accountListEmptyState = useMemo(
    () => ({
      title: accountEmptyTitle,
      subtitle: accountEmptySubtitle,
      actionLabel: accountNotIntegrated
        ? 'Open Integrations'
        : accountCampaignLinks.email
          ? `Create in ${accountProviderLabel}`
          : undefined,
      actionHref: accountNotIntegrated
        ? '/settings/integrations'
        : accountCampaignLinks.email || undefined,
    }),
    [accountCampaignLinks.email, accountEmptySubtitle, accountEmptyTitle, accountNotIntegrated, accountProviderLabel],
  );

  function openAccountCreateCampaignInProvider(target: keyof CampaignCreateLinks) {
    setShowCreateMenu(false);

    // For Klaviyo email campaigns, route to the in-app schedule page
    if (target === 'email' && accountProvider === 'klaviyo') {
      accountRouter.push('/campaigns/schedule');
      return;
    }

    const href = accountCampaignLinks[target];
    if (!href) {
      setApiError(`${accountProviderLabel} campaign builder link is unavailable.`);
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  return (
    <div>
      {/* Sticky header with title + centered tabs + controls */}
      <div className="page-sticky-header mb-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <PaperAirplaneIcon className="w-7 h-7 text-[var(--primary)]" />
            <div>
              <h2 className="text-2xl font-bold">Campaigns</h2>
              <p className="text-[var(--muted-foreground)] text-sm mt-0.5">
                Email + SMS/MMS campaigns for {dealerName}
                {dateFiltered.length !== visibleCampaigns.length && (
                  <span className="ml-1 tabular-nums">
                    · {dateFiltered.length} / {visibleCampaigns.length}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Centered tab toggle */}
          <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'analytics'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <AnalyticsTabIcon className="w-3.5 h-3.5" />
              Analytics
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'list'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <ListTabIcon className="w-3.5 h-3.5" />
              Campaigns
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
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
                    onClick={() => openAccountCreateCampaignInProvider('email')}
                    disabled={!accountCampaignLinks.email && accountProvider !== 'klaviyo'}
                    className="w-full text-left px-3 py-2.5 text-xs rounded-lg text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="inline-flex items-center gap-2 font-medium">
                      <EnvelopeIcon className="w-3.5 h-3.5" />
                      Email Blast
                    </span>
                    <span className="block text-[10px] text-[var(--muted-foreground)] mt-1">
                      {accountProvider === 'klaviyo'
                        ? 'Build and schedule in Loomi.'
                        : 'Send a one-time bulk email campaign.'}
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
      </div>

      <div className="min-w-0">
        {apiError && !accountNotIntegrated && (
          <div className="px-4 py-3 mb-4 rounded-xl border border-red-500/20 bg-red-500/10 text-sm text-red-300">
            {apiError}
          </div>
        )}

        {activeTab === 'analytics' && (
          <CampaignPageAnalytics
            campaigns={dateFiltered}
            loading={loading}
            showAccountBreakdown={false}
            accountNames={accountNames}
            emptyTitle={accountEmptyTitle}
            emptySubtitle={accountEmptySubtitle}
            dateRange={dateRange}
            customRange={customRange}
          />
        )}

        {activeTab === 'list' && (
          <CampaignPageList
            campaigns={dateFiltered}
            loading={loading}
            accountNames={accountNames}
            accountMeta={accountMeta}
            accountProviders={accountProviders}
            emptyState={accountListEmptyState}
          />
        )}
      </div>
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
