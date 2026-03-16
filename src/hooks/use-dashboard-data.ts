'use client';

import useSWR from 'swr';
import type { NormalizedContact, EspCampaign, EspWorkflow } from '@/lib/esp/types';

// ── Fetcher ──

async function jsonFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      typeof (body as Record<string, unknown>).error === 'string'
        ? ((body as Record<string, unknown>).error as string)
        : `Error ${res.status}`;
    throw new Error(message);
  }
  return res.json();
}

// ── Shared Config ──

const DASHBOARD_SWR_CONFIG = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  dedupingInterval: 60_000,
  errorRetryCount: 1,
} as const;

type DashboardAggregateOptions = {
  enabled?: boolean;
  accountKeys?: string[];
  limitPerAccount?: number;
};

function buildDashboardUrl(path: string, options: DashboardAggregateOptions): string {
  const params = new URLSearchParams();

  if (options.accountKeys && options.accountKeys.length > 0) {
    params.set('accountKeys', options.accountKeys.join(','));
  }
  if (typeof options.limitPerAccount === 'number') {
    params.set('limitPerAccount', String(options.limitPerAccount));
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

// ── Response Types ──

type PerAccountEntry = {
  dealer: string;
  count: number;
  connected: boolean;
  provider: string;
};

export type ContactsAggregateResponse = {
  contacts: (NormalizedContact & { _accountKey?: string; _dealer?: string })[];
  perAccount: Record<string, PerAccountEntry>;
  errors: Record<string, string>;
  meta: { totalContacts: number; accountsFetched: number };
};

export type CampaignsAggregateResponse = {
  campaigns: (EspCampaign & { accountKey: string; dealer: string; provider: string })[];
  perAccount: Record<string, PerAccountEntry>;
  errors: Record<string, string>;
  meta: { totalCampaigns: number; accountsFetched: number };
};

export type WorkflowsAggregateResponse = {
  workflows: (EspWorkflow & { accountKey: string; dealer: string; provider: string })[];
  perAccount: Record<string, PerAccountEntry>;
  errors: Record<string, string>;
  meta: { totalWorkflows: number; accountsFetched: number };
};

export type ContactStatsEntry = {
  dealer: string;
  count: number;
  contactCount?: number;
  connected: boolean;
  cached: boolean;
  provider: string;
  error?: string;
};

export type ContactStatsResponse = {
  stats: Record<string, ContactStatsEntry>;
  meta: { totalContacts: number; connectedAccounts: number; accountsFetched: number };
};

// ── Hooks ──

export function useContactsAggregate(options: DashboardAggregateOptions = {}) {
  const enabled = options.enabled ?? true;
  return useSWR<ContactsAggregateResponse>(
    enabled ? buildDashboardUrl('/api/esp/contacts/aggregate', options) : null,
    jsonFetcher,
    DASHBOARD_SWR_CONFIG,
  );
}

export function useCampaignsAggregate(options: DashboardAggregateOptions = {}) {
  const enabled = options.enabled ?? true;
  return useSWR<CampaignsAggregateResponse>(
    enabled ? buildDashboardUrl('/api/esp/campaigns/aggregate', options) : null,
    jsonFetcher,
    DASHBOARD_SWR_CONFIG,
  );
}

export function useWorkflowsAggregate(options: DashboardAggregateOptions = {}) {
  const enabled = options.enabled ?? true;
  return useSWR<WorkflowsAggregateResponse>(
    enabled ? buildDashboardUrl('/api/esp/workflows/aggregate', options) : null,
    jsonFetcher,
    DASHBOARD_SWR_CONFIG,
  );
}

export function useContactStats(options: DashboardAggregateOptions = {}) {
  const enabled = options.enabled ?? true;
  return useSWR<ContactStatsResponse>(
    enabled ? buildDashboardUrl('/api/esp/contacts/stats', options) : null,
    jsonFetcher,
    DASHBOARD_SWR_CONFIG,
  );
}
