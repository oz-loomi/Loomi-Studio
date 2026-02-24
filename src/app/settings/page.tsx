'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAccount, type AccountData } from '@/contexts/account-context';
import { useUnsavedChanges } from '@/contexts/unsaved-changes-context';
import { useTheme } from '@/contexts/theme-context';
import {
  PlusIcon, SunIcon, MoonIcon, BuildingStorefrontIcon,
  UsersIcon, SwatchIcon, BookOpenIcon, SparklesIcon,
  XMarkIcon, ArrowPathIcon, MagnifyingGlassIcon,
  CheckCircleIcon, AdjustmentsHorizontalIcon, LinkIcon,
  TrashIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { CodeEditor } from '@/components/code-editor';
import { AccountsList } from '@/components/accounts-list';
import { OemMultiSelect } from '@/components/oem-multi-select';
import { UserAvatar } from '@/components/user-avatar';
import { AccountAvatar } from '@/components/account-avatar';
import { roleDisplayName } from '@/lib/roles';
import { getAccountOems, industryHasBrands, brandsForIndustry } from '@/lib/oems';
import { formatAccountCityState, resolveAccountLocationId } from '@/lib/account-resolvers';
import { providerDisplayName, providerUnsupportedMessage } from '@/lib/esp/provider-display';
import {
  extractProviderCatalog,
  fetchProviderCatalogPayload,
  normalizeProviderId,
  type ProviderCatalogPayload,
} from '@/lib/esp/provider-catalog';
import {
  createProviderStatusResolver,
  resolveCustomValuesSyncReadiness,
} from '@/lib/esp/provider-status';
import { fetchRequiredScopesByCatalogUrl } from '@/lib/esp/provider-scopes';

const CATEGORY_SUGGESTIONS = ['Automotive', 'Powersports', 'Ecommerce', 'Healthcare', 'Real Estate', 'Hospitality', 'Retail', 'General'];

type Tab = 'accounts' | 'account' | 'users' | 'integrations' | 'custom-values' | 'knowledge' | 'appearance';

// ─── User list types ───
interface User {
  id: string;
  name: string;
  title: string | null;
  email: string;
  avatarUrl: string | null;
  role: string;
  accountKeys: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

const roleColors: Record<string, string> = {
  developer: 'text-purple-400 bg-purple-500/10',
  super_admin: 'text-amber-400 bg-amber-500/10',
  admin: 'text-blue-400 bg-blue-500/10',
  client: 'text-green-400 bg-green-500/10',
};

const USERS_PAGE_SIZE = 10;
type UserSortField = 'name' | 'email' | 'role' | 'accounts' | 'lastLogin';
type UserSortDirection = 'asc' | 'desc';

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

function formatLastLoginDate(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function resolveAccountSummary(accountKey: string, account: AccountData | null | undefined): {
  dealer: string;
  cityState: string;
  industry: string;
} {
  const dealer = typeof account?.dealer === 'string' && account.dealer.trim()
    ? account.dealer.trim()
    : accountKey;
  const cityState = formatAccountCityState(account)
    || 'Location unavailable';
  const industry = typeof account?.category === 'string' && account.category.trim()
    ? account.category.trim()
    : 'Unknown industry';

  return { dealer, cityState, industry };
}

export default function SettingsPage() {
  const { isAdmin, isAccount, userRole } = useAccount();
  const { confirmNavigation } = useUnsavedChanges();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Determine available tabs based on role/mode
  const tabs: { key: Tab; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }[] = [];
  const hasAdminAccess = userRole === 'developer' || userRole === 'super_admin' || userRole === 'admin';
  if (hasAdminAccess && isAdmin) tabs.push({ key: 'accounts', label: 'Sub-Accounts', icon: BuildingStorefrontIcon });
  if (isAccount) tabs.push({ key: 'account', label: 'Sub-Account', icon: BuildingStorefrontIcon });
  if (hasAdminAccess) tabs.push({ key: 'users', label: 'Users', icon: UsersIcon });
  if (isAccount && hasAdminAccess) tabs.push({ key: 'integrations', label: 'Integrations', icon: LinkIcon });
  if (hasAdminAccess) tabs.push({ key: 'custom-values', label: 'Custom Values', icon: AdjustmentsHorizontalIcon });
  if (hasAdminAccess && isAdmin) tabs.push({ key: 'knowledge', label: 'Knowledge Base', icon: BookOpenIcon });
  tabs.push({ key: 'appearance', label: 'Appearance', icon: SwatchIcon });

  const routeTab = pathname.startsWith('/settings/')
    ? pathname.split('/')[2]
    : undefined;
  const defaultTab = tabs[0]?.key || 'appearance';
  const activeTab = tabs.some(t => t.key === routeTab)
    ? (routeTab as Tab)
    : defaultTab;

  useEffect(() => {
    const mode = searchParams.get('esp_auth_mode');
    if (mode !== 'agency') return;

    const connected = searchParams.get('esp_connected');
    const errorMessage = searchParams.get('esp_error');
    const provider = searchParams.get('esp_provider');
    const label = providerDisplayName(provider);

    if (connected === 'true') {
      toast.success(`Successfully connected ${label} at agency level!`);
    } else if (errorMessage) {
      toast.error(`${label} connection failed: ${errorMessage}`);
    }

    router.replace(`/settings/${defaultTab}`, { scroll: false });
  }, [searchParams, defaultTab, router]);

  // Enforce canonical route per tab so browser history/back works correctly.
  useEffect(() => {
    if (tabs.length === 0) return;
    if (!routeTab || !tabs.some(t => t.key === routeTab)) {
      router.replace(`/settings/${defaultTab}`, { scroll: false });
    }
  }, [routeTab, defaultTab, router, tabs.length, isAdmin, isAccount, userRole]);

  return (
    <div className="animate-fade-in-up">
      <div className="page-sticky-header mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Settings</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Manage your preferences and configuration
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-[var(--border)]">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => {
              confirmNavigation(() => router.push(`/settings/${tab.key}`), `/settings/${tab.key}`);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab.key
                ? 'text-[var(--foreground)]'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {activeTab === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)]" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'accounts' && <AccountsList listPath="/settings/accounts" detailBasePath="/settings/accounts" />}
      {activeTab === 'account' && <AccountSettingsTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'integrations' && <AccountDetailTabRedirect targetTab="integration" />}
      {activeTab === 'custom-values' && (
        isAccount
          ? <AccountDetailTabRedirect targetTab="custom-values" />
          : <CustomValuesTab />
      )}
      {activeTab === 'knowledge' && hasAdminAccess && isAdmin && <KnowledgeBaseTab />}
      {activeTab === 'appearance' && <AppearanceTab />}
    </div>
  );
}

function AccountDetailTabRedirect({ targetTab }: { targetTab: 'integration' | 'custom-values' }) {
  const { isAccount, accountKey } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (!isAccount || !accountKey) return;
    router.replace(`/settings/accounts/${encodeURIComponent(accountKey)}?tab=${targetTab}`);
  }, [isAccount, accountKey, targetTab, router]);

  if (!isAccount || !accountKey) {
    return (
      <div className="text-center py-16">
        <p className="text-[var(--muted-foreground)] text-sm">Select a sub-account to manage this section.</p>
        <p className="text-[var(--muted-foreground)] text-xs mt-1">Use the sub-account switcher in the sidebar.</p>
      </div>
    );
  }

  return (
    <div className="text-center py-16">
      <p className="text-[var(--muted-foreground)] text-sm">Opening sub-account settings...</p>
    </div>
  );
}

// ════════════════════════════════════════
// Account Settings Tab
// ════════════════════════════════════════
function AccountSettingsTab() {
  const {
    accountKey,
    accountData,
    refreshAccounts,
  } = useAccount();
  const { markClean } = useUnsavedChanges();

  const [dealer, setDealer] = useState('');
  const [category, setCategory] = useState('');
  const [oems, setOems] = useState<string[]>([]);
  const [logoLight, setLogoLight] = useState('');
  const [logoDark, setLogoDark] = useState('');
  const [logoWhite, setLogoWhite] = useState('');
  const [logoBlack, setLogoBlack] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (accountData) {
      setDealer(accountData.dealer || '');
      setCategory(accountData.category || '');
      setOems(getAccountOems(accountData));
      setLogoLight(accountData.logos?.light || '');
      setLogoDark(accountData.logos?.dark || '');
      setLogoWhite(accountData.logos?.white || '');
      setLogoBlack(accountData.logos?.black || '');
    }
  }, [accountData]);

  if (!accountData || !accountKey) {
    return (
      <div className="text-center py-16">
        <p className="text-[var(--muted-foreground)] text-sm">Select a sub-account to manage settings.</p>
        <p className="text-[var(--muted-foreground)] text-xs mt-1">Use the sub-account switcher in the sidebar.</p>
      </div>
    );
  }

  async function handleSave() {
    if (!accountKey) return;
    setSaving(true);
    try {
      const hasBrands = industryHasBrands(category);
      const selectedOems = hasBrands ? oems : [];
      const payload: Record<string, unknown> = {
        dealer,
        category,
        oems: selectedOems,
        logos: {
          light: logoLight,
          dark: logoDark,
          white: logoWhite || undefined,
          black: logoBlack || undefined,
        },
      };

      const res = await fetch(`/api/accounts/${encodeURIComponent(accountKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await refreshAccounts();
        markClean();
        toast.success('Settings saved!');
      } else {
        toast.error('Failed to save settings');
      }
    } catch {
      toast.error('Failed to save settings');
    }
    setSaving(false);
  }

  const inputClass = 'w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--card)] focus:outline-none focus:border-[var(--primary)]';
  const labelClass = 'block text-xs font-medium text-[var(--muted-foreground)] mb-1.5';
  const showBrandsSelector = industryHasBrands(category);
  const sectionCardClass = 'glass-section-card rounded-xl p-6';
  const sectionHeadingClass = 'text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4';

  return (
    <div className="max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className={sectionCardClass}>
        <h3 className={sectionHeadingClass}>General</h3>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Sub-Account Key</label>
            <div className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]">
              {accountKey}
            </div>
          </div>

          <div className={`grid grid-cols-1 gap-4 ${showBrandsSelector ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            <div>
              <label className={labelClass}>Dealer Name</label>
              <input type="text" value={dealer} onChange={e => setDealer(e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Industry</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
                <option value="">Select industry...</option>
                {CATEGORY_SUGGESTIONS.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {showBrandsSelector && (
              <div>
                <label className={labelClass}>Brands</label>
                <OemMultiSelect
                  value={oems}
                  onChange={setOems}
                  options={brandsForIndustry(category)}
                  placeholder="Select brands..."
                  maxSelections={8}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={sectionCardClass}>
        <h3 className={sectionHeadingClass}>Logos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: 'Light Logo URL', value: logoLight, setter: setLogoLight },
            { label: 'Dark Logo URL', value: logoDark, setter: setLogoDark },
            { label: 'White Logo URL (optional)', value: logoWhite, setter: setLogoWhite },
            { label: 'Black Logo URL (optional)', value: logoBlack, setter: setLogoBlack },
          ].map(({ label, value, setter }) => (
            <div key={label}>
              <label className="block text-[10px] text-[var(--muted-foreground)] mb-1">{label}</label>
              <input
                type="text"
                value={value}
                onChange={e => setter(e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </section>

      <div className="lg:col-span-2 flex items-center justify-end gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 text-sm font-medium rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// Users Tab
// ════════════════════════════════════════
function UsersTab() {
  const router = useRouter();
  const { isAccount, accountKey, accounts, userRole } = useAccount();
  const canEditUsers = userRole === 'developer' || userRole === 'super_admin';
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<UserSortField>('name');
  const [sortDirection, setSortDirection] = useState<UserSortDirection>('asc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch('/api/users')
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          throw new Error(data?.error || 'Failed to load users');
        }
        if (!Array.isArray(data)) {
          throw new Error('Unexpected users response');
        }
        return data as User[];
      })
      .then(setUsers)
      .catch((err: unknown) => {
        setUsers([]);
        toast.error(err instanceof Error ? err.message : 'Failed to load users');
      })
      .finally(() => setLoading(false));
  }, []);

  const scopedUsers = useMemo(() => {
    if (!isAccount || !accountKey) return users;
    return users.filter((user) => user.accountKeys.includes(accountKey));
  }, [users, isAccount, accountKey]);

  const scopedAccountLabel = isAccount && accountKey
    ? (accounts[accountKey]?.dealer || accountKey)
    : null;

  const filteredUsers = useMemo(() => {
    if (!search) return scopedUsers;

    const q = search.toLowerCase();
    return scopedUsers.filter((u) => (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      (u.title || '').toLowerCase().includes(q)
    ));
  }, [scopedUsers, search]);

  const sortedUsers = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    const sorted = [...filteredUsers];

    sorted.sort((a, b) => {
      let compareValue = 0;

      if (sortField === 'name') {
        compareValue = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      } else if (sortField === 'email') {
        compareValue = a.email.toLowerCase().localeCompare(b.email.toLowerCase());
      } else if (sortField === 'role') {
        compareValue = a.role.toLowerCase().localeCompare(b.role.toLowerCase());
      } else if (sortField === 'accounts') {
        compareValue = a.accountKeys.length - b.accountKeys.length;
      } else if (sortField === 'lastLogin') {
        const aLastLogin = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
        const bLastLogin = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
        compareValue = aLastLogin - bLastLogin;
      }

      if (compareValue === 0) {
        compareValue = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      }

      return compareValue * direction;
    });

    return sorted;
  }, [filteredUsers, sortDirection, sortField]);

  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / USERS_PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageStart = (page - 1) * USERS_PAGE_SIZE;
  const pagedUsers = sortedUsers.slice(pageStart, pageStart + USERS_PAGE_SIZE);
  const visiblePages = getVisiblePages(page, totalPages);
  const showingStart = sortedUsers.length === 0 ? 0 : pageStart + 1;
  const showingEnd = Math.min(pageStart + USERS_PAGE_SIZE, sortedUsers.length);

  const toggleSort = (field: UserSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setPage(1);
  };

  const sortIndicator = (field: UserSortField) => {
    if (sortField !== field) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--muted-foreground)]">
          {sortedUsers.length} user{sortedUsers.length !== 1 ? 's' : ''}{search ? ' found' : ''}
          {scopedAccountLabel ? ` in ${scopedAccountLabel}` : ''}
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search users..."
              className="w-52 pl-8 pr-3 py-1.5 text-xs bg-[var(--input)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>
          {canEditUsers && (
            <button
              onClick={() => router.push('/settings/users/new')}
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <PlusIcon className="w-4 h-4" />
              Add User
            </button>
          )}
        </div>
      </div>

      <div className="glass-table account-tooltip-table">
        <div className="users-table-scroll">
        <table className="w-full min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[var(--muted)] border-b border-[var(--border)]">
              <th className="w-12 px-3 py-2"></th>
              <th className="text-left px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 hover:text-[var(--foreground)] transition-colors">
                  Name
                  <span className="text-[10px]">{sortIndicator('name')}</span>
                </button>
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                <button type="button" onClick={() => toggleSort('email')} className="inline-flex items-center gap-1 hover:text-[var(--foreground)] transition-colors">
                  Email
                  <span className="text-[10px]">{sortIndicator('email')}</span>
                </button>
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                <button type="button" onClick={() => toggleSort('role')} className="inline-flex items-center gap-1 hover:text-[var(--foreground)] transition-colors">
                  Role
                  <span className="text-[10px]">{sortIndicator('role')}</span>
                </button>
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                <button type="button" onClick={() => toggleSort('accounts')} className="inline-flex items-center gap-1 hover:text-[var(--foreground)] transition-colors">
                  Sub-Accounts
                  <span className="text-[10px]">{sortIndicator('accounts')}</span>
                </button>
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                <button type="button" onClick={() => toggleSort('lastLogin')} className="inline-flex items-center gap-1 hover:text-[var(--foreground)] transition-colors">
                  Last Login
                  <span className="text-[10px]">{sortIndicator('lastLogin')}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">Loading...</td>
              </tr>
            ) : sortedUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
                  {search
                    ? 'No users match your search'
                    : isAccount
                      ? 'No users are assigned to this sub-account'
                      : 'No users found'}
                </td>
              </tr>
            ) : (
              pagedUsers.map(user => (
                <tr
                  key={user.id}
                  onClick={canEditUsers ? () => router.push(`/settings/users/${user.id}`) : undefined}
                  className={`border-b border-[var(--border)] last:border-b-0 transition-colors ${canEditUsers ? 'hover:bg-[var(--muted)]/50 cursor-pointer' : ''}`}
                >
                  <td className="px-3 py-2 align-middle">
                    <div className="flex items-center justify-center h-full">
                      <UserAvatar
                        name={user.name}
                        email={user.email}
                        avatarUrl={user.avatarUrl}
                        size={36}
                        className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-[var(--border)]"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--foreground)] truncate">{user.name}</p>
                      {user.title && (
                        <p className="text-xs text-[var(--muted-foreground)] truncate">{user.title}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-middle text-sm text-[var(--muted-foreground)]">{user.email}</td>
                  <td className="px-3 py-2 align-middle">
                    <span className={`text-[10px] font-medium uppercase tracking-wider rounded px-1.5 py-0.5 ${roleColors[user.role] || ''}`}>
                      {roleDisplayName(user.role)}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-middle text-sm text-[var(--muted-foreground)]">
                    {user.accountKeys.length === 0 ? (
                      <span className="text-xs opacity-50">All sub-accounts</span>
                    ) : (
                      <div className="account-avatar-stack flex items-center pl-2">
                        {user.accountKeys.slice(0, 4).map((accountKey) => {
                          const account = accounts[accountKey] || null;
                          const summary = resolveAccountSummary(accountKey, account);

                          return (
                            <span
                              key={accountKey}
                              aria-label={`${summary.dealer} • ${summary.cityState} • ${summary.industry} • Key: ${accountKey}`}
                              className="relative inline-flex items-center group account-avatar-stack-item"
                            >
                              <span className="pointer-events-none absolute bottom-full left-1/2 z-[90] mb-2 hidden -translate-x-1/2 group-hover:block">
                                <span className="relative block account-tooltip-popover rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 shadow-xl whitespace-nowrap">
                                  <span className="block text-[11px] font-medium leading-4 text-[var(--foreground)]">
                                    {summary.dealer}
                                  </span>
                                  <span className="block text-[10px] leading-4 text-[var(--muted-foreground)]">
                                    {summary.cityState}
                                  </span>
                                  <span className="block text-[10px] leading-4 text-[var(--muted-foreground)]">
                                    {summary.industry}
                                  </span>
                                  <span className="mt-1 block text-[10px] font-mono leading-4 text-[var(--muted-foreground)]">
                                    Key: {accountKey}
                                  </span>
                                  <span className="absolute left-1/2 top-full -translate-x-1/2 w-0 h-0 border-x-[6px] border-x-transparent border-t-[7px] border-t-[var(--background)]" />
                                </span>
                              </span>

                              <span className="inline-flex rounded-full bg-[var(--background)] p-[1px] shadow-sm">
                                <AccountAvatar
                                  name={summary.dealer}
                                  accountKey={accountKey}
                                  storefrontImage={account?.storefrontImage || null}
                                  logos={account?.logos}
                                  size={32}
                                  className="rounded-full"
                                  alt={`${summary.dealer} (${accountKey})`}
                                />
                              </span>
                            </span>
                          );
                        })}

                        {user.accountKeys.length > 4 && (
                          <span
                            title={`${user.accountKeys.length - 4} more sub-account${user.accountKeys.length - 4 === 1 ? '' : 's'}`}
                            className="account-avatar-stack-item inline-flex items-center justify-center w-[34px] h-[34px] rounded-full border border-[var(--background)] bg-[var(--background)] text-[10px] font-medium text-[var(--muted-foreground)] shadow-sm"
                          >
                            +{user.accountKeys.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-middle text-sm text-[var(--muted-foreground)]">
                    {formatLastLoginDate(user.lastLoginAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {!loading && sortedUsers.length > 0 && (
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-[var(--muted-foreground)]">
            Showing {showingStart}-{showingEnd} of {sortedUsers.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-2 py-1 text-xs rounded-md border border-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--muted)] transition-colors"
            >
              First
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
              className="px-2 py-1 text-xs rounded-md border border-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--muted)] transition-colors"
            >
              Prev
            </button>
            {visiblePages.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setPage(pageNumber)}
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
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 text-xs rounded-md border border-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--muted)] transition-colors"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="px-2 py-1 text-xs rounded-md border border-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--muted)] transition-colors"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════
// Knowledge Base Tab
// ════════════════════════════════════════
function KnowledgeBaseTab() {
  const { markClean, markDirty } = useUnsavedChanges();
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const hasChanges = content !== savedContent;

  useEffect(() => {
    if (hasChanges) {
      markDirty();
      return;
    }
    markClean();
  }, [hasChanges, markClean, markDirty]);

  useEffect(() => {
    fetch('/api/knowledge')
      .then(r => r.json())
      .then(data => {
        const c = data.content || '';
        setContent(c);
        setSavedContent(c);
      })
      .catch(() => toast.error('Failed to load knowledge base'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/knowledge', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setSavedContent(content);
        markClean();
        toast.success('Knowledge base saved! AI will use the updated content immediately.');
      } else {
        toast.error('Failed to save knowledge base');
      }
    } catch {
      toast.error('Failed to save knowledge base');
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-[var(--muted-foreground)]">Loading knowledge base...</p>
      </div>
    );
  }

  const sectionCardClass = 'glass-section-card rounded-xl p-5';

  return (
    <div className="max-w-7xl grid grid-cols-1 gap-6">
      <section className={sectionCardClass}>
        <div className="flex items-start gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--primary)]/5">
          <SparklesIcon className="w-5 h-5 text-[var(--primary)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">AI Knowledge Base</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              This markdown file powers both AI assistants (the global Loomi bubble and the template editor sidebar). Edit it to update what the AI knows about your platform, processes, and conventions. Changes take effect immediately.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                !showPreview
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]'
              }`}
            >
              Editor
            </button>
            <button
              onClick={() => setShowPreview(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                showPreview
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]'
              }`}
            >
              Preview
            </button>
          </div>
          <div className="flex items-center gap-3">
            {hasChanges && (
              <span className="text-xs text-amber-500 font-medium">Unsaved changes</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="px-5 py-2 text-sm font-medium rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </section>

      <section className="glass-section-card rounded-xl p-0 overflow-hidden">
        {!showPreview ? (
          <div style={{ height: 'calc(100vh - 340px)', minHeight: '400px' }}>
            <CodeEditor
              value={content}
              onChange={setContent}
              language="markdown"
              onSave={handleSave}
            />
          </div>
        ) : (
          <div
            className="overflow-auto p-6"
            style={{ height: 'calc(100vh - 340px)', minHeight: '400px' }}
          >
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <MarkdownPreview content={content} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// Simple markdown renderer — no external dependencies
function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headings
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-xl font-bold text-[var(--foreground)] mt-6 mb-3 first:mt-0">{line.slice(2)}</h1>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-lg font-semibold text-[var(--foreground)] mt-5 mb-2">{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-sm font-semibold text-[var(--foreground)] mt-4 mb-1.5">{line.slice(4)}</h3>);
    }
    // Horizontal rule
    else if (line.trim() === '---') {
      elements.push(<hr key={i} className="border-[var(--border)] my-4" />);
    }
    // Code block
    else if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={`code-${i}`} className="bg-[var(--muted)] rounded-lg p-3 text-xs overflow-x-auto my-2 border border-[var(--border)]">
          <code className="text-[var(--foreground)]">{codeLines.join('\n')}</code>
        </pre>
      );
    }
    // Table (basic)
    else if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      i--; // back up since outer loop will increment
      const headerCells = tableLines[0].split('|').filter(c => c.trim()).map(c => c.trim());
      const bodyRows = tableLines.slice(2); // skip header + separator
      elements.push(
        <div key={`table-${i}`} className="overflow-x-auto my-3">
          <table className="w-full text-xs border border-[var(--border)] rounded-lg">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {headerCells.map((cell, ci) => (
                  <th key={ci} className="px-3 py-2 text-left font-medium text-[var(--muted-foreground)]">{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, ri) => {
                const cells = row.split('|').filter(c => c.trim()).map(c => c.trim());
                return (
                  <tr key={ri} className="border-b border-[var(--border)] last:border-0">
                    {cells.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 text-[var(--foreground)]">{renderInline(cell)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
    // List items
    else if (line.trimStart().startsWith('- ')) {
      const indent = line.length - line.trimStart().length;
      elements.push(
        <div key={i} className="flex gap-2 text-xs text-[var(--foreground)]" style={{ paddingLeft: `${indent * 4 + 8}px` }}>
          <span className="text-[var(--muted-foreground)] flex-shrink-0">&#x2022;</span>
          <span>{renderInline(line.trimStart().slice(2))}</span>
        </div>
      );
    }
    // Numbered list
    else if (/^\d+\.\s/.test(line.trimStart())) {
      const match = line.trimStart().match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <div key={i} className="flex gap-2 text-xs text-[var(--foreground)] pl-2">
            <span className="text-[var(--muted-foreground)] flex-shrink-0 w-4 text-right">{match[1]}.</span>
            <span>{renderInline(match[2])}</span>
          </div>
        );
      }
    }
    // Empty line
    else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    }
    // Paragraph
    else {
      elements.push(
        <p key={i} className="text-xs leading-relaxed text-[var(--foreground)]">
          {renderInline(line)}
        </p>
      );
    }

    i++;
  }

  return <>{elements}</>;
}

// Inline markdown rendering: bold, italic, code, links
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Match: **bold**, *italic*, `code`, [link](url)
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      parts.push(<strong key={match.index} className="font-semibold">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={match.index}>{match[4]}</em>);
    } else if (match[5]) {
      parts.push(<code key={match.index} className="px-1 py-0.5 rounded bg-[var(--muted)] text-[var(--primary)] text-[11px] font-mono">{match[6]}</code>);
    } else if (match[7]) {
      parts.push(<span key={match.index} className="text-[var(--primary)] underline">{match[8]}</span>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

// ════════════════════════════════════════
// Custom Values Tab (Developer only)
// ════════════════════════════════════════

interface CustomValueDef {
  name: string;
  value: string;
}

function shouldUseAgencyAuthorize(
  provider: string,
  oauthMode: 'legacy' | 'hybrid' | 'agency' | undefined,
): boolean {
  return normalizeProviderId(provider) === 'ghl' && oauthMode === 'agency';
}

function buildAuthorizeHrefForAccount(input: {
  provider: string;
  accountKey: string;
  oauthMode: 'legacy' | 'hybrid' | 'agency' | undefined;
}): string {
  const provider = normalizeProviderId(input.provider);
  const params = new URLSearchParams({ provider });
  if (shouldUseAgencyAuthorize(provider, input.oauthMode)) {
    params.set('mode', 'agency');
  } else {
    params.set('accountKey', input.accountKey);
  }
  return `/api/esp/connections/authorize?${params.toString()}`;
}

interface AccountSyncStatus {
  key: string;
  dealer: string;
  provider: string;
  connectionType: 'oauth' | 'api-key' | 'none';
  oauthConnected: boolean;
  oauthMode?: 'legacy' | 'hybrid' | 'agency';
  locationId?: string;
  scopes: string[];
  requiredScopes: string[];
  hasRequiredScopes: boolean;
  needsReauthorization: boolean;
  supportsCustomValues: boolean;
  readyForSync: boolean;
  overrideCount: number;
  syncing: boolean;
  lastResult?: { created: number; updated: number; deleted: number; skipped: number; errors: number } | null;
  error?: string;
}

interface GhlAgencyStatus {
  connected: boolean;
  source: 'oauth' | 'env' | 'none';
  mode: 'legacy' | 'hybrid' | 'agency';
  scopes: string[];
  connectUrl?: string;
  warning?: string;
}

interface GhlBulkLinkDraftRow {
  line: number;
  raw: string;
  accountKey: string;
  locationId: string;
  locationName?: string;
  error?: string;
}

interface GhlBulkLinkResult {
  line: number;
  accountKey: string;
  locationId: string;
  locationName?: string | null;
  success: boolean;
  error?: string;
}

function CustomValuesTab() {
  const { accounts } = useAccount();
  const { markClean } = useUnsavedChanges();

  // ── Global Defaults state ──
  const [defaults, setDefaults] = useState<Record<string, CustomValueDef>>({});
  const [savedDefaults, setSavedDefaults] = useState<Record<string, CustomValueDef>>({});
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const [savingDefaults, setSavingDefaults] = useState(false);

  // New row being added
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showAddRow, setShowAddRow] = useState(false);

  // ── Account Sync state ──
  const [accountStatuses, setAccountStatuses] = useState<AccountSyncStatus[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [requiredScopesByProvider, setRequiredScopesByProvider] = useState<Record<string, string[]>>({});
  const [accountStatusRefreshNonce, setAccountStatusRefreshNonce] = useState(0);
  const [ghlAgencyStatus, setGhlAgencyStatus] = useState<GhlAgencyStatus | null>(null);
  const [ghlAgencyLoading, setGhlAgencyLoading] = useState(false);
  const [ghlAgencyDisconnecting, setGhlAgencyDisconnecting] = useState(false);
  const [ghlAgencyError, setGhlAgencyError] = useState<string | null>(null);
  const [showBulkLinkAssistant, setShowBulkLinkAssistant] = useState(false);
  const [bulkLinkInput, setBulkLinkInput] = useState('');
  const [bulkLinkPreview, setBulkLinkPreview] = useState<GhlBulkLinkDraftRow[]>([]);
  const [bulkLinkApplying, setBulkLinkApplying] = useState(false);
  const [bulkLinkResult, setBulkLinkResult] = useState<{
    total: number;
    linked: number;
    failed: number;
    results: GhlBulkLinkResult[];
  } | null>(null);

  const hasDefaultChanges = JSON.stringify(defaults) !== JSON.stringify(savedDefaults);

  // ── Load global defaults ──
  useEffect(() => {
    fetch('/api/custom-values')
      .then(r => r.json())
      .then(data => {
        const defs = data.defaults || {};
        setDefaults(defs);
        setSavedDefaults(defs);
      })
      .catch(() => toast.error('Failed to load custom value defaults'))
      .finally(() => setLoadingDefaults(false));
  }, []);

  // ── Load provider required OAuth scopes (provider-agnostic) ──
  useEffect(() => {
    let cancelled = false;

    async function loadRequiredScopes() {
      try {
        const scopeMap = await fetchRequiredScopesByCatalogUrl('/api/esp/providers');

        if (cancelled) return;
        setRequiredScopesByProvider((prev) => {
          return { ...prev, ...scopeMap };
        });
      } catch {
        // Best-effort metadata load; fallback behavior remains safe.
      }
    }

    loadRequiredScopes();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasGhlAgencyAccounts = accountStatuses.some(
    (status) => status.provider === 'ghl' && status.oauthMode === 'agency',
  );

  function parseBulkLinkInputValue(value: string): GhlBulkLinkDraftRow[] {
    const knownAccountKeys = new Set(Object.keys(accounts || {}));
    const rows: GhlBulkLinkDraftRow[] = [];
    const seenAccountKeys = new Set<string>();
    const lines = value.split(/\r?\n/);

    lines.forEach((rawLine, index) => {
      const line = index + 1;
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      const hasTabs = rawLine.includes('\t');
      const parts = (hasTabs ? rawLine.split('\t') : rawLine.split(','))
        .map((part) => part.trim());
      const accountKey = (parts[0] || '').trim();
      const locationId = (parts[1] || '').trim();
      const locationNameJoined = parts.slice(2).join(',').trim();
      const locationName = locationNameJoined || undefined;
      const firstToken = accountKey.toLowerCase();
      const secondToken = locationId.toLowerCase();
      const isHeaderRow = (
        (firstToken === 'accountkey' || firstToken === 'account_key' || firstToken === 'account')
        && (secondToken === 'locationid' || secondToken === 'location_id' || secondToken === 'location')
      );
      if (isHeaderRow) return;

      let error: string | undefined;
      if (!accountKey || !locationId) {
        error = 'Expected "accountKey,locationId[,locationName]"';
      } else if (!knownAccountKeys.has(accountKey)) {
        error = `Unknown account key "${accountKey}"`;
      } else if (seenAccountKeys.has(accountKey)) {
        error = `Duplicate account key "${accountKey}" in this batch`;
      } else {
        seenAccountKeys.add(accountKey);
      }

      rows.push({
        line,
        raw: rawLine,
        accountKey,
        locationId,
        ...(locationName ? { locationName } : {}),
        ...(error ? { error } : {}),
      });
    });

    return rows;
  }

  function handlePreviewBulkLinks() {
    const parsed = parseBulkLinkInputValue(bulkLinkInput);
    setBulkLinkPreview(parsed);
    setBulkLinkResult(null);
    if (parsed.length === 0) {
      toast.error('No mapping rows found. Paste one mapping per line.');
      return;
    }
    const validCount = parsed.filter((row) => !row.error).length;
    if (validCount === 0) {
      toast.error('No valid rows found. Fix validation errors and try again.');
      return;
    }
    toast.success(`Preview ready: ${validCount} valid row${validCount === 1 ? '' : 's'}`);
  }

  async function handleApplyBulkLinks() {
    const parsed = bulkLinkPreview.length > 0
      ? bulkLinkPreview
      : parseBulkLinkInputValue(bulkLinkInput);
    setBulkLinkPreview(parsed);
    setBulkLinkResult(null);

    const validRows = parsed.filter((row) => !row.error);
    if (validRows.length === 0) {
      toast.error('No valid rows to apply');
      return;
    }

    setBulkLinkApplying(true);
    try {
      const res = await fetch('/api/esp/connections/ghl/location-link/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings: validRows.map((row) => ({
            line: row.line,
            accountKey: row.accountKey,
            locationId: row.locationId,
            locationName: row.locationName,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to apply bulk location links',
        );
      }

      const result = {
        total: Number(data.total) || 0,
        linked: Number(data.linked) || 0,
        failed: Number(data.failed) || 0,
        results: Array.isArray(data.results) ? data.results as GhlBulkLinkResult[] : [],
      };
      setBulkLinkResult(result);
      setAccountStatusRefreshNonce((prev) => prev + 1);

      if (result.failed > 0) {
        toast.warning(`Linked ${result.linked}/${result.total} sub-accounts (${result.failed} failed)`);
      } else {
        toast.success(`Linked ${result.linked} sub-account${result.linked === 1 ? '' : 's'} successfully`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply bulk location links');
    } finally {
      setBulkLinkApplying(false);
    }
  }

  async function loadGhlAgencyStatus() {
    setGhlAgencyLoading(true);
    setGhlAgencyError(null);
    try {
      const res = await fetch('/api/esp/connections/ghl/agency');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load GHL agency status');
      }

      setGhlAgencyStatus({
        connected: data.connected === true,
        source: data.source === 'oauth' || data.source === 'env' ? data.source : 'none',
        mode:
          data.mode === 'legacy' || data.mode === 'hybrid' || data.mode === 'agency'
            ? data.mode
            : 'legacy',
        scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : [],
        connectUrl: typeof data.connectUrl === 'string' ? data.connectUrl : undefined,
        warning: typeof data.warning === 'string' ? data.warning : undefined,
      });
    } catch (err) {
      setGhlAgencyStatus(null);
      setGhlAgencyError(err instanceof Error ? err.message : 'Failed to load GHL agency status');
    } finally {
      setGhlAgencyLoading(false);
    }
  }

  async function handleDisconnectGhlAgency() {
    if (!confirm('Disconnect GHL agency OAuth? Sub-accounts linked via agency will stop syncing until reconnected.')) {
      return;
    }

    setGhlAgencyDisconnecting(true);
    setGhlAgencyError(null);
    try {
      const res = await fetch('/api/esp/connections/ghl/agency', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to disconnect GHL agency OAuth');
      }

      if (typeof data.warning === 'string' && data.warning.trim()) {
        toast.warning(data.warning);
      } else {
        toast.success('Disconnected GHL agency OAuth');
      }
      await loadGhlAgencyStatus();
      setAccountStatusRefreshNonce((prev) => prev + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect GHL agency OAuth';
      setGhlAgencyError(message);
      toast.error(message);
    } finally {
      setGhlAgencyDisconnecting(false);
    }
  }

  useEffect(() => {
    if (!hasGhlAgencyAccounts) {
      setGhlAgencyStatus(null);
      setGhlAgencyError(null);
      return;
    }

    void loadGhlAgencyStatus();
  }, [hasGhlAgencyAccounts]);

  // ── Load account statuses ──
  useEffect(() => {
    if (!accounts || Object.keys(accounts).length === 0) {
      setLoadingAccounts(false);
      return;
    }

    setLoadingAccounts(true);
    const keys = Object.keys(accounts);
    Promise.all(
      keys.map(key =>
        Promise.all([
          fetchProviderCatalogPayload(`/api/esp/providers?accountKey=${encodeURIComponent(key)}`)
            .then((payload) => payload || {
              accountProvider: accounts[key]?.espProvider || null,
              providers: [],
            }),
          fetch(`/api/custom-values/${encodeURIComponent(key)}`)
            .then(r => r.json())
            .catch(() => ({ overrides: {} })),
        ]).then(([providerCatalog, cv]) => {
          const providerEntries = extractProviderCatalog(providerCatalog as ProviderCatalogPayload);
          const providers = new Map(
            providerEntries.map((entry) => [entry.provider, entry] as const),
          );
          const provider = normalizeProviderId(
            (typeof providerCatalog?.accountProvider === 'string' && providerCatalog.accountProvider
              ? providerCatalog.accountProvider
              : accounts[key]?.espProvider) || 'unknown',
          ) || 'unknown';
          const accountData = accounts[key];
          const providerStatus = providers.get(provider) || null;
          const providerStatusResolver = createProviderStatusResolver({
            providerCatalog: providerEntries,
            account: accountData || {},
          });
          const resolvedProviderStatus = providerStatusResolver.getProviderStatus(provider);
          const supportsCustomValues = providerStatus?.capabilities?.customValues === true;
          const syncReadiness = resolveCustomValuesSyncReadiness({
            supportsCustomValues,
            providerStatus: resolvedProviderStatus,
            requiredScopes: requiredScopesByProvider[provider] || [],
          });
          return {
            key,
            dealer: accounts[key]?.dealer || key,
            provider,
            connectionType: resolvedProviderStatus.connectionType,
            oauthConnected: resolvedProviderStatus.oauthConnected,
            oauthMode: providerStatus?.oauthMode,
            locationId: resolvedProviderStatus.locationId
              || resolvedProviderStatus.accountId
              || resolveAccountLocationId(accounts[key]),
            scopes: resolvedProviderStatus.scopes,
            requiredScopes: syncReadiness.requiredScopes,
            hasRequiredScopes: syncReadiness.hasRequiredScopes,
            needsReauthorization: syncReadiness.needsReauthorization,
            supportsCustomValues: syncReadiness.supportsCustomValues,
            readyForSync: syncReadiness.readyForSync,
            overrideCount: Object.keys(cv.overrides || {}).length,
            syncing: false,
            lastResult: null,
            error: undefined,
          } as AccountSyncStatus;
        })
      )
    ).then(statuses => {
      setAccountStatuses(statuses);
      setLoadingAccounts(false);
    });
  }, [accounts, requiredScopesByProvider, accountStatusRefreshNonce]);

  // ── Save global defaults ──
  async function handleSaveDefaults() {
    setSavingDefaults(true);
    try {
      const res = await fetch('/api/custom-values', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaults }),
      });
      if (res.ok) {
        setSavedDefaults({ ...defaults });
        markClean();
        toast.success('Custom value defaults saved');
      } else {
        toast.error('Failed to save defaults');
      }
    } catch {
      toast.error('Failed to save defaults');
    }
    setSavingDefaults(false);
  }

  // ── Add a new default row ──
  function handleAddDefault() {
    const key = newFieldKey.trim().replace(/\s+/g, '_').toLowerCase();
    if (!key || !newName.trim()) {
      toast.error('Field key and display name are required');
      return;
    }
    if (defaults[key]) {
      toast.error(`Field key "${key}" already exists`);
      return;
    }
    setDefaults(prev => ({
      ...prev,
      [key]: { name: newName.trim(), value: newValue },
    }));
    setNewFieldKey('');
    setNewName('');
    setNewValue('');
    setShowAddRow(false);
  }

  // ── Remove a default ──
  function handleRemoveDefault(fieldKey: string) {
    setDefaults(prev => {
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
  }

  // ── Sync single account ──
  async function handleSyncAccount(accountKey: string) {
    setAccountStatuses(prev =>
      prev.map(a => a.key === accountKey ? { ...a, syncing: true, lastResult: null, error: undefined } : a)
    );

    try {
      const res = await fetch(`/api/custom-values/${encodeURIComponent(accountKey)}/sync`, {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok && data.result) {
        const r = data.result;
        setAccountStatuses(prev =>
          prev.map(a => a.key === accountKey ? {
            ...a,
            syncing: false,
            lastResult: {
              created: r.created?.length || 0,
              updated: r.updated?.length || 0,
              deleted: r.deleted?.length || 0,
              skipped: r.skipped?.length || 0,
              errors: r.errors?.length || 0,
            },
          } : a)
        );
        toast.success(`Synced custom values for ${accountKey}`);
      } else {
        setAccountStatuses(prev =>
          prev.map(a => a.key === accountKey ? {
            ...a,
            syncing: false,
            error: data.error || 'Sync failed',
          } : a)
        );
        toast.error(data.error || 'Sync failed');
      }
    } catch {
      setAccountStatuses(prev =>
        prev.map(a => a.key === accountKey ? { ...a, syncing: false, error: 'Network error' } : a)
      );
      toast.error('Network error during sync');
    }
  }

  // ── Bulk sync ──
  async function handleBulkSync(keys: string[]) {
    const connectedKeys = keys.filter(k => {
      const a = accountStatuses.find(s => s.key === k);
      return a?.readyForSync;
    });
    if (connectedKeys.length === 0) {
      toast.error('No eligible accounts to sync');
      return;
    }

    setBulkSyncing(true);
    setBulkProgress({ done: 0, total: connectedKeys.length });

    // Mark all as syncing
    setAccountStatuses(prev =>
      prev.map(a => connectedKeys.includes(a.key) ? { ...a, syncing: true, lastResult: null, error: undefined } : a)
    );

    try {
      const res = await fetch('/api/custom-values/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountKeys: connectedKeys }),
      });
      const data = await res.json();
      const results = data.results || {};

      setAccountStatuses(prev =>
        prev.map(a => {
          if (!connectedKeys.includes(a.key)) return a;
          const r = results[a.key];
          if (!r) return { ...a, syncing: false, error: 'No result returned' };
          if ('skipped' in r && r.skipped === true) return { ...a, syncing: false, error: r.error || 'Skipped' };
          return {
            ...a,
            syncing: false,
            lastResult: {
              created: r.created?.length || 0,
              updated: r.updated?.length || 0,
              deleted: r.deleted?.length || 0,
              skipped: r.skipped?.length || 0,
              errors: r.errors?.length || 0,
            },
          };
        })
      );

      const successCount = Object.values(results).filter((r: unknown) => r && typeof r === 'object' && !('skipped' in (r as Record<string, unknown>))).length;
      toast.success(`Synced ${successCount} of ${connectedKeys.length} accounts`);
    } catch {
      setAccountStatuses(prev =>
        prev.map(a => connectedKeys.includes(a.key) ? { ...a, syncing: false, error: 'Bulk sync failed' } : a)
      );
      toast.error('Bulk sync failed');
    }

    setBulkSyncing(false);
    setBulkProgress(null);
    setSelectedKeys(new Set());
  }

  const connectedAccounts = accountStatuses.filter(a => a.readyForSync);
  const ghlAgencyUnlinkedAccounts = accountStatuses.filter((status) => (
    status.provider === 'ghl'
    && status.oauthMode === 'agency'
    && !status.locationId
  ));
  const ghlAgencyLinkedAccounts = accountStatuses.filter((status) => (
    status.provider === 'ghl'
    && status.oauthMode === 'agency'
    && Boolean(status.locationId)
  ));
  const bulkPreviewValidRows = bulkLinkPreview.filter((row) => !row.error);
  const bulkPreviewInvalidRows = bulkLinkPreview.filter((row) => row.error);
  const allSelected = connectedAccounts.length > 0 && connectedAccounts.every(a => selectedKeys.has(a.key));
  const inputClass = 'w-full px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--card)] focus:outline-none focus:border-[var(--primary)]';
  const sectionCardClass = 'glass-section-card rounded-xl p-6';

  return (
    <div className="max-w-7xl grid grid-cols-1 gap-6">
      {/* ── Section 1: Global Defaults ── */}
      <section className={sectionCardClass}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Global Default Values</h3>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Define custom values that apply to all sub-accounts. Sub-accounts can override individual values.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasDefaultChanges && (
              <span className="text-xs text-amber-500 font-medium">Unsaved changes</span>
            )}
            <button
              onClick={handleSaveDefaults}
              disabled={savingDefaults || !hasDefaultChanges}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {savingDefaults ? 'Saving...' : 'Save Defaults'}
            </button>
          </div>
        </div>

        {loadingDefaults ? (
          <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">Loading...</div>
        ) : (
          <div className="glass-table">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--muted)] border-b border-[var(--border)]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider w-1/4">Field Key</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider w-1/4">Display Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Default Value</th>
                  <th className="w-10 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(defaults).map(([fieldKey, def]) => (
                  <tr key={fieldKey} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-4 py-2">
                      <span className="text-xs font-mono text-[var(--muted-foreground)]">{fieldKey}</span>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={def.name}
                        onChange={e => setDefaults(prev => ({
                          ...prev,
                          [fieldKey]: { ...prev[fieldKey], name: e.target.value },
                        }))}
                        className={inputClass}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={def.value}
                        onChange={e => setDefaults(prev => ({
                          ...prev,
                          [fieldKey]: { ...prev[fieldKey], value: e.target.value },
                        }))}
                        placeholder="Default value (can be empty)"
                        className={inputClass}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handleRemoveDefault(fieldKey)}
                        className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Remove"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}

                {/* Add new row */}
                {showAddRow && (
                  <tr className="border-b border-[var(--border)] bg-[var(--primary)]/5">
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={newFieldKey}
                        onChange={e => setNewFieldKey(e.target.value)}
                        placeholder="e.g. sales_phone"
                        className={inputClass}
                        autoFocus
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="e.g. Sales Phone"
                        className={inputClass}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={newValue}
                        onChange={e => setNewValue(e.target.value)}
                        placeholder="Default value"
                        className={inputClass}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={handleAddDefault}
                          className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          title="Add"
                        >
                          <CheckCircleIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setShowAddRow(false); setNewFieldKey(''); setNewName(''); setNewValue(''); }}
                          className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Cancel"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!showAddRow && (
          <button
            onClick={() => setShowAddRow(true)}
            className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[var(--primary)] hover:opacity-80 transition-opacity"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Add Custom Value
          </button>
        )}

        <p className="text-[10px] text-[var(--muted-foreground)] mt-3">
          Template token format: <code className="px-1 py-0.5 rounded bg-[var(--muted)] text-[var(--primary)] font-mono">{'{{custom_values.<field_key>}}'}</code>
        </p>
      </section>

      {/* ── Section 2: Account Sync ── */}
      <section className={sectionCardClass}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Push to Connected ESP Sub-Accounts</h3>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Sync custom values to sub-accounts whose active provider supports custom values and has a valid connection.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedKeys.size > 0 && (
              <button
                onClick={() => handleBulkSync(Array.from(selectedKeys))}
                disabled={bulkSyncing}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                <ArrowPathIcon className={`w-4 h-4 ${bulkSyncing ? 'animate-spin' : ''}`} />
                Push to Selected ({selectedKeys.size})
              </button>
            )}
            <button
              onClick={() => handleBulkSync(connectedAccounts.map(a => a.key))}
              disabled={bulkSyncing || connectedAccounts.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-40"
            >
              <ArrowPathIcon className={`w-4 h-4 ${bulkSyncing ? 'animate-spin' : ''}`} />
              Push to All Ready
            </button>
          </div>
        </div>

        {hasGhlAgencyAccounts && (
          <div className="glass-card rounded-lg p-3 mb-4 border border-[var(--border)] bg-[var(--muted)]/40 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[var(--foreground)]">GHL Agency OAuth</p>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                  Agency mode is active for {ghlAgencyLinkedAccounts.length + ghlAgencyUnlinkedAccounts.length} sub-account{ghlAgencyLinkedAccounts.length + ghlAgencyUnlinkedAccounts.length !== 1 ? 's' : ''}. Link each sub-account to a location in Sub-Account Integrations.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-[10px] rounded-full border ${
                  ghlAgencyStatus?.connected
                    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                    : 'text-[var(--muted-foreground)] border-[var(--border)] bg-[var(--card)]'
                }`}>
                  {ghlAgencyLoading
                    ? 'Checking...'
                    : ghlAgencyStatus?.connected
                      ? `Connected (${ghlAgencyStatus.source})`
                      : 'Not connected'}
                </span>
                <button
                  onClick={() => void loadGhlAgencyStatus()}
                  disabled={ghlAgencyLoading}
                  className="px-2.5 py-1.5 text-[11px] rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
                >
                  Refresh
                </button>
                {ghlAgencyStatus?.connected ? (
                  <button
                    onClick={() => void handleDisconnectGhlAgency()}
                    disabled={ghlAgencyDisconnecting}
                    className="px-2.5 py-1.5 text-[11px] rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    {ghlAgencyDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                ) : (
                  <a
                    href={ghlAgencyStatus?.connectUrl || '/api/esp/connections/authorize?provider=ghl&mode=agency'}
                    className="px-2.5 py-1.5 text-[11px] rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
                  >
                    Connect
                  </a>
                )}
              </div>
            </div>

            {ghlAgencyError && (
              <p className="text-[11px] text-amber-400">{ghlAgencyError}</p>
            )}

            {ghlAgencyStatus?.connected && ghlAgencyUnlinkedAccounts.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <p className="text-[11px] text-amber-400">
                  {ghlAgencyUnlinkedAccounts.length} sub-account{ghlAgencyUnlinkedAccounts.length !== 1 ? 's' : ''} still need a location link.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ghlAgencyUnlinkedAccounts.slice(0, 8).map((accountStatus) => (
                    <a
                      key={accountStatus.key}
                      href={`/settings/accounts/${encodeURIComponent(accountStatus.key)}?tab=integration`}
                      className="text-[10px] px-2 py-1 rounded-full border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 transition-colors"
                    >
                      {accountStatus.dealer}
                    </a>
                  ))}
                  {ghlAgencyUnlinkedAccounts.length > 8 && (
                    <span className="text-[10px] px-2 py-1 rounded-full border border-[var(--border)] text-[var(--muted-foreground)]">
                      +{ghlAgencyUnlinkedAccounts.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-[var(--foreground)]">Bulk Location Link Assistant</p>
                  <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                    Paste one mapping per line: <span className="font-mono">accountKey,locationId[,locationName]</span>
                  </p>
                </div>
                <button
                  onClick={() => setShowBulkLinkAssistant((prev) => !prev)}
                  className="px-2.5 py-1.5 text-[11px] rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                >
                  {showBulkLinkAssistant ? 'Hide' : 'Show'}
                </button>
              </div>

              {showBulkLinkAssistant && (
                <div className="space-y-3">
                  {!ghlAgencyStatus?.connected && (
                    <p className="text-[11px] text-amber-400">
                      Connect GHL agency OAuth before applying bulk location links.
                    </p>
                  )}

                  <textarea
                    value={bulkLinkInput}
                    onChange={(event) => setBulkLinkInput(event.target.value)}
                    placeholder={'accountKey,locationId,locationName\nacme-motors,abc123,Acme Motors Main'}
                    className="w-full h-36 resize-y rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-mono focus:outline-none focus:border-[var(--primary)]"
                  />

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePreviewBulkLinks}
                      className="px-3 py-2 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => void handleApplyBulkLinks()}
                      disabled={!ghlAgencyStatus?.connected || bulkLinkApplying}
                      className="px-3 py-2 text-xs font-medium rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                    >
                      {bulkLinkApplying ? 'Applying...' : 'Apply Links'}
                    </button>
                  </div>

                  {bulkLinkPreview.length > 0 && (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 px-3 py-2 space-y-2">
                      <p className="text-[11px] text-[var(--muted-foreground)]">
                        Preview: {bulkPreviewValidRows.length} valid, {bulkPreviewInvalidRows.length} invalid
                      </p>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {bulkLinkPreview.slice(0, 20).map((row) => (
                          <div key={`${row.line}-${row.accountKey}-${row.locationId}`} className="text-[11px] font-mono">
                            <span className="text-[var(--muted-foreground)]">L{row.line}</span>{' '}
                            <span>{row.accountKey || '(missing sub-account)'}</span>
                            <span className="text-[var(--muted-foreground)]">{' -> '}</span>
                            <span>{row.locationId || '(missing location)'}</span>{' '}
                            {row.error ? (
                              <span className="text-red-400">({row.error})</span>
                            ) : (
                              <span className="text-emerald-400">(ok)</span>
                            )}
                          </div>
                        ))}
                        {bulkLinkPreview.length > 20 && (
                          <p className="text-[10px] text-[var(--muted-foreground)]">
                            +{bulkLinkPreview.length - 20} additional row{bulkLinkPreview.length - 20 === 1 ? '' : 's'}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {bulkLinkResult && (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 px-3 py-2 space-y-2">
                      <p className="text-[11px] text-[var(--muted-foreground)]">
                        Result: {bulkLinkResult.linked}/{bulkLinkResult.total} linked
                        {bulkLinkResult.failed > 0 ? `, ${bulkLinkResult.failed} failed` : ''}
                      </p>
                      {bulkLinkResult.failed > 0 && (
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {bulkLinkResult.results.filter((row) => !row.success).slice(0, 20).map((row) => (
                            <p key={`result-${row.line}-${row.accountKey}`} className="text-[11px] font-mono text-red-400">
                              L{row.line} {row.accountKey} {' -> '} {row.locationId}: {row.error || 'Failed'}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {accountStatuses.some((accountStatus) => accountStatus.needsReauthorization) && (
          <div className="glass-card rounded-lg p-3 mb-4 border border-amber-500/20 bg-amber-500/5">
            <p className="text-[11px] text-amber-400">
              <strong>Re-authorization required:</strong> Some OAuth-connected sub-accounts are missing required scopes for custom value sync. Click &quot;Re-auth needed&quot; next to each sub-account to grant the required scopes.
            </p>
          </div>
        )}

        {bulkProgress && (
          <div className="mb-4">
            <div className="h-1.5 rounded-full bg-[var(--muted)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
                style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
              />
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              Syncing {bulkProgress.done} of {bulkProgress.total} accounts...
            </p>
          </div>
        )}

        {loadingAccounts ? (
          <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">Loading sub-accounts...</div>
        ) : accountStatuses.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
            No sub-accounts found. Create a sub-account first.
          </div>
        ) : (
          <div className="glass-table">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--muted)] border-b border-[var(--border)]">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedKeys(new Set(connectedAccounts.map(a => a.key)));
                        } else {
                          setSelectedKeys(new Set());
                        }
                      }}
                      className="rounded border-[var(--border)]"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Sub-Account</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Connection</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Overrides</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Status</th>
                  <th className="w-24 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {accountStatuses.map(acct => (
                  <tr key={acct.key} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(acct.key)}
                        disabled={!acct.readyForSync}
                        onChange={e => {
                          setSelectedKeys(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(acct.key);
                            else next.delete(acct.key);
                            return next;
                          });
                        }}
                        className="rounded border-[var(--border)] disabled:opacity-30"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-[var(--foreground)]">{acct.dealer}</span>
                      <span className="block text-[10px] font-mono text-[var(--muted-foreground)]">{acct.key}</span>
                      <span className="block text-[10px] text-[var(--muted-foreground)]">{providerDisplayName(acct.provider)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {!acct.supportsCustomValues ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                          <ExclamationTriangleIcon className="w-2.5 h-2.5" /> Unsupported
                        </span>
                      ) : acct.readyForSync ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          <CheckCircleIcon className="w-2.5 h-2.5" />
                          {providerDisplayName(acct.provider)}{' '}
                          {acct.connectionType === 'oauth'
                            ? 'OAuth'
                            : acct.connectionType === 'api-key'
                              ? 'API Key'
                              : 'Connected'}
                        </span>
                      ) : acct.needsReauthorization ? (
                        <a
                          href={buildAuthorizeHrefForAccount({
                            provider: acct.provider,
                            accountKey: acct.key,
                            oauthMode: acct.oauthMode,
                          })}
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full hover:bg-amber-500/20 transition-colors"
                          title={`Re-authorize ${providerDisplayName(acct.provider)} to grant required scopes`}
                        >
                          <ExclamationTriangleIcon className="w-2.5 h-2.5" /> Re-auth needed
                        </a>
                      ) : (
                        acct.provider === 'ghl'
                        && acct.oauthMode === 'agency'
                        && ghlAgencyStatus?.connected
                        && !acct.locationId
                      ) ? (
                        <a
                          href={`/settings/accounts/${encodeURIComponent(acct.key)}?tab=integration`}
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full hover:bg-amber-500/20 transition-colors"
                          title="Link this sub-account to a GHL location"
                        >
                          <ExclamationTriangleIcon className="w-2.5 h-2.5" /> Link location
                        </a>
                      ) : (
                        <span className="text-xs text-[var(--muted-foreground)]">Not connected</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {acct.overrideCount > 0 ? (
                        <span className="text-xs text-[var(--primary)] font-medium">
                          {acct.overrideCount} override{acct.overrideCount !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--muted-foreground)]">Defaults only</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {acct.syncing ? (
                        <span className="text-xs text-[var(--muted-foreground)]">Syncing...</span>
                      ) : acct.error ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
                          <ExclamationTriangleIcon className="w-3 h-3" /> {acct.error}
                        </span>
                      ) : acct.lastResult ? (
                        <span className="text-[10px] text-[var(--muted-foreground)]">
                          {acct.lastResult.created > 0 && <span className="text-emerald-400">{acct.lastResult.created} created</span>}
                          {acct.lastResult.updated > 0 && <span className="text-blue-400 ml-1">{acct.lastResult.updated} updated</span>}
                          {acct.lastResult.deleted > 0 && <span className="text-orange-400 ml-1">{acct.lastResult.deleted} deleted</span>}
                          {acct.lastResult.skipped > 0 && <span className="ml-1">{acct.lastResult.skipped} unchanged</span>}
                          {acct.lastResult.errors > 0 && <span className="text-red-400 ml-1">{acct.lastResult.errors} errors</span>}
                          {acct.lastResult.created === 0 && acct.lastResult.updated === 0 && acct.lastResult.deleted === 0 && acct.lastResult.errors === 0 && (
                            <span className="text-emerald-400">All up to date</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--muted-foreground)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleSyncAccount(acct.key)}
                        disabled={!acct.readyForSync || acct.syncing}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={
                          !acct.supportsCustomValues
                            ? providerUnsupportedMessage(acct.provider, 'custom values')
                            : !acct.readyForSync
                              ? acct.needsReauthorization
                                ? `Re-authorize ${providerDisplayName(acct.provider)} to enable custom values`
                                : acct.provider === 'ghl' && acct.oauthMode === 'agency' && ghlAgencyStatus?.connected && !acct.locationId
                                  ? 'Link this sub-account to a GHL location in Integrations'
                                : `Connect ${providerDisplayName(acct.provider)} first`
                              : `Push custom values to ${providerDisplayName(acct.provider)}`
                        }
                      >
                        <ArrowPathIcon className={`w-3 h-3 ${acct.syncing ? 'animate-spin' : ''}`} />
                        Push
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// IntegrationsTab removed — integrations are now managed per-account on the account detail page

// ════════════════════════════════════════
// Appearance Tab
// ════════════════════════════════════════
function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  const options: { value: 'dark' | 'light'; label: string; icon: typeof SunIcon; description: string }[] = [
    { value: 'dark', label: 'Dark', icon: MoonIcon, description: 'Dark background with light text' },
    { value: 'light', label: 'Light', icon: SunIcon, description: 'Light background with dark text' },
  ];
  const sectionCardClass = 'glass-section-card rounded-xl p-6';

  return (
    <div className="max-w-4xl">
      <section className={sectionCardClass}>
        <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Theme</h3>
        <p className="text-sm text-[var(--muted-foreground)] mb-6">
          Choose how Loomi Studio looks to you.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {options.map(opt => {
            const isActive = theme === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                  isActive
                    ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                    : 'border-[var(--border)] hover:border-[var(--muted-foreground)]'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isActive ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                }`}>
                  <opt.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className={`text-sm font-medium ${isActive ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}`}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">{opt.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
