'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAccount } from '@/contexts/account-context';
import { useContactsAggregate } from '@/hooks/use-dashboard-data';
import { ContactsTable } from '@/components/contacts/contacts-table';
import type { Contact } from '@/components/contacts/contacts-table';
import { ContactsToolbar, AudiencesMenuButton, ContactsAccountFilter } from '@/components/contacts/contacts-toolbar';
import { FilterBuilder } from '@/components/contacts/filter-builder';
import { evaluateFilter } from '@/lib/smart-list-engine';
import type { FilterDefinition, PresetFilter } from '@/lib/smart-list-types';
import { resolveAccountLocationId, resolveAccountProvider } from '@/lib/account-resolvers';
import { providerDisplayName } from '@/lib/esp/provider-display';
import { getCampaignHubUrl } from '@/lib/esp/provider-links';
import {
  UserGroupIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';

interface AggregateResponse {
  contacts: Contact[];
  perAccount: Record<string, { dealer: string; count: number; connected: boolean }>;
  errors: Record<string, string>;
  meta: { totalContacts: number; accountsFetched: number };
}

interface SingleAccountResponse {
  contacts: Contact[];
  meta: { total: number };
}

interface SavedAudience {
  id: string;
  name: string;
  filters: string;
  color?: string | null;
}

interface MessagingSummary {
  hasReceivedMessage: boolean;
  hasReceivedEmail: boolean;
  hasReceivedSms: boolean;
  lastMessageDate: string;
}

const MESSAGING_FILTER_FIELDS = new Set([
  'hasReceivedMessage',
  'hasReceivedEmail',
  'hasReceivedSms',
  'lastMessageDate',
]);

function filterUsesMessaging(definition: FilterDefinition | null): boolean {
  if (!definition) return false;
  return definition.groups.some((group) =>
    group.conditions.some((condition) => MESSAGING_FILTER_FIELDS.has(condition.field)),
  );
}

function withMessagingDefaults(contact: Contact): Contact {
  return {
    ...contact,
    hasReceivedMessage: Boolean(contact.hasReceivedMessage || contact.lastMessageDate),
    hasReceivedEmail: Boolean(contact.hasReceivedEmail),
    hasReceivedSms: Boolean(contact.hasReceivedSms),
    lastMessageDate: contact.lastMessageDate || '',
  };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchMessagingSummaryForAccount(
  accountKey: string,
  contactIds: string[],
): Promise<Record<string, MessagingSummary>> {
  const out: Record<string, MessagingSummary> = {};
  if (!accountKey || contactIds.length === 0) return out;

  const chunks = chunkArray([...new Set(contactIds)], 30);
  for (const chunk of chunks) {
    const res = await fetch(
      `/api/esp/contacts/messaging-summary?accountKey=${encodeURIComponent(accountKey)}&contactIds=${encodeURIComponent(chunk.join(','))}`,
    );
    if (!res.ok) continue;
    const data = await res.json();
    const summaryById = data?.summaryByContactId;
    if (!summaryById || typeof summaryById !== 'object') continue;
    Object.assign(out, summaryById);
  }

  return out;
}

async function enrichContactsWithMessaging(contacts: Contact[]): Promise<Contact[]> {
  const idsByAccount = new Map<string, string[]>();
  for (const contact of contacts) {
    const accountKey = contact._accountKey;
    if (!accountKey || !contact.id) continue;
    const ids = idsByAccount.get(accountKey) || [];
    ids.push(contact.id);
    idsByAccount.set(accountKey, ids);
  }

  if (idsByAccount.size === 0) return contacts;

  const summariesByAccount = new Map<string, Record<string, MessagingSummary>>();
  await Promise.allSettled(
    Array.from(idsByAccount.entries()).map(async ([accountKey, ids]) => {
      try {
        const summary = await fetchMessagingSummaryForAccount(accountKey, ids);
        summariesByAccount.set(accountKey, summary);
      } catch {
        // Keep base contact data if messaging summary fetch fails.
      }
    }),
  );

  return contacts.map((contact) => {
    const accountKey = contact._accountKey;
    if (!accountKey) return withMessagingDefaults(contact);
    const summary = summariesByAccount.get(accountKey)?.[contact.id];
    if (!summary) return withMessagingDefaults(contact);

    const hasReceivedEmail = Boolean(contact.hasReceivedEmail || summary.hasReceivedEmail);
    const hasReceivedSms = Boolean(contact.hasReceivedSms || summary.hasReceivedSms);
    const lastMessageDate = summary.lastMessageDate || contact.lastMessageDate || '';
    const hasReceivedMessage =
      Boolean(contact.hasReceivedMessage || summary.hasReceivedMessage || hasReceivedEmail || hasReceivedSms || lastMessageDate);

    return {
      ...contact,
      hasReceivedMessage,
      hasReceivedEmail,
      hasReceivedSms,
      lastMessageDate,
    };
  });
}

export default function ContactsPage() {
  const { isAdmin, accountKey, accounts } = useAccount();

  if (isAdmin) {
    return <AdminContactsView />;
  }

  const assignedKeys = Object.keys(accounts);
  const activeKey = accountKey || assignedKeys[0] || '';

  return <AccountContactsView accountKey={activeKey} />;
}

// ── Shared Filter Logic Hook ──

function useContactFilters(rawContacts: Contact[], initialAccountFilter = '') {
  const [search, setSearch] = useState('');
  const [accountFilters, setAccountFilters] = useState<string[]>(
    initialAccountFilter ? [initialAccountFilter] : [],
  );
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [activeAudienceId, setActiveAudienceId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterDefinition | null>(null);
  const [customFilter, setCustomFilter] = useState<FilterDefinition | null>(null);
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [savedAudiences, setSavedAudiences] = useState<SavedAudience[]>([]);

  // Fetch saved audiences
  useEffect(() => {
    fetch('/api/audiences')
      .then((res) => (res.ok ? res.json() : { audiences: [] }))
      .then((data) => setSavedAudiences(data.audiences || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!initialAccountFilter) return;
    setAccountFilters((current) => (current.length > 0 ? current : [initialAccountFilter]));
  }, [initialAccountFilter]);

  // Filter pipeline: account → search → audience / custom filter
  const filtered = useMemo(() => {
    let result = rawContacts;

    // Account filter
    if (accountFilters.length > 0) {
      result = result.filter((c) => Boolean(c._accountKey && accountFilters.includes(c._accountKey)));
    }

    // Text search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) =>
        (c.fullName || `${c.firstName} ${c.lastName}`).toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.tags?.some((t) => t.toLowerCase().includes(q)) ||
        `${c.vehicleYear} ${c.vehicleMake} ${c.vehicleModel}`.toLowerCase().includes(q),
      );
    }

    // Audience / preset / custom filter
    if (activeFilter) {
      result = evaluateFilter(result, activeFilter);
    }

    return result;
  }, [rawContacts, accountFilters, search, activeFilter]);

  const needsMessagingData = useMemo(
    () => filterUsesMessaging(activeFilter),
    [activeFilter],
  );

  function handlePresetChange(preset: PresetFilter | null) {
    if (preset) {
      setActivePresetId(preset.id);
      setActiveAudienceId(null);
      setActiveFilter(preset.definition);
      setCustomFilter(null);
    } else {
      setActivePresetId(null);
      setActiveFilter(null);
    }
  }

  function handleAudienceChange(id: string | null, definition: FilterDefinition | null) {
    setActiveAudienceId(id);
    setActivePresetId(null);
    setActiveFilter(definition);
    setCustomFilter(null);
  }

  function handleApplyCustomFilter(definition: FilterDefinition) {
    setCustomFilter(definition);
    setActiveFilter(definition);
    setActivePresetId(null);
    setActiveAudienceId(null);
    setShowFilterBuilder(false);
  }

  async function handleSaveAudience(name: string, definition: FilterDefinition) {
    try {
      const res = await fetch('/api/audiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, filters: JSON.stringify(definition) }),
      });
      if (res.ok) {
        const data = await res.json();
        setSavedAudiences((prev) => [...prev, data.audience]);
        // Select the newly saved audience
        setActiveAudienceId(data.audience.id);
        setActivePresetId(null);
        setActiveFilter(definition);
        setCustomFilter(null);
        setShowFilterBuilder(false);
      }
    } catch {
      // Silently fail — could add toast later
    }
  }

  function handleClearFilter() {
    setActivePresetId(null);
    setActiveAudienceId(null);
    setActiveFilter(null);
    setCustomFilter(null);
  }

  return {
    search,
    setSearch,
    accountFilters,
    setAccountFilters,
    activePresetId,
    activeAudienceId,
    activeFilter,
    customFilter,
    showFilterBuilder,
    setShowFilterBuilder,
    savedAudiences,
    filtered,
    needsMessagingData,
    handlePresetChange,
    handleAudienceChange,
    handleApplyCustomFilter,
    handleSaveAudience,
    handleClearFilter,
  };
}

// ── Admin View ──

function AdminContactsView() {
  const { accounts: accountMap } = useAccount();
  const searchParams = useSearchParams();
  const requestedAccount = searchParams.get('account') || '';

  const { data: aggData, error: aggError, isLoading: aggLoading, mutate } = useContactsAggregate();

  const [enrichedContacts, setEnrichedContacts] = useState<Contact[] | null>(null);
  const [messagingLoading, setMessagingLoading] = useState(false);
  const [messagingLoaded, setMessagingLoaded] = useState(false);

  const baseContacts = useMemo(
    () => (aggData?.contacts as Contact[] | undefined || []).map(withMessagingDefaults),
    [aggData],
  );
  const contacts = enrichedContacts ?? baseContacts;
  const perAccount = aggData?.perAccount ?? {};
  const loading = aggLoading;
  const fetchError = aggError ? (aggError instanceof Error ? aggError.message : 'Failed to fetch contacts') : null;

  // Reset enriched contacts when base data changes
  useEffect(() => {
    setEnrichedContacts(null);
    setMessagingLoaded(false);
  }, [baseContacts]);

  const accountOptions = Object.entries(perAccount)
    .map(([key, val]) => ({
      key,
      dealer: val.dealer || accountMap[key]?.dealer || key,
      storefrontImage: accountMap[key]?.storefrontImage,
      logos: accountMap[key]?.logos,
      city: accountMap[key]?.city,
      state: accountMap[key]?.state,
    }))
    .sort((a, b) => a.dealer.localeCompare(b.dealer));

  const presetAccountFilter = useMemo(
    () => (accountOptions.some((account) => account.key === requestedAccount) ? requestedAccount : ''),
    [accountOptions, requestedAccount],
  );

  const filters = useContactFilters(contacts, presetAccountFilter);
  const selectedCampaignAccountKey =
    filters.accountFilters.length === 1
      ? filters.accountFilters[0]
      : presetAccountFilter || '';
  const selectedCampaignAccount = selectedCampaignAccountKey ? accountMap[selectedCampaignAccountKey] : null;
  const selectedCampaignProvider = selectedCampaignAccount
    ? resolveAccountProvider(selectedCampaignAccount, '')
    : null;
  const createCampaignHref = getCampaignHubUrl(
    selectedCampaignProvider,
    resolveAccountLocationId(selectedCampaignAccount),
  );
  const createCampaignLabel = selectedCampaignProvider
    ? `Create Campaign in ${providerDisplayName(selectedCampaignProvider)}`
    : 'Create Campaign';

  useEffect(() => {
    if (!filters.needsMessagingData || messagingLoaded || messagingLoading || baseContacts.length === 0) {
      return;
    }

    let active = true;
    setMessagingLoading(true);
    enrichContactsWithMessaging(baseContacts)
      .then((result) => {
        if (!active) return;
        setEnrichedContacts(result);
        setMessagingLoaded(true);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setMessagingLoading(false);
      });

    return () => {
      active = false;
    };
  }, [baseContacts, filters.needsMessagingData, messagingLoaded, messagingLoading]);

  return (
    <div>
      <div className="page-sticky-header mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <UserGroupIcon className="w-7 h-7 text-[var(--primary)]" />
            <div>
              <h2 className="text-2xl font-bold">Contacts</h2>
              <p className="text-[var(--muted-foreground)] mt-1">
                Contact data across all accounts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {createCampaignHref ? (
              <a
                href={createCampaignHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 h-10 text-sm rounded-lg border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/40"
              >
                <ChatBubbleLeftRightIcon className="w-4 h-4" />
                {createCampaignLabel}
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="flex items-center gap-1.5 px-3 h-10 text-sm rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] opacity-60 cursor-not-allowed"
              >
                <ChatBubbleLeftRightIcon className="w-4 h-4" />
                Campaign Builder Unavailable
              </button>
            )}
            <ContactsAccountFilter
              values={filters.accountFilters}
              onChange={filters.setAccountFilters}
          accounts={accountOptions}
            />
            <AudiencesMenuButton
              activeAudienceId={filters.activeAudienceId}
              onAudienceChange={filters.handleAudienceChange}
              savedAudiences={filters.savedAudiences}
              align="right"
            />
          </div>
        </div>
      </div>

      <ContactsToolbar
        search={filters.search}
        onSearchChange={filters.setSearch}
        hasAccountFilter={filters.accountFilters.length > 0}
        activePresetId={filters.activePresetId}
        onPresetChange={filters.handlePresetChange}
        activeAudienceId={filters.activeAudienceId}
        onAudienceChange={filters.handleAudienceChange}
        savedAudiences={filters.savedAudiences}
        onOpenFilterBuilder={() => filters.setShowFilterBuilder(true)}
        hasCustomFilter={!!filters.customFilter}
        onClearFilter={filters.handleClearFilter}
        totalCount={contacts.length}
        filteredCount={filters.filtered.length}
        loading={loading || messagingLoading}
        onRefresh={() => mutate()}
        contacts={contacts}
      />

      {filters.showFilterBuilder && (
        <FilterBuilder
          initialDefinition={filters.customFilter ?? undefined}
          onApply={filters.handleApplyCustomFilter}
          onSave={filters.handleSaveAudience}
          onClose={() => filters.setShowFilterBuilder(false)}
        />
      )}

      <ContactsTable
        contacts={filters.filtered}
        loading={loading}
        error={fetchError}
        showAccountColumn
      />
    </div>
  );
}

// ── Account View ──

function AccountContactsView({
  accountKey,
}: {
  accountKey: string;
}) {
  const { accounts } = useAccount();
  const searchParams = useSearchParams();
  const requestedAccount = searchParams.get('account') || '';
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagingLoading, setMessagingLoading] = useState(false);
  const [messagingLoaded, setMessagingLoaded] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!accountKey) {
      setContacts([]);
      setFetchError('No account selected');
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);

    try {
      const keysToFetch = [accountKey];
      const results = await Promise.all(
        keysToFetch.map(async (key) => {
          const res = await fetch(`/api/esp/contacts?accountKey=${encodeURIComponent(key)}&limit=100`);
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || `Failed for ${key}`);
          }
          const data: SingleAccountResponse = await res.json();
          return { key, contacts: data.contacts || [] };
        }),
      );

      const all: Contact[] = [];
      for (const r of results) {
        for (const c of r.contacts) {
          all.push(withMessagingDefaults({ ...c, _accountKey: r.key }));
        }
      }
      setContacts(all);
      setMessagingLoaded(false);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch contacts');
      setContacts([]);
      setMessagingLoaded(false);
    }
    setLoading(false);
  }, [accountKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const presetAccountFilter = useMemo(
    () => (requestedAccount === accountKey ? requestedAccount : ''),
    [accountKey, requestedAccount],
  );

  const filters = useContactFilters(contacts, presetAccountFilter);
  const activeAccount = accountKey ? accounts[accountKey] : null;
  const accountProvider = activeAccount
    ? resolveAccountProvider(activeAccount, '')
    : null;
  const createCampaignHref = getCampaignHubUrl(
    accountProvider,
    resolveAccountLocationId(activeAccount),
  );
  const createCampaignLabel = accountProvider
    ? `Create Campaign in ${providerDisplayName(accountProvider)}`
    : 'Create Campaign';

  useEffect(() => {
    if (!filters.needsMessagingData || messagingLoaded || messagingLoading || contacts.length === 0) {
      return;
    }

    let active = true;
    setMessagingLoading(true);
    enrichContactsWithMessaging(contacts)
      .then((enrichedContacts) => {
        if (!active) return;
        setContacts(enrichedContacts);
        setMessagingLoaded(true);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setMessagingLoading(false);
      });

    return () => {
      active = false;
    };
  }, [contacts, filters.needsMessagingData, messagingLoaded, messagingLoading]);

  return (
    <div>
      <div className="page-sticky-header mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <UserGroupIcon className="w-7 h-7 text-[var(--primary)]" />
            <div>
              <h2 className="text-2xl font-bold">Contacts</h2>
              <p className="text-[var(--muted-foreground)] mt-1">
                Your contact database
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {createCampaignHref ? (
              <a
                href={createCampaignHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 h-10 text-sm rounded-lg border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/40"
              >
                <ChatBubbleLeftRightIcon className="w-4 h-4" />
                {createCampaignLabel}
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="flex items-center gap-1.5 px-3 h-10 text-sm rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] opacity-60 cursor-not-allowed"
              >
                <ChatBubbleLeftRightIcon className="w-4 h-4" />
                Campaign Builder Unavailable
              </button>
            )}
            <AudiencesMenuButton
              activeAudienceId={filters.activeAudienceId}
              onAudienceChange={filters.handleAudienceChange}
              savedAudiences={filters.savedAudiences}
              align="right"
            />
          </div>
        </div>
      </div>

      <ContactsToolbar
        search={filters.search}
        onSearchChange={filters.setSearch}
        hasAccountFilter={false}
        activePresetId={filters.activePresetId}
        onPresetChange={filters.handlePresetChange}
        activeAudienceId={filters.activeAudienceId}
        onAudienceChange={filters.handleAudienceChange}
        savedAudiences={filters.savedAudiences}
        onOpenFilterBuilder={() => filters.setShowFilterBuilder(true)}
        hasCustomFilter={!!filters.customFilter}
        onClearFilter={filters.handleClearFilter}
        totalCount={contacts.length}
        filteredCount={filters.filtered.length}
        loading={loading || messagingLoading}
        onRefresh={fetchData}
        contacts={contacts}
      />

      {filters.showFilterBuilder && (
        <FilterBuilder
          initialDefinition={filters.customFilter ?? undefined}
          onApply={filters.handleApplyCustomFilter}
          onSave={filters.handleSaveAudience}
          onClose={() => filters.setShowFilterBuilder(false)}
        />
      )}

      <ContactsTable
        contacts={filters.filtered}
        loading={loading}
        error={fetchError}
        showAccountColumn={false}
        accountKey={accountKey}
      />
    </div>
  );
}
