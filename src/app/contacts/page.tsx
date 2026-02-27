'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAccount } from '@/contexts/account-context';
import { ContactsTable } from '@/components/contacts/contacts-table';
import type { Contact } from '@/components/contacts/contacts-table';
import { ContactsToolbar, AudiencesMenuButton, ContactsAccountFilter } from '@/components/contacts/contacts-toolbar';
import { FilterBuilder } from '@/components/contacts/filter-builder';
import { evaluateFilter } from '@/lib/smart-list-engine';
import type { FilterDefinition, PresetFilter } from '@/lib/smart-list-types';
import { resolveAccountLocationId, resolveAccountProvider } from '@/lib/account-resolvers';
import { providerDisplayName } from '@/lib/esp/provider-display';
import { getCampaignHubUrl } from '@/lib/esp/provider-links';
import { isYagRollupAccount } from '@/lib/accounts/rollup';
import {
  UserGroupIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';

interface SingleAccountResponse {
  contacts: Contact[];
  meta: { total: number };
}

interface AggregateContactsResponse {
  contacts: Array<Contact & { _accountKey?: string; _dealer?: string }>;
  perAccount?: Record<string, { dealer: string; count: number; connected: boolean; provider: string }>;
  errors?: Record<string, string>;
  meta?: {
    accountsRequested?: number;
    accountsFetched?: number;
    sampled?: boolean;
    sampledContacts?: number;
    totalContacts?: number;
    limitPerAccount?: number;
  };
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

const ADMIN_CONTACTS_FETCH_CONCURRENCY = 3;
const ADMIN_CONTACTS_FAST_LIMIT_PER_ACCOUNT = 150;
const ADMIN_CONTACTS_FULL_FETCH_MAX_ACCOUNTS = 2;

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

  const [baseContacts, setBaseContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [enrichedContacts, setEnrichedContacts] = useState<Contact[] | null>(null);
  const [messagingLoading, setMessagingLoading] = useState(false);
  const [messagingLoaded, setMessagingLoaded] = useState(false);
  const contacts = enrichedContacts ?? baseContacts;
  const loading = contactsLoading;
  const fetchError = contactsError;

  // Reset enriched contacts when base data changes
  useEffect(() => {
    setEnrichedContacts(null);
    setMessagingLoaded(false);
  }, [baseContacts]);

  const availableAccounts = useMemo(
    () =>
      Object.entries(accountMap)
        .filter(([key, account]) => !isYagRollupAccount(key, account.dealer))
        .map(([key, account]) => ({
          key,
          dealer: account.dealer || key,
          storefrontImage: account.storefrontImage,
          logos: account.logos,
          city: account.city,
          state: account.state,
        }))
        .sort((a, b) => a.dealer.localeCompare(b.dealer)),
    [accountMap],
  );

  const accountOptions = availableAccounts;

  const presetAccountFilter = useMemo(
    () => (availableAccounts.some((account) => account.key === requestedAccount) ? requestedAccount : ''),
    [availableAccounts, requestedAccount],
  );

  const filters = useContactFilters(contacts, presetAccountFilter);
  const accountKeysToFetch = useMemo(() => {
    const selectedKeys = filters.accountFilters.length > 0
      ? filters.accountFilters
      : availableAccounts.map((account) => account.key);
    return [...new Set(selectedKeys)];
  }, [availableAccounts, filters.accountFilters]);

  const fetchData = useCallback(async () => {
    if (accountKeysToFetch.length === 0) {
      setBaseContacts([]);
      setContactsError('Select at least one sub-account to load contacts.');
      setContactsLoading(false);
      setMessagingLoaded(false);
      return;
    }

    setContactsLoading(true);
    setContactsError(null);

    if (accountKeysToFetch.length > ADMIN_CONTACTS_FULL_FETCH_MAX_ACCOUNTS) {
      const params = new URLSearchParams({
        limitPerAccount: String(ADMIN_CONTACTS_FAST_LIMIT_PER_ACCOUNT),
        excludeYagRollup: 'true',
      });
      if (accountKeysToFetch.length !== availableAccounts.length) {
        params.set('accountKeys', accountKeysToFetch.join(','));
      }
      const res = await fetch(`/api/esp/contacts/aggregate?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = typeof body.error === 'string' ? body.error : 'Failed to fetch aggregate contacts';
        setContactsError(message);
        setBaseContacts([]);
        setContactsLoading(false);
        setMessagingLoaded(false);
        return;
      }

      const data: AggregateContactsResponse = await res.json();
      const sampledContacts = (data.contacts || []).map((contact) => {
        const key = contact._accountKey || '';
        return withMessagingDefaults({
          ...contact,
          _accountKey: key || undefined,
          _dealer: contact._dealer || accountMap[key]?.dealer || key || undefined,
        });
      });
      const failures = Object.values(data.errors || {});

      setBaseContacts(sampledContacts);
      setMessagingLoaded(false);
      if (failures.length === 0) {
        setContactsError(null);
      } else if (failures.length === accountKeysToFetch.length) {
        setContactsError(failures[0]);
      } else {
        setContactsError(`${failures.length} sub-account fetches failed. Showing partial results.`);
      }
      setContactsLoading(false);
      return;
    }

    const nextContacts: Contact[] = [];
    const failures: string[] = [];
    for (let i = 0; i < accountKeysToFetch.length; i += ADMIN_CONTACTS_FETCH_CONCURRENCY) {
      const chunk = accountKeysToFetch.slice(i, i + ADMIN_CONTACTS_FETCH_CONCURRENCY);
      const settled = await Promise.allSettled(
        chunk.map(async (key) => {
          const res = await fetch(`/api/esp/contacts?accountKey=${encodeURIComponent(key)}&all=true`);
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            const message = typeof body.error === 'string' ? body.error : `Failed to fetch contacts for ${key}`;
            throw new Error(message);
          }
          const data: SingleAccountResponse = await res.json();
          return {
            key,
            dealer: accountMap[key]?.dealer || key,
            contacts: data.contacts || [],
          };
        }),
      );

      for (const result of settled) {
        if (result.status === 'rejected') {
          failures.push(result.reason instanceof Error ? result.reason.message : 'Failed to fetch contacts');
          continue;
        }

        for (const contact of result.value.contacts) {
          nextContacts.push(withMessagingDefaults({
            ...contact,
            _accountKey: result.value.key,
            _dealer: result.value.dealer,
          }));
        }
      }
    }

    setBaseContacts(nextContacts);
    setMessagingLoaded(false);
    if (failures.length === 0) {
      setContactsError(null);
    } else if (failures.length === accountKeysToFetch.length) {
      setContactsError(failures[0]);
    } else {
      setContactsError(`${failures.length} sub-account fetches failed. Showing partial results.`);
    }
    setContactsLoading(false);
  }, [accountKeysToFetch, accountMap, availableAccounts.length]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTick]);

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
        hasAccountFilter={filters.accountFilters.length > 1}
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
        onRefresh={() => {
          setRefreshTick((value) => value + 1);
        }}
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
