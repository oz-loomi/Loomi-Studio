'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminOnly } from '@/components/route-guard';
import { useWorkflowsAggregate } from '@/hooks/use-dashboard-data';
import { FlowAnalytics } from '@/components/flows/flow-analytics';
import { FlowList, type AccountMeta } from '@/components/flows/flow-list';
import type { FlowFilterState, FlowFilterOptions } from '@/components/filters/flow-toolbar';
import { FlowFilterSidebar } from '@/components/filters/flow-filter-sidebar';
import {
  ChartBarIcon,
  ListBulletIcon,
  PlusIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { FlowIcon } from '@/components/icon-map';
import { getAccountOems, industryHasBrands } from '@/lib/oems';
import { resolveAccountLocationId, resolveAccountProvider } from '@/lib/account-resolvers';
import { providerDisplayName } from '@/lib/esp/provider-display';
import { getWorkflowHubUrl } from '@/lib/esp/provider-links';

interface Workflow {
  id: string;
  name: string;
  status: string;
  provider?: string;
  locationId?: string;
  createdAt?: string;
  updatedAt?: string;
  accountKey?: string;
  dealer?: string;
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

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function resolveAccountLabel(
  accountKey: string,
  accountNames: Record<string, string>,
  accountMeta: Record<string, AccountMeta>,
): string {
  return accountNames[accountKey] || accountMeta[accountKey]?.dealer || accountKey;
}

function workflowAccountKey(workflow: Workflow): string | null {
  return workflow.accountKey || null;
}

type PageTab = 'analytics' | 'list';

function AdminFlowsPage() {
  const { data: aggData, error: aggError, isLoading: aggLoading } = useWorkflowsAggregate();

  const workflows = (aggData?.workflows ?? []) as Workflow[];
  const flowError = useMemo(() => {
    if (aggError) {
      return aggError instanceof Error ? aggError.message : 'Failed to fetch flow data.';
    }
    if (aggData?.errors && Object.keys(aggData.errors).length > 0) {
      const firstError = Object.values(aggData.errors)[0];
      return `Some accounts returned workflow API errors. ${firstError}`;
    }
    return null;
  }, [aggError, aggData]);

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
  const [activeTab, setActiveTab] = useState<PageTab>('analytics');
  const [sideRailMounted, setSideRailMounted] = useState(false);

  const [filters, setFilters] = useState<FlowFilterState>({
    account: [],
    status: [],
    oem: [],
    industry: [],
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = [filters.account, filters.status, filters.oem, filters.industry]
    .filter((values) => values.length > 0).length;

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
    if (!aggLoading) setLoading(false);
  }, [aggLoading]);

  // Fetch account metadata (separate from SWR-managed workflows)
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

  const accessibleAccountKeys = useMemo(() => {
    const fromAggregate = Object.keys(accountNames);
    if (fromAggregate.length > 0) return fromAggregate;
    return Object.keys(accountMeta);
  }, [accountNames, accountMeta]);

  const filterOptions: FlowFilterOptions = useMemo(() => {
    const accountsByLabel = new Map<string, FlowFilterOptions['accounts'][number]>();
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

    workflows.forEach((workflow) => {
      const accountKey = workflowAccountKey(workflow);
      const label = accountKey
        ? resolveAccountLabel(accountKey, accountNames, accountMeta)
        : workflow.dealer;
      if (label) upsertAccountOption(label, accountKey || undefined);
      if (workflow.status) statuses.add(capitalize(workflow.status));
    });

    return {
      accounts: [...accountsByLabel.values()].sort((a, b) => a.label.localeCompare(b.label)),
      statuses: [...statuses].sort(),
      oems: [...oems].sort(),
      industries: [...industries].sort(),
    };
  }, [workflows, accountNames, accountMeta, accessibleAccountKeys]);

  const filteredWorkflows = useMemo(() => {
    let result = workflows;

    if (filters.account.length > 0) {
      result = result.filter((workflow) => {
        const accountKey = workflowAccountKey(workflow);
        const label = accountKey
          ? resolveAccountLabel(accountKey, accountNames, accountMeta)
          : workflow.dealer;
        return Boolean(label && filters.account.includes(label));
      });
    }

    if (filters.status.length > 0) {
      result = result.filter((workflow) => filters.status.includes(capitalize(workflow.status)));
    }

    if (filters.oem.length > 0) {
      result = result.filter((workflow) => {
        const accountKey = workflowAccountKey(workflow);
        if (!accountKey) return false;
        const meta = accountMeta[accountKey];
        if (meta?.category?.trim().toLowerCase() !== 'automotive') return false;
        const brands = getAccountOems(meta);
        return brands.some((brand) => filters.oem.includes(brand));
      });
    }

    if (filters.industry.length > 0) {
      result = result.filter((workflow) => {
        const accountKey = workflowAccountKey(workflow);
        if (!accountKey) return false;
        const meta = accountMeta[accountKey];
        return Boolean(meta?.category && filters.industry.includes(meta.category));
      });
    }

    return result;
  }, [workflows, filters, accountNames, accountMeta]);

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
  const flowBuilderProvider = selectedAccountProvider || inferredProvider;
  const flowBuilderLabel = providerDisplayName(flowBuilderProvider);
  const selectedAccountLocationId =
    (selectedAccountKey && accountMeta[selectedAccountKey]?.locationId) || null;

  const createFlowHref = getWorkflowHubUrl(flowBuilderProvider, selectedAccountLocationId);

  const flowEmptyState = selectedAccountLabel
    ? {
        title: `No flows found for ${selectedAccountLabel}`,
        subtitle: `Create and manage workflows directly in ${providerDisplayName(selectedAccountProvider)}.`,
        actionLabel: createFlowHref ? `Open ${providerDisplayName(selectedAccountProvider)} Flows` : undefined,
        actionHref: createFlowHref || undefined,
      }
    : filters.account.length > 1
      ? {
          title: 'No flows found for selected sub-accounts',
          subtitle: 'Create and manage workflows directly in each sub-account\'s connected platform.',
        }
      : null;

  return (
    <div>
      <div className="page-sticky-header mb-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <FlowIcon className="w-7 h-7 text-[var(--primary)]" />
            <div>
              <h2 className="text-2xl font-bold">Flows</h2>
              <p className="text-[var(--muted-foreground)] text-sm mt-0.5">
                Workflows across all accounts
                {filteredWorkflows.length !== workflows.length && (
                  <span className="ml-1 tabular-nums">
                    · {filteredWorkflows.length} / {workflows.length}
                  </span>
                )}
              </p>
            </div>
          </div>

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
              <ChartBarIcon className="w-3.5 h-3.5" />
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
              <ListBulletIcon className="w-3.5 h-3.5" />
              Flows
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
            {createFlowHref ? (
              <a
                href={createFlowHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 h-10 px-4 text-sm rounded-lg border border-[var(--primary)] bg-[var(--primary)]/90 text-white hover:bg-[var(--primary)] transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Create Flow in {flowBuilderLabel}
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 h-10 px-4 text-sm rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] opacity-60 cursor-not-allowed"
              >
                <PlusIcon className="w-4 h-4" />
                Flow Builder Unavailable
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={sideRailMounted ? 'grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start' : ''}>
        <div className="min-w-0">
          {flowError && (
            <div className="px-4 py-3 mb-4 rounded-xl border border-red-500/20 bg-red-500/10 text-sm text-red-300">
              {flowError}
            </div>
          )}

          {activeTab === 'analytics' && (
            <FlowAnalytics
              workflows={filteredWorkflows}
              loading={loading}
              showAccountBreakdown
              accountNames={accountNames}
            />
          )}

          {activeTab === 'list' && (
            <FlowList
              workflows={filteredWorkflows}
              loading={loading}
              accountNames={accountNames}
              accountMeta={accountMeta}
              accountProviders={accountProviders}
              emptyState={flowEmptyState}
            />
          )}
        </div>

        {sideRailMounted && (
          <FlowFilterSidebar
            inline
            onClose={() => setFiltersOpen(false)}
            filters={filters}
            onFiltersChange={setFilters}
            options={filterOptions}
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

export default function FlowsPage() {
  return (
    <AdminOnly>
      <AdminFlowsPage />
    </AdminOnly>
  );
}
