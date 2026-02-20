'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from '@/contexts/account-context';
import { AdminOnly } from '@/components/route-guard';
import { FlowAnalytics } from '@/components/flows/flow-analytics';
import { FlowList, type AccountMeta } from '@/components/flows/flow-list';
import type { FlowFilterState, FlowFilterOptions } from '@/components/filters/flow-toolbar';
import { FlowFilterSidebar } from '@/components/filters/flow-filter-sidebar';
import {
  InformationCircleIcon,
  XMarkIcon,
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

function AdminFlowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});
  const [accountMeta, setAccountMeta] = useState<Record<string, AccountMeta>>({});
  const [accountProviders, setAccountProviders] = useState<Record<string, string>>({});
  const [flowError, setFlowError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const [filters, setFilters] = useState<FlowFilterState>({
    account: [],
    status: [],
    oem: [],
    industry: [],
  });
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [workflowHttp, accountsHttp] = await Promise.all([
          fetch('/api/esp/workflows/aggregate'),
          fetch('/api/accounts'),
        ]);
        const workflowRes = await workflowHttp.json().catch(() => ({}));
        const accountsRes = await accountsHttp.json().catch(() => ({}));

        if (cancelled) return;

        if (workflowHttp.ok && Array.isArray(workflowRes.workflows)) {
          setWorkflows(workflowRes.workflows as Workflow[]);
        } else {
          setFlowError(
            typeof workflowRes.error === 'string'
              ? workflowRes.error
              : `Failed to fetch workflows (${workflowHttp.status})`,
          );
        }

        if (
          workflowHttp.ok &&
          workflowRes.errors &&
          typeof workflowRes.errors === 'object' &&
          Object.keys(workflowRes.errors as Record<string, string>).length > 0
        ) {
          const firstError = Object.values(workflowRes.errors as Record<string, string>)[0];
          setFlowError((prev) => prev || `Some accounts returned workflow API errors. ${firstError}`);
        }

        const names: Record<string, string> = {};
        if (workflowRes.perAccount && typeof workflowRes.perAccount === 'object') {
          Object.entries(workflowRes.perAccount).forEach(([key, val]) => {
            const dealer = (val as { dealer?: string }).dealer;
            if (dealer) names[key] = dealer;
          });
        }
        setAccountNames(names);

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
              locationId: resolveAccountLocationId(a) || undefined,
            };
            const preferredProvider = resolveAccountProvider(a, '');
            providers[key] = preferredProvider;
          });
        }
        if (workflowRes.perAccount && typeof workflowRes.perAccount === 'object') {
          Object.entries(workflowRes.perAccount).forEach(([key, val]) => {
            const provider = (val as { provider?: string }).provider;
            if (typeof provider === 'string' && provider.trim()) {
              providers[key] = provider.trim();
            }
          });
        }
        setAccountMeta(meta);
        setAccountProviders(providers);
      } catch {
        setFlowError('Failed to fetch flow data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

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
          title: 'No flows found for selected accounts',
          subtitle: 'Create and manage workflows directly in each account\'s connected ESP.',
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
                ESP workflows across all accounts
                {filteredWorkflows.length !== workflows.length && (
                  <span className="ml-1 tabular-nums">
                    · {filteredWorkflows.length} / {workflows.length}
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

      <div className="w-full max-w-[1600px] flex flex-col xl:flex-row gap-4 items-start">
        {!filtersCollapsed && (
          <FlowFilterSidebar
            inline
            className="w-full xl:w-[320px] xl:flex-shrink-0"
            filters={filters}
            onFiltersChange={setFilters}
            options={filterOptions}
          />
        )}

        <div className="w-full max-w-[1250px] flex-1 min-w-0">
          {flowError && (
            <div className="px-4 py-3 mb-4 rounded-xl border border-red-500/20 bg-red-500/10 text-sm text-red-300">
              {flowError}
            </div>
          )}

          {!bannerDismissed && (
            <div className="flex items-start gap-3 px-4 py-3 mb-6 rounded-xl bg-[var(--primary)]/5 border border-[var(--primary)]/15">
              <InformationCircleIcon className="w-5 h-5 text-[var(--primary)] flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm text-[var(--muted-foreground)]">
                <span className="font-medium text-[var(--foreground)]">Workflow setup is managed in your connected ESP</span>
                {' — '}
                Use <span className="font-medium text-[var(--primary)]">Create Flow in {flowBuilderLabel}</span> to build or publish workflows.
              </div>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                className="flex-shrink-0 mt-0.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                aria-label="Dismiss"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="space-y-6">
            <FlowAnalytics
              workflows={filteredWorkflows}
              loading={loading}
              showAccountBreakdown
              accountNames={accountNames}
            />

            <FlowList
              workflows={filteredWorkflows}
              loading={loading}
              accountNames={accountNames}
              accountMeta={accountMeta}
              accountProviders={accountProviders}
              emptyState={flowEmptyState}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FlowsPage() {
  const { isAdmin } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/');
    }
  }, [isAdmin, router]);

  if (!isAdmin) return null;

  return (
    <AdminOnly>
      <AdminFlowsPage />
    </AdminOnly>
  );
}
