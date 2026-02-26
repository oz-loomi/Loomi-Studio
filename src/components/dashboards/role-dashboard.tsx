'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import {
  ArrowPathIcon,
  BookOpenIcon,
  BuildingStorefrontIcon,
  ChartBarIcon,
  CheckCircleIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  PaperAirplaneIcon,
  PhotoIcon,
  UserGroupIcon,
  UsersIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAccount, type AccountData } from '@/contexts/account-context';
import { useTheme } from '@/contexts/theme-context';
import { roleDisplayName } from '@/lib/roles';
import { DashboardToolbar, type AccountOption, type CustomDateRange } from '@/components/filters/dashboard-toolbar';
import {
  type DateRangeBounds,
  type DateRangeKey,
  DATE_RANGE_PRESETS,
  DEFAULT_DATE_RANGE,
  filterByDateRange,
  getDateRangeBounds,
  getMonthBuckets,
} from '@/lib/date-ranges';
import { parseEmailListPayload, type EmailListItem } from '@/lib/email-list-payload';
import { EmailAnalytics } from '@/components/analytics/email-analytics';
import { ContactAnalytics } from '@/components/contacts/contact-analytics';
import { CampaignPageAnalytics } from '@/components/campaigns/campaign-page-analytics';
import { FlowAnalytics } from '@/components/flows/flow-analytics';
import { AccountHealthGrid } from '@/components/analytics/account-health-grid';
import { AccountAvatar } from '@/components/account-avatar';
import { formatRatePct, sumCampaignEngagement } from '@/lib/campaign-engagement';
import { FlowIcon } from '@/components/icon-map';

type ManagementRole = 'developer' | 'super_admin' | 'admin';
type DeveloperMode = 'analytics' | 'technical';

type AggregateContact = {
  id: string;
  fullName: string;
  tags: string[];
  dateAdded: string;
  source: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  lastServiceDate: string;
  nextServiceDate: string;
  leaseEndDate: string;
  warrantyEndDate: string;
  purchaseDate: string;
  _accountKey?: string;
  _dealer?: string;
};

type EspCampaign = {
  id: string;
  name: string;
  status: string;
  accountKey?: string;
  dealer?: string;
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
};

type EspWorkflow = {
  id: string;
  name: string;
  status: string;
  accountKey?: string;
  dealer?: string;
  createdAt?: string;
  updatedAt?: string;
};

type LoomiEmailCampaign = {
  id: string;
  name: string;
  subject: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  accountKeys: string[];
  createdAt: string;
  updatedAt: string;
  scheduledFor?: string;
};

type LoomiSmsCampaign = {
  id: string;
  name: string;
  message: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  accountKeys: string[];
  createdAt: string;
  updatedAt: string;
  scheduledFor?: string;
};

type ContactStatsRow = {
  dealer: string;
  contactCount: number | null;
  connected: boolean;
  cached?: boolean;
  provider?: string;
  error?: string;
};

type AccountRollup = {
  contactCount: number;
  emailCount: number;
  campaignCount: number;
  workflowCount: number;
  loomiCampaignCount: number;
  isConnected: boolean;
  hasError: boolean;
};

type ApiHealthSnapshot = {
  label: string;
  ok: boolean;
  detail: string;
  href?: string;
};

type UserSummary = {
  id: string;
  role: string;
};

type RepScopeOption = {
  id: string;
  label: string;
  accountCount: number;
};

type SuperAdminFilterPreset = {
  id: string;
  name: string;
  accountKeys: string[];
  repIds: string[];
  dateRange: DateRangeKey;
  customRange: { start: string; end: string } | null;
  createdAt: string;
};

const UNASSIGNED_REP_ID = '__unassigned__';
const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

const DATE_FIELDS_FOR_CAMPAIGNS = ['sentAt', 'scheduledAt', 'updatedAt', 'createdAt'] as const;
const DASHBOARD_DUMMY_MODE = process.env.NEXT_PUBLIC_DASHBOARD_DUMMY_DATA === '1';

function parseJsonSafe<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  return value as T;
}

function normalizeAccountOptions(accounts: Record<string, AccountData>): AccountOption[] {
  return Object.entries(accounts)
    .map(([key, account]) => ({
      key,
      label: account.dealer || key,
      storefrontImage: account.storefrontImage,
      logos: account.logos,
      city: account.city,
      state: account.state,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function firstCampaignDate(campaign: EspCampaign): string | null {
  for (const field of DATE_FIELDS_FOR_CAMPAIGNS) {
    const value = campaign[field];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function inBounds(dateValue: string | undefined | null, bounds: DateRangeBounds): boolean {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  if (!bounds.start) return date.getTime() <= bounds.end.getTime();
  return date.getTime() >= bounds.start.getTime() && date.getTime() <= bounds.end.getTime();
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function relativeTime(iso?: string): string {
  if (!iso) return 'Unknown';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

function intersectsAccountSet(accountKeys: string[] | undefined, scopedAccountSet: Set<string>): boolean {
  if (!Array.isArray(accountKeys) || accountKeys.length === 0) return false;
  return accountKeys.some((key) => scopedAccountSet.has(key));
}

function isDateRangeKey(value: unknown): value is DateRangeKey {
  return typeof value === 'string' && DATE_RANGE_PRESETS.some((preset) => preset.key === value);
}

function accountRepScopeId(account: AccountData | undefined): string {
  if (!account) return UNASSIGNED_REP_ID;
  const repId = account.accountRep?.id || account.accountRepId;
  if (typeof repId === 'string' && repId.trim()) return repId;
  return UNASSIGNED_REP_ID;
}

function daysAgoIso(daysAgo: number, hour = 10): string {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

function buildMockManagementDataset(accounts: Record<string, AccountData>) {
  const fallbackAccountKeys = ['demoAccount001', 'demoAccount002', 'demoAccount003', 'demoAccount004', 'demoAccount005'];
  const accountKeys = Object.keys(accounts).length > 0 ? Object.keys(accounts) : fallbackAccountKeys;

  const emails: EmailListItem[] = [];
  const contactStats: Record<string, ContactStatsRow> = {};
  const contacts: AggregateContact[] = [];
  const espCampaigns: EspCampaign[] = [];
  const espWorkflows: EspWorkflow[] = [];
  const loomiEmailCampaigns: LoomiEmailCampaign[] = [];
  const loomiSmsCampaigns: LoomiSmsCampaign[] = [];
  const campaignPerAccount: Record<string, { dealer: string; count: number; connected: boolean; provider: string }> = {};
  const workflowPerAccount: Record<string, { dealer: string; count: number; connected: boolean; provider: string }> = {};

  for (const [index, accountKey] of accountKeys.entries()) {
    const dealer = accounts[accountKey]?.dealer || `Demo Account ${String(index + 1).padStart(3, '0')}`;
    const connected = index % 5 !== 0;
    const totalContacts = 1300 + index * 280;

    contactStats[accountKey] = {
      dealer,
      contactCount: totalContacts,
      connected,
      cached: true,
      provider: 'ghl',
      error: connected ? undefined : 'Mock integration warning',
    };

    campaignPerAccount[accountKey] = {
      dealer,
      count: 14 + index * 2,
      connected,
      provider: 'ghl',
    };

    workflowPerAccount[accountKey] = {
      dealer,
      count: 7 + index,
      connected,
      provider: 'ghl',
    };

    for (let i = 0; i < 8; i += 1) {
      const day = (index * 11 + i * 6) % 170;
      emails.push({
        id: `mock-email-${accountKey}-${i}`,
        name: `${dealer} Template ${i + 1}`,
        accountKey,
        status: i % 4 === 0 ? 'draft' : 'active',
        createdAt: daysAgoIso(day, 9),
        updatedAt: daysAgoIso(Math.max(0, day - 2), 11),
        templateId: `tpl-${accountKey}-${i}`,
        templateSlug: `service-reminder-${i + 1}`,
        templateTitle: `Service Reminder ${i + 1}`,
      });
    }

    for (let i = 0; i < 40; i += 1) {
      const day = (index * 7 + i * 3) % 180;
      contacts.push({
        id: `mock-contact-${accountKey}-${i}`,
        fullName: `${dealer} Lead ${i + 1}`,
        tags: i % 3 === 0 ? ['service'] : i % 3 === 1 ? ['sales'] : ['campaign'],
        dateAdded: daysAgoIso(day, 13),
        source: i % 2 === 0 ? 'service' : 'sales',
        vehicleMake: 'Chevrolet',
        vehicleModel: i % 2 === 0 ? 'Silverado' : 'Equinox',
        vehicleYear: String(2018 + (i % 7)),
        lastServiceDate: daysAgoIso(day + 25, 14),
        nextServiceDate: daysAgoIso(Math.max(0, day - 65), 14),
        leaseEndDate: daysAgoIso(Math.max(0, day - 220), 15),
        warrantyEndDate: daysAgoIso(Math.max(0, day - 420), 15),
        purchaseDate: daysAgoIso(day + 420, 12),
        _accountKey: accountKey,
        _dealer: dealer,
      });
    }

    for (let i = 0; i < 14; i += 1) {
      const day = (index * 5 + i * 6) % 170;
      const status = i % 4 === 0 ? 'scheduled' : i % 4 === 1 ? 'active' : 'sent';
      const sentCount = 300 + index * 65 + i * 35;
      const deliveredCount = Math.max(0, Math.round(sentCount * 0.95));
      const openedCount = Math.round(deliveredCount * (0.24 + ((i % 4) * 0.03)));
      const clickedCount = Math.round(deliveredCount * (0.06 + ((i % 3) * 0.015)));
      const repliedCount = Math.round(deliveredCount * (0.02 + ((i % 3) * 0.005)));

      espCampaigns.push({
        id: `mock-esp-campaign-${accountKey}-${i}`,
        name: `${dealer} Campaign ${i + 1}`,
        status,
        accountKey,
        dealer,
        createdAt: daysAgoIso(day + 2, 10),
        updatedAt: daysAgoIso(day, 11),
        scheduledAt: status === 'scheduled' ? daysAgoIso(Math.max(0, day - 4), 9) : undefined,
        sentAt: status === 'sent' ? daysAgoIso(day, 16) : undefined,
        sentCount,
        deliveredCount,
        openedCount,
        clickedCount,
        repliedCount,
        bouncedCount: Math.round(sentCount * 0.01),
        failedCount: Math.round(sentCount * 0.015),
        unsubscribedCount: Math.round(sentCount * 0.004),
        openRate: deliveredCount > 0 ? openedCount / deliveredCount : 0,
        clickRate: deliveredCount > 0 ? clickedCount / deliveredCount : 0,
        replyRate: deliveredCount > 0 ? repliedCount / deliveredCount : 0,
      });
    }

    for (let i = 0; i < 8; i += 1) {
      const day = (index * 8 + i * 9) % 180;
      espWorkflows.push({
        id: `mock-workflow-${accountKey}-${i}`,
        name: `${dealer} Flow ${i + 1}`,
        status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'draft' : 'paused',
        accountKey,
        dealer,
        createdAt: daysAgoIso(day + 30, 8),
        updatedAt: daysAgoIso(day, 8),
      });
    }

    for (let i = 0; i < 5; i += 1) {
      const day = (index * 6 + i * 11) % 150;
      loomiEmailCampaigns.push({
        id: `mock-loomi-email-${accountKey}-${i}`,
        name: `${dealer} Loomi Email ${i + 1}`,
        subject: `Exclusive Service Offer ${i + 1}`,
        status: i % 2 === 0 ? 'completed' : 'scheduled',
        totalRecipients: 550 + index * 80 + i * 55,
        sentCount: 510 + index * 72 + i * 45,
        failedCount: 12 + i * 2,
        accountKeys: [accountKey],
        createdAt: daysAgoIso(day + 5, 10),
        updatedAt: daysAgoIso(day, 12),
        scheduledFor: i % 2 === 1 ? daysAgoIso(Math.max(0, day - 3), 9) : undefined,
      });

      loomiSmsCampaigns.push({
        id: `mock-loomi-sms-${accountKey}-${i}`,
        name: `${dealer} Loomi SMS ${i + 1}`,
        message: `Service reminder for ${dealer}`,
        status: i % 2 === 0 ? 'completed' : 'scheduled',
        totalRecipients: 400 + index * 60 + i * 40,
        sentCount: 378 + index * 52 + i * 34,
        failedCount: 10 + i * 2,
        accountKeys: [accountKey],
        createdAt: daysAgoIso(day + 7, 9),
        updatedAt: daysAgoIso(day, 10),
        scheduledFor: i % 2 === 1 ? daysAgoIso(Math.max(0, day - 2), 9) : undefined,
      });
    }
  }

  const users: UserSummary[] = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `mock-dev-${i}`, role: 'developer' })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `mock-sa-${i}`, role: 'super_admin' })),
    ...Array.from({ length: 14 }, (_, i) => ({ id: `mock-admin-${i}`, role: 'admin' })),
    ...Array.from({ length: 18 }, (_, i) => ({ id: `mock-client-${i}`, role: 'client' })),
  ];

  return {
    emails,
    contactStats,
    contacts,
    espCampaigns,
    espWorkflows,
    loomiEmailCampaigns,
    loomiSmsCampaigns,
    users,
    campaignPerAccount,
    workflowPerAccount,
  };
}

function roleOrder(role: string): number {
  if (role === 'developer') return 0;
  if (role === 'super_admin') return 1;
  if (role === 'admin') return 2;
  if (role === 'client') return 3;
  return 4;
}

function buildRoleCount(users: UserSummary[]): Array<{ role: string; count: number }> {
  const counts = new Map<string, number>();
  for (const user of users) {
    const role = user.role || 'unknown';
    counts.set(role, (counts.get(role) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => roleOrder(a.role) - roleOrder(b.role));
}

function valueOrDash(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return value.toLocaleString();
}

function toPossessiveLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'Account';
  return /s$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}'s`;
}

function loadJson(url: string) {
  return fetch(url)
    .then(async (res) => {
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, json };
    })
    .catch(() => ({ ok: false, status: 0, json: { error: 'Network error' } as Record<string, unknown> }));
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
}) {
  const content = (
    <>
      <div className="mb-2 flex items-center justify-between">
        <Icon className="h-6 w-6 text-[var(--primary)]" />
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{label}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">{sub}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="glass-card rounded-xl p-4 transition-colors hover:bg-[var(--muted)]/40">
        {content}
      </Link>
    );
  }

  return <div className="glass-card rounded-xl p-4">{content}</div>;
}

export function RoleDashboard() {
  const { userRole, isAccount, accountKey, accountData, accounts, userEmail, userName } = useAccount();

  if (!userRole) {
    return <div className="text-sm text-[var(--muted-foreground)]">Loading dashboard...</div>;
  }

  if (userRole === 'client') {
    return <ClientRoleDashboard accountKey={accountKey} accountData={accountData} userName={userName} />;
  }

  return (
    <ManagementRoleDashboard
      role={userRole as ManagementRole}
      accounts={accounts}
      isAccountMode={isAccount}
      focusedAccountKey={accountKey}
      userEmail={userEmail}
      userName={userName}
    />
  );
}

function ManagementRoleDashboard({
  role,
  accounts,
  isAccountMode,
  focusedAccountKey,
  userEmail,
  userName,
}: {
  role: ManagementRole;
  accounts: Record<string, AccountData>;
  isAccountMode: boolean;
  focusedAccountKey: string | null;
  userEmail: string | null;
  userName: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [contactsAggregateLoading, setContactsAggregateLoading] = useState(true);
  const [campaignsAggregateLoading, setCampaignsAggregateLoading] = useState(true);
  const [workflowsAggregateLoading, setWorkflowsAggregateLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRangeKey>(DEFAULT_DATE_RANGE);
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedRepIds, setSelectedRepIds] = useState<string[]>([]);
  const [superAdminPresetName, setSuperAdminPresetName] = useState('');
  const [superAdminPresets, setSuperAdminPresets] = useState<SuperAdminFilterPreset[]>([]);
  const [superAdminPresetsHydrated, setSuperAdminPresetsHydrated] = useState(false);
  const lastFocusedRef = useRef<string | null>(null);

  const [emails, setEmails] = useState<EmailListItem[]>([]);
  const [contactStats, setContactStats] = useState<Record<string, ContactStatsRow>>({});
  const [contacts, setContacts] = useState<AggregateContact[]>([]);
  const [espCampaigns, setEspCampaigns] = useState<EspCampaign[]>([]);
  const [espWorkflows, setEspWorkflows] = useState<EspWorkflow[]>([]);
  const [loomiEmailCampaigns, setLoomiEmailCampaigns] = useState<LoomiEmailCampaign[]>([]);
  const [loomiSmsCampaigns, setLoomiSmsCampaigns] = useState<LoomiSmsCampaign[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);

  const [campaignPerAccount, setCampaignPerAccount] = useState<Record<string, { dealer: string; count: number; connected: boolean; provider: string }>>({});
  const [workflowPerAccount, setWorkflowPerAccount] = useState<Record<string, { dealer: string; count: number; connected: boolean; provider: string }>>({});

  const [errors, setErrors] = useState<{
    contactsStats?: string;
    contactsAggregate?: string;
    campaignsAggregate?: string;
    workflowsAggregate?: string;
    emails?: string;
    loomiEmail?: string;
    loomiSms?: string;
    users?: string;
  }>({});
  const [usingMockData, setUsingMockData] = useState(false);

  const { theme } = useTheme();
  const isDeveloper = role === 'developer';
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin';
  const chartTextColor = theme === 'dark' ? '#cbd5e1' : '#334155';
  const chartMutedColor = theme === 'dark' ? '#94a3b8' : '#64748b';
  const chartGridColor = theme === 'dark' ? 'rgba(148,163,184,0.18)' : 'rgba(100,116,139,0.24)';
  const chartStrokeColor = theme === 'dark' ? 'rgba(16,15,35,0.95)' : 'rgba(248,250,252,0.96)';
  const chartTooltipTheme: 'dark' | 'light' = theme === 'dark' ? 'dark' : 'light';
  const quickFilterStorageKey = `loomi_dashboard_quick_filters_v1:${(userEmail || 'anonymous').toLowerCase()}`;
  const accountKeysSignature = useMemo(() => Object.keys(accounts).sort().join('|'), [accounts]);

  const [developerMode, setDeveloperMode] = useState<DeveloperMode>('analytics');

  useEffect(() => {
    if (!isDeveloper) return;
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('loomi_dashboard_dev_mode') : null;
    if (stored === 'analytics' || stored === 'technical') {
      setDeveloperMode(stored);
    }
  }, [isDeveloper]);

  useEffect(() => {
    if (!isDeveloper || typeof window === 'undefined') return;
    window.localStorage.setItem('loomi_dashboard_dev_mode', developerMode);
  }, [isDeveloper, developerMode]);

  useEffect(() => {
    if (!isAccountMode || !focusedAccountKey) {
      lastFocusedRef.current = null;
      setSelectedAccounts([]);
      return;
    }
    if (lastFocusedRef.current === focusedAccountKey) return;
    lastFocusedRef.current = focusedAccountKey;
    setSelectedAccounts([focusedAccountKey]);
  }, [isAccountMode, focusedAccountKey]);

  useEffect(() => {
    if (!isSuperAdmin) {
      setSelectedRepIds([]);
      setSuperAdminPresets([]);
      setSuperAdminPresetsHydrated(false);
      return;
    }

    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(quickFilterStorageKey);
      if (!raw) {
        setSuperAdminPresets([]);
        setSuperAdminPresetsHydrated(true);
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setSuperAdminPresets([]);
        setSuperAdminPresetsHydrated(true);
        return;
      }

      const normalized: SuperAdminFilterPreset[] = [];
      for (const row of parsed) {
        if (typeof row !== 'object' || row == null) continue;
        const candidate = row as Record<string, unknown>;
        if (!isDateRangeKey(candidate.dateRange)) continue;
        normalized.push({
          id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name : 'Saved filter',
          accountKeys: Array.isArray(candidate.accountKeys) ? candidate.accountKeys.filter((key): key is string => typeof key === 'string') : [],
          repIds: Array.isArray(candidate.repIds) ? candidate.repIds.filter((id): id is string => typeof id === 'string') : [],
          dateRange: candidate.dateRange,
          customRange:
            candidate.customRange &&
            typeof candidate.customRange === 'object' &&
            typeof (candidate.customRange as Record<string, unknown>).start === 'string' &&
            typeof (candidate.customRange as Record<string, unknown>).end === 'string'
              ? {
                  start: String((candidate.customRange as Record<string, unknown>).start),
                  end: String((candidate.customRange as Record<string, unknown>).end),
                }
              : null,
          createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
        });
      }

      setSuperAdminPresets(normalized);
    } catch {
      setSuperAdminPresets([]);
    } finally {
      setSuperAdminPresetsHydrated(true);
    }
  }, [isSuperAdmin, quickFilterStorageKey]);

  useEffect(() => {
    if (!isSuperAdmin || !superAdminPresetsHydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(quickFilterStorageKey, JSON.stringify(superAdminPresets));
  }, [isSuperAdmin, superAdminPresetsHydrated, quickFilterStorageKey, superAdminPresets]);

  useEffect(() => {
    if (!filtersPanelOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFiltersPanelOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [filtersPanelOpen]);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setContactsAggregateLoading(true);
      setCampaignsAggregateLoading(true);
      setWorkflowsAggregateLoading(true);
      setErrors({});

      if (DASHBOARD_DUMMY_MODE) {
        const mock = buildMockManagementDataset(accounts);
        if (cancelled) return;
        setEmails(mock.emails);
        setContactStats(mock.contactStats);
        setContacts(mock.contacts);
        setEspCampaigns(mock.espCampaigns);
        setEspWorkflows(mock.espWorkflows);
        setLoomiEmailCampaigns(mock.loomiEmailCampaigns);
        setLoomiSmsCampaigns(mock.loomiSmsCampaigns);
        setUsers(mock.users);
        setCampaignPerAccount(mock.campaignPerAccount);
        setWorkflowPerAccount(mock.workflowPerAccount);
        setErrors({});
        setUsingMockData(true);
        setLoading(false);
        setContactsAggregateLoading(false);
        setCampaignsAggregateLoading(false);
        setWorkflowsAggregateLoading(false);
        return;
      }

      const contactsAggregatePromise = loadJson('/api/esp/contacts/aggregate');
      const campaignsAggregatePromise = loadJson('/api/esp/campaigns/aggregate');
      const workflowsAggregatePromise = loadJson('/api/esp/workflows/aggregate');

      const [
        emailRes,
        contactStatsRes,
        loomiEmailRes,
        loomiSmsRes,
        usersRes,
      ] = await Promise.all([
        loadJson('/api/emails'),
        loadJson('/api/esp/contacts/stats'),
        loadJson('/api/campaigns/email?limit=50'),
        loadJson('/api/esp/messages/bulk?limit=50'),
        loadJson('/api/users?summary=1'),
      ]);

      if (cancelled) return;

      const nextErrors: typeof errors = {};
      setUsingMockData(false);

      if (emailRes.ok) {
        setEmails(parseEmailListPayload(emailRes.json));
      } else {
        setEmails([]);
        nextErrors.emails = String((emailRes.json as Record<string, unknown>).error || `Error ${emailRes.status}`);
      }

      if (contactStatsRes.ok) {
        const rawStats = parseJsonSafe<Record<string, Record<string, unknown>>>(
          (contactStatsRes.json as Record<string, unknown>).stats,
          {},
        );
        const normalized: Record<string, ContactStatsRow> = {};
        for (const [accountKey, stat] of Object.entries(rawStats)) {
          const countRaw = stat.contactCount ?? stat.count;
          normalized[accountKey] = {
            dealer: String(stat.dealer || accountKey),
            contactCount: typeof countRaw === 'number' ? countRaw : asNumber(countRaw),
            connected: Boolean(stat.connected),
            cached: Boolean(stat.cached),
            provider: typeof stat.provider === 'string' ? stat.provider : undefined,
            error: typeof stat.error === 'string' ? stat.error : undefined,
          };
        }
        setContactStats(normalized);
      } else {
        setContactStats({});
        nextErrors.contactsStats = String((contactStatsRes.json as Record<string, unknown>).error || `Error ${contactStatsRes.status}`);
      }

      if (loomiEmailRes.ok) {
        const rows = asArray<LoomiEmailCampaign>((loomiEmailRes.json as Record<string, unknown>).campaigns);
        setLoomiEmailCampaigns(rows);
      } else {
        setLoomiEmailCampaigns([]);
        nextErrors.loomiEmail = String((loomiEmailRes.json as Record<string, unknown>).error || `Error ${loomiEmailRes.status}`);
      }

      if (loomiSmsRes.ok) {
        const rows = asArray<LoomiSmsCampaign>((loomiSmsRes.json as Record<string, unknown>).campaigns);
        setLoomiSmsCampaigns(rows);
      } else {
        setLoomiSmsCampaigns([]);
        nextErrors.loomiSms = String((loomiSmsRes.json as Record<string, unknown>).error || `Error ${loomiSmsRes.status}`);
      }

      // users endpoint is role-gated; keep non-fatal for restricted admin experiences
      if (usersRes.ok) {
        setUsers(
          asArray<Record<string, unknown>>(usersRes.json).map((row) => ({
            id: String(row.id || ''),
            role: String(row.role || 'unknown'),
          })),
        );
      } else {
        setUsers([]);
        nextErrors.users = String((usersRes.json as Record<string, unknown>).error || `Error ${usersRes.status}`);
      }

      setErrors(nextErrors);
      setLoading(false);

      const [
        contactsAggregateRes,
        campaignsAggregateRes,
        workflowsAggregateRes,
      ] = await Promise.all([
        contactsAggregatePromise,
        campaignsAggregatePromise,
        workflowsAggregatePromise,
      ]);

      if (cancelled) return;

      const shouldFallbackToMock =
        process.env.NODE_ENV === 'development'
        && !DASHBOARD_DUMMY_MODE
        && !contactsAggregateRes.ok
        && !campaignsAggregateRes.ok
        && !workflowsAggregateRes.ok;

      if (shouldFallbackToMock) {
        const mock = buildMockManagementDataset(accounts);
        setEmails(mock.emails);
        setContactStats(mock.contactStats);
        setContacts(mock.contacts);
        setEspCampaigns(mock.espCampaigns);
        setEspWorkflows(mock.espWorkflows);
        setLoomiEmailCampaigns(mock.loomiEmailCampaigns);
        setLoomiSmsCampaigns(mock.loomiSmsCampaigns);
        setUsers(mock.users);
        setCampaignPerAccount(mock.campaignPerAccount);
        setWorkflowPerAccount(mock.workflowPerAccount);
        setErrors({});
        setUsingMockData(true);
        setContactsAggregateLoading(false);
        setCampaignsAggregateLoading(false);
        setWorkflowsAggregateLoading(false);
        return;
      }

      const fullErrors: typeof errors = { ...nextErrors };

      if (contactsAggregateRes.ok) {
        const rows = asArray<AggregateContact>((contactsAggregateRes.json as Record<string, unknown>).contacts);
        setContacts(rows);
      } else {
        setContacts([]);
        fullErrors.contactsAggregate = String((contactsAggregateRes.json as Record<string, unknown>).error || `Error ${contactsAggregateRes.status}`);
      }
      setContactsAggregateLoading(false);

      if (campaignsAggregateRes.ok) {
        setEspCampaigns(asArray<EspCampaign>((campaignsAggregateRes.json as Record<string, unknown>).campaigns));
        setCampaignPerAccount(
          parseJsonSafe<Record<string, { dealer: string; count: number; connected: boolean; provider: string }>>(
            (campaignsAggregateRes.json as Record<string, unknown>).perAccount,
            {},
          ),
        );
      } else {
        setEspCampaigns([]);
        setCampaignPerAccount({});
        fullErrors.campaignsAggregate = String((campaignsAggregateRes.json as Record<string, unknown>).error || `Error ${campaignsAggregateRes.status}`);
      }
      setCampaignsAggregateLoading(false);

      if (workflowsAggregateRes.ok) {
        setEspWorkflows(asArray<EspWorkflow>((workflowsAggregateRes.json as Record<string, unknown>).workflows));
        setWorkflowPerAccount(
          parseJsonSafe<Record<string, { dealer: string; count: number; connected: boolean; provider: string }>>(
            (workflowsAggregateRes.json as Record<string, unknown>).perAccount,
            {},
          ),
        );
      } else {
        setEspWorkflows([]);
        setWorkflowPerAccount({});
        fullErrors.workflowsAggregate = String((workflowsAggregateRes.json as Record<string, unknown>).error || `Error ${workflowsAggregateRes.status}`);
      }
      setWorkflowsAggregateLoading(false);

      setErrors(fullErrors);
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [accountKeysSignature, accounts]);

  const accountOptions = useMemo(() => {
    if (Object.keys(accounts).length > 0) return normalizeAccountOptions(accounts);
    return Object.entries(contactStats)
      .map(([key, stat]) => ({ key, label: stat.dealer || key }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [accounts, contactStats]);
  const accountNames = useMemo(
    () =>
      Object.fromEntries(
        accountOptions.map((account) => [account.key, account.label]),
      ) as Record<string, string>,
    [accountOptions],
  );

  const bounds = useMemo(
    () =>
      dateRange === 'custom' && customRange
        ? getDateRangeBounds('custom', customRange.start, customRange.end)
        : getDateRangeBounds(dateRange),
    [dateRange, customRange],
  );

  const repScopeOptions = useMemo<RepScopeOption[]>(() => {
    if (!isSuperAdmin) return [];
    const map = new Map<string, RepScopeOption>();
    let unassignedCount = 0;

    for (const account of Object.values(accounts)) {
      const repId = account.accountRep?.id || account.accountRepId;
      if (!repId) {
        unassignedCount += 1;
        continue;
      }

      const label = account.accountRep?.name?.trim() || account.accountRep?.email || `Rep ${repId.slice(0, 6)}`;
      const existing = map.get(repId);
      if (existing) {
        existing.accountCount += 1;
      } else {
        map.set(repId, { id: repId, label, accountCount: 1 });
      }
    }

    const options = [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
    if (unassignedCount > 0) {
      options.push({ id: UNASSIGNED_REP_ID, label: 'Unassigned', accountCount: unassignedCount });
    }
    return options;
  }, [accounts, isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const validRepIds = new Set(repScopeOptions.map((rep) => rep.id));
    setSelectedRepIds((prev) => prev.filter((repId) => validRepIds.has(repId)));
  }, [isSuperAdmin, repScopeOptions]);

  const accountScopeKeys = useMemo(() => {
    const availableAccountKeys = Object.keys(accounts).length > 0
      ? Object.keys(accounts)
      : Object.keys(contactStats);

    let keys =
      selectedAccounts.length > 0
        ? selectedAccounts.filter((key) => availableAccountKeys.includes(key))
        : availableAccountKeys;

    if (isSuperAdmin && selectedRepIds.length > 0) {
      keys = keys.filter((key) => selectedRepIds.includes(accountRepScopeId(accounts[key])));
    }

    return keys;
  }, [accounts, contactStats, isSuperAdmin, selectedAccounts, selectedRepIds]);

  const accountScopeSet = useMemo(() => new Set(accountScopeKeys), [accountScopeKeys]);

  const filteredEmailsByAccount = useMemo(
    () => emails.filter((email) => accountScopeSet.has(email.accountKey)),
    [emails, accountScopeSet],
  );

  const filteredEmails = useMemo(
    () => filterByDateRange(filteredEmailsByAccount, 'createdAt', bounds),
    [filteredEmailsByAccount, bounds],
  );

  const filteredContactsByAccount = useMemo(
    () => contacts.filter((contact) => accountScopeSet.has(contact._accountKey || '')),
    [contacts, accountScopeSet],
  );

  const filteredContacts = useMemo(
    () => filterByDateRange(filteredContactsByAccount, 'dateAdded', bounds),
    [filteredContactsByAccount, bounds],
  );

  const filteredEspCampaignsByAccount = useMemo(
    () =>
      espCampaigns.filter((campaign) => Boolean(campaign.accountKey && accountScopeSet.has(campaign.accountKey))),
    [espCampaigns, accountScopeSet],
  );

  const filteredEspCampaigns = useMemo(
    () =>
      filteredEspCampaignsByAccount.filter((campaign) => {
        const dateValue = firstCampaignDate(campaign);
        return inBounds(dateValue, bounds);
      }),
    [filteredEspCampaignsByAccount, bounds],
  );

  const filteredEspWorkflowsByAccount = useMemo(
    () =>
      espWorkflows.filter((workflow) => Boolean(workflow.accountKey && accountScopeSet.has(workflow.accountKey))),
    [espWorkflows, accountScopeSet],
  );

  const filteredEspWorkflows = useMemo(
    () =>
      filteredEspWorkflowsByAccount.filter((workflow) =>
        inBounds(workflow.updatedAt || workflow.createdAt, bounds),
      ),
    [filteredEspWorkflowsByAccount, bounds],
  );

  const filteredLoomiEmailCampaigns = useMemo(
    () =>
      loomiEmailCampaigns
        .filter((campaign) => intersectsAccountSet(campaign.accountKeys, accountScopeSet))
        .filter((campaign) => inBounds(campaign.updatedAt || campaign.createdAt, bounds)),
    [loomiEmailCampaigns, accountScopeSet, bounds],
  );

  const filteredLoomiSmsCampaigns = useMemo(
    () =>
      loomiSmsCampaigns
        .filter((campaign) => intersectsAccountSet(campaign.accountKeys, accountScopeSet))
        .filter((campaign) => inBounds(campaign.updatedAt || campaign.createdAt, bounds)),
    [loomiSmsCampaigns, accountScopeSet, bounds],
  );

  const selectedAccountMap = useMemo(() => {
    if (accountScopeKeys.length === Object.keys(accounts).length) return accounts;
    const next: Record<string, AccountData> = {};
    for (const key of accountScopeKeys) {
      if (accounts[key]) next[key] = accounts[key];
    }
    return next;
  }, [accounts, accountScopeKeys]);

  const emailRollupByAccount = useMemo(() => {
    const map: Record<string, { total: number; active: number; draft: number }> = {};
    for (const email of filteredEmailsByAccount) {
      if (!map[email.accountKey]) {
        map[email.accountKey] = { total: 0, active: 0, draft: 0 };
      }
      map[email.accountKey].total += 1;
      if (email.status === 'active') map[email.accountKey].active += 1;
      if (email.status === 'draft') map[email.accountKey].draft += 1;
    }
    return map;
  }, [filteredEmailsByAccount]);

  const espCampaignCountByAccount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const campaign of espCampaigns) {
      if (!campaign.accountKey) continue;
      map[campaign.accountKey] = (map[campaign.accountKey] || 0) + 1;
    }
    return map;
  }, [espCampaigns]);

  const espWorkflowCountByAccount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const workflow of espWorkflows) {
      if (!workflow.accountKey) continue;
      map[workflow.accountKey] = (map[workflow.accountKey] || 0) + 1;
    }
    return map;
  }, [espWorkflows]);

  const loomiCampaignCountByAccount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const campaign of loomiEmailCampaigns) {
      for (const accountKey of campaign.accountKeys) {
        map[accountKey] = (map[accountKey] || 0) + 1;
      }
    }
    for (const campaign of loomiSmsCampaigns) {
      for (const accountKey of campaign.accountKeys) {
        map[accountKey] = (map[accountKey] || 0) + 1;
      }
    }
    return map;
  }, [loomiEmailCampaigns, loomiSmsCampaigns]);

  const accountRollups = useMemo(() => {
    const rollups: Record<string, AccountRollup> = {};
    const rollupKeys = Object.keys(accounts).length > 0 ? Object.keys(accounts) : Object.keys(contactStats);
    for (const accountKey of rollupKeys) {
      const contactCount = contactStats[accountKey]?.contactCount ?? 0;
      const emailCount = emailRollupByAccount[accountKey]?.total ?? 0;
      const campaignCount = espCampaignCountByAccount[accountKey] || 0;
      const workflowCount = espWorkflowCountByAccount[accountKey] || 0;
      const loomiCampaignCount = loomiCampaignCountByAccount[accountKey] || 0;
      const isConnected = Boolean(contactStats[accountKey]?.connected);
      const hasError = Boolean(contactStats[accountKey]?.error)
        || (campaignPerAccount[accountKey]?.connected === false)
        || (workflowPerAccount[accountKey]?.connected === false);

      rollups[accountKey] = {
        contactCount,
        emailCount,
        campaignCount,
        workflowCount,
        loomiCampaignCount,
        isConnected,
        hasError,
      };
    }
    return rollups;
  }, [
    accounts,
    contactStats,
    emailRollupByAccount,
    espCampaignCountByAccount,
    espWorkflowCountByAccount,
    loomiCampaignCountByAccount,
    campaignPerAccount,
    workflowPerAccount,
  ]);

  const apiHealth = useMemo<ApiHealthSnapshot[]>(() => {
    return [
      {
        label: 'Contact Stats',
        ok: !errors.contactsStats,
        detail: errors.contactsStats ? errors.contactsStats : `${Object.keys(contactStats).length} account rows`,
      },
      {
        label: 'Contact Aggregate',
        ok: contactsAggregateLoading ? true : !errors.contactsAggregate,
        detail: contactsAggregateLoading
          ? 'Loading aggregate contacts...'
          : errors.contactsAggregate
            ? errors.contactsAggregate
            : `${contacts.length.toLocaleString()} contacts`,
      },
      {
        label: 'ESP Campaigns',
        ok: campaignsAggregateLoading ? true : !errors.campaignsAggregate,
        detail: campaignsAggregateLoading
          ? 'Loading aggregate campaigns...'
          : errors.campaignsAggregate
            ? errors.campaignsAggregate
            : `${espCampaigns.length.toLocaleString()} campaigns`,
        href: '/campaigns',
      },
      {
        label: 'ESP Workflows',
        ok: workflowsAggregateLoading ? true : !errors.workflowsAggregate,
        detail: workflowsAggregateLoading
          ? 'Loading aggregate workflows...'
          : errors.workflowsAggregate
            ? errors.workflowsAggregate
            : `${espWorkflows.length.toLocaleString()} flows`,
        href: '/flows',
      },
      {
        label: 'Loomi Email Campaigns',
        ok: !errors.loomiEmail,
        detail: errors.loomiEmail ? errors.loomiEmail : `${loomiEmailCampaigns.length.toLocaleString()} campaigns`,
        href: '/campaigns',
      },
      {
        label: 'Loomi SMS Campaigns',
        ok: !errors.loomiSms,
        detail: errors.loomiSms ? errors.loomiSms : `${loomiSmsCampaigns.length.toLocaleString()} campaigns`,
        href: '/campaigns',
      },
    ];
  }, [
    errors,
    contactStats,
    contacts.length,
    espCampaigns.length,
    espWorkflows.length,
    loomiEmailCampaigns.length,
    loomiSmsCampaigns.length,
    contactsAggregateLoading,
    campaignsAggregateLoading,
    workflowsAggregateLoading,
  ]);

  const roleCounts = useMemo(() => buildRoleCount(users), [users]);
  const scopedAccountKeys = accountScopeKeys;

  const totals = useMemo(() => {
    const connectedAccounts = scopedAccountKeys.filter((key) => contactStats[key]?.connected).length;
    const contactsTotal = scopedAccountKeys.reduce(
      (sum, key) => sum + (contactStats[key]?.contactCount || 0),
      0,
    );
    const activeEmails = filteredEmailsByAccount.filter((email) => normalizeStatus(email.status) === 'active').length;

    const engagement = sumCampaignEngagement(filteredEspCampaigns);

    return {
      accountCount: scopedAccountKeys.length,
      connectedAccounts,
      contactsTotal,
      activeEmails,
      emailCount: filteredEmailsByAccount.length,
      campaignCount: filteredEspCampaigns.length,
      workflowCount: filteredEspWorkflows.length,
      loomiCampaignCount: filteredLoomiEmailCampaigns.length + filteredLoomiSmsCampaigns.length,
      engagement,
    };
  }, [
    scopedAccountKeys,
    contactStats,
    filteredEmailsByAccount,
    filteredEspCampaigns,
    filteredEspWorkflows,
    filteredLoomiEmailCampaigns.length,
    filteredLoomiSmsCampaigns.length,
  ]);

  const industryPortfolioRows = useMemo(
    () => {
      type IndustryRow = {
        industry: string;
        accountCount: number;
        connectedAccounts: number;
        contactsTotal: number;
        campaignCount: number;
        workflowCount: number;
      };

      const rows = new Map<string, IndustryRow>();
      for (const key of scopedAccountKeys) {
        const account = accounts[key];
        const industry = account?.category?.trim() || 'Uncategorized';
        const rollup = accountRollups[key] || {
          contactCount: 0,
          campaignCount: 0,
          workflowCount: 0,
          isConnected: false,
        };

        const existing = rows.get(industry);
        if (existing) {
          existing.accountCount += 1;
          existing.connectedAccounts += rollup.isConnected ? 1 : 0;
          existing.contactsTotal += rollup.contactCount;
          existing.campaignCount += rollup.campaignCount;
          existing.workflowCount += rollup.workflowCount;
        } else {
          rows.set(industry, {
            industry,
            accountCount: 1,
            connectedAccounts: rollup.isConnected ? 1 : 0,
            contactsTotal: rollup.contactCount,
            campaignCount: rollup.campaignCount,
            workflowCount: rollup.workflowCount,
          });
        }
      }

      return [...rows.values()].sort((a, b) => b.accountCount - a.accountCount || b.contactsTotal - a.contactsTotal);
    },
    [scopedAccountKeys, accounts, accountRollups],
  );

  const connectedRatePct = totals.accountCount > 0
    ? Math.round((totals.connectedAccounts / totals.accountCount) * 100)
    : 0;
  const activeEmailRatePct = totals.emailCount > 0
    ? Math.round((totals.activeEmails / totals.emailCount) * 100)
    : 0;
  const openRatePct = Math.max(0, Math.min(100, Math.round((totals.engagement.openRate || 0) * 100)));
  const clickRatePct = Math.max(0, Math.min(100, Math.round((totals.engagement.clickRate || 0) * 100)));

  const campaignMixRows = useMemo(
    () => [
      { label: 'Campaigns', value: totals.campaignCount },
      { label: 'Flows', value: totals.workflowCount },
      { label: 'Loomi Messages', value: totals.loomiCampaignCount },
    ],
    [totals.campaignCount, totals.workflowCount, totals.loomiCampaignCount],
  );

  const topIndustryRows = useMemo(
    () => industryPortfolioRows.slice(0, 6),
    [industryPortfolioRows],
  );

  const accountLeaderboard = useMemo(() => {
    const rows = Object.entries(accountRollups)
      .filter(([key]) => accountScopeSet.has(key))
      .map(([key, rollup]) => ({
        key,
        dealer: accounts[key]?.dealer || key,
        rollup,
        score:
          rollup.contactCount +
          rollup.emailCount * 12 +
          rollup.campaignCount * 15 +
          rollup.workflowCount * 12 +
          rollup.loomiCampaignCount * 8,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    return rows;
  }, [accountRollups, accountScopeSet, accounts]);

  const attentionAccounts = useMemo(() => {
    return Object.entries(accountRollups)
      .filter(([key, rollup]) => {
        if (!accountScopeSet.has(key)) return false;
        return !rollup.isConnected || rollup.hasError;
      })
      .map(([key, rollup]) => ({
        key,
        dealer: accounts[key]?.dealer || key,
        reason: !rollup.isConnected ? 'No active contact integration' : 'Partial integration/reporting errors',
      }))
      .slice(0, 8);
  }, [accountRollups, accountScopeSet, accounts]);

  const recentLoomiCampaigns = useMemo(() => {
    type Activity = {
      id: string;
      source: 'email' | 'sms';
      name: string;
      status: string;
      recipients: number;
      sentCount: number;
      failedCount: number;
      updatedAt: string;
      accountCount: number;
    };

    const emailRows: Activity[] = filteredLoomiEmailCampaigns.map((campaign) => ({
      id: `email-${campaign.id}`,
      source: 'email',
      name: campaign.name || campaign.subject || 'Email Campaign',
      status: campaign.status,
      recipients: asNumber(campaign.totalRecipients),
      sentCount: asNumber(campaign.sentCount),
      failedCount: asNumber(campaign.failedCount),
      updatedAt: campaign.updatedAt || campaign.createdAt,
      accountCount: asArray<string>(campaign.accountKeys).length,
    }));

    const smsRows: Activity[] = filteredLoomiSmsCampaigns.map((campaign) => ({
      id: `sms-${campaign.id}`,
      source: 'sms',
      name: campaign.name || 'SMS Campaign',
      status: campaign.status,
      recipients: asNumber(campaign.totalRecipients),
      sentCount: asNumber(campaign.sentCount),
      failedCount: asNumber(campaign.failedCount),
      updatedAt: campaign.updatedAt || campaign.createdAt,
      accountCount: asArray<string>(campaign.accountKeys).length,
    }));

    return [...emailRows, ...smsRows]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10);
  }, [filteredLoomiEmailCampaigns, filteredLoomiSmsCampaigns]);

  const roleCountMax = useMemo(
    () => Math.max(1, ...roleCounts.map((entry) => entry.count)),
    [roleCounts],
  );

  const developerApiRows = useMemo(
    () =>
      apiHealth.map((api) => ({
        ...api,
        score: api.ok ? 100 : 22,
      })),
    [apiHealth],
  );

  const developerAttentionRows = useMemo(
    () =>
      attentionAccounts
        .map((item) => {
          const rollup = accountRollups[item.key];
          const severity = Math.min(
            100,
            (rollup && !rollup.isConnected ? 65 : 15) + (rollup?.hasError ? 35 : 0),
          );
          return {
            ...item,
            severity,
          };
        })
        .sort((a, b) => b.severity - a.severity)
        .slice(0, 8),
    [attentionAccounts, accountRollups],
  );

  const developerLoomiChannelRows = useMemo(() => {
    const emailSent = filteredLoomiEmailCampaigns.reduce((sum, campaign) => sum + asNumber(campaign.sentCount), 0);
    const smsSent = filteredLoomiSmsCampaigns.reduce((sum, campaign) => sum + asNumber(campaign.sentCount), 0);
    const emailFailed = filteredLoomiEmailCampaigns.reduce((sum, campaign) => sum + asNumber(campaign.failedCount), 0);
    const smsFailed = filteredLoomiSmsCampaigns.reduce((sum, campaign) => sum + asNumber(campaign.failedCount), 0);

    return [
      { label: 'Email Sent', value: emailSent, gradient: 'from-blue-500 to-cyan-400' },
      { label: 'SMS Sent', value: smsSent, gradient: 'from-emerald-500 to-teal-400' },
      { label: 'Email Failed', value: emailFailed, gradient: 'from-rose-500 to-orange-400' },
      { label: 'SMS Failed', value: smsFailed, gradient: 'from-amber-500 to-yellow-400' },
    ];
  }, [filteredLoomiEmailCampaigns, filteredLoomiSmsCampaigns]);

  const developerPalette = ['#60a5fa', '#8b5cf6', '#34d399', '#f59e0b', '#f472b6', '#22d3ee', '#f97316'];
  const developerRoleLabels = useMemo(
    () => (roleCounts.length > 0 ? roleCounts.map((entry) => roleDisplayName(entry.role)) : ['No data']),
    [roleCounts],
  );
  const developerRoleSeries = useMemo(
    () => (roleCounts.length > 0 ? roleCounts.map((entry) => entry.count) : [1]),
    [roleCounts],
  );

  const developerApiCategories = useMemo(
    () => developerApiRows.map((api) => api.label.replace(' Campaigns', '').replace(' Workflows', '')),
    [developerApiRows],
  );
  const developerApiSeries = useMemo(
    () => [{ name: 'Health', data: developerApiRows.map((api) => api.score) }],
    [developerApiRows],
  );
  const developerApiColors = useMemo(
    () => developerApiRows.map((api) => (api.ok ? '#22d3ee' : '#fb7185')),
    [developerApiRows],
  );

  const developerRiskCategories = useMemo(
    () => (developerAttentionRows.length > 0 ? developerAttentionRows.map((row) => row.dealer) : ['No Alerts']),
    [developerAttentionRows],
  );
  const developerRiskSeries = useMemo(
    () => [{ name: 'Risk', data: developerAttentionRows.length > 0 ? developerAttentionRows.map((row) => row.severity) : [0] }],
    [developerAttentionRows],
  );

  const developerMomentumCategories = useMemo(
    () => (accountLeaderboard.length > 0 ? accountLeaderboard.map((row) => row.dealer) : ['No Accounts']),
    [accountLeaderboard],
  );
  const developerMomentumSeries = useMemo(
    () => [{ name: 'Momentum', data: accountLeaderboard.length > 0 ? accountLeaderboard.map((row) => row.score) : [0] }],
    [accountLeaderboard],
  );

  const developerIndustryCategories = useMemo(
    () => (topIndustryRows.length > 0 ? topIndustryRows.map((row) => row.industry) : ['Uncategorized']),
    [topIndustryRows],
  );
  const developerIndustrySeries = useMemo(
    () => [{ name: 'Contacts', data: topIndustryRows.length > 0 ? topIndustryRows.map((row) => row.contactsTotal) : [0] }],
    [topIndustryRows],
  );

  const developerMixLabels = useMemo(
    () => campaignMixRows.map((row) => row.label),
    [campaignMixRows],
  );
  const developerMixSeries = useMemo(
    () => campaignMixRows.map((row) => row.value),
    [campaignMixRows],
  );

  const developerDeliverySeries = useMemo(() => {
    const emailSent = developerLoomiChannelRows.find((row) => row.label === 'Email Sent')?.value || 0;
    const smsSent = developerLoomiChannelRows.find((row) => row.label === 'SMS Sent')?.value || 0;
    const emailFailed = developerLoomiChannelRows.find((row) => row.label === 'Email Failed')?.value || 0;
    const smsFailed = developerLoomiChannelRows.find((row) => row.label === 'SMS Failed')?.value || 0;
    return [
      { name: 'Sent', data: [emailSent, smsSent] },
      { name: 'Failed', data: [emailFailed, smsFailed] },
    ];
  }, [developerLoomiChannelRows]);

  const developerTimeline = useMemo(() => {
    const months = getMonthBuckets(Math.min(8, Math.max(4, bounds.monthCount)));
    const categories = months.map((bucket) => bucket.label);
    const campaigns = months.map((bucket) => {
      const campaignCount = filteredEspCampaigns.filter((campaign) => {
        const dateValue = firstCampaignDate(campaign) || campaign.updatedAt || campaign.createdAt;
        if (!dateValue) return false;
        const date = new Date(dateValue);
        return date >= bucket.start && date < bucket.end;
      }).length;
      return campaignCount;
    });
    const workflows = months.map((bucket) => {
      const workflowCount = filteredEspWorkflows.filter((workflow) => {
        const dateValue = workflow.updatedAt || workflow.createdAt;
        if (!dateValue) return false;
        const date = new Date(dateValue);
        return date >= bucket.start && date < bucket.end;
      }).length;
      return workflowCount;
    });
    const contactsByMonth = months.map((bucket) => {
      const contactCount = filteredContacts.filter((contact) => {
        if (!contact.dateAdded) return false;
        const date = new Date(contact.dateAdded);
        return date >= bucket.start && date < bucket.end;
      }).length;
      return contactCount;
    });
    return {
      categories,
      series: [
        { name: 'Campaigns', data: campaigns },
        { name: 'Flows', data: workflows },
        { name: 'Contacts', data: contactsByMonth },
      ],
    };
  }, [bounds.monthCount, filteredContacts, filteredEspCampaigns, filteredEspWorkflows]);

  const developerGaugeSeries = [connectedRatePct, activeEmailRatePct, openRatePct, clickRatePct];

  const developerDonutOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: 'donut', background: 'transparent', toolbar: { show: false }, foreColor: chartTextColor },
      labels: developerRoleLabels,
      colors: developerPalette,
      dataLabels: { enabled: false },
      stroke: { width: 2, colors: [chartStrokeColor] },
      legend: { show: true, position: 'bottom', labels: { colors: chartTextColor }, fontSize: '11px' },
      plotOptions: {
        pie: {
          donut: {
            size: '70%',
            labels: {
              show: true,
              total: {
                show: true,
                label: 'Users',
                color: chartTextColor,
                formatter: () => `${users.length}`,
              },
            },
          },
        },
      },
      tooltip: { theme: chartTooltipTheme },
      noData: { text: 'No data', style: { color: chartMutedColor } },
    }),
    [chartMutedColor, chartStrokeColor, chartTextColor, chartTooltipTheme, developerPalette, developerRoleLabels, users.length],
  );

  const developerBarGrid = {
    borderColor: chartGridColor,
    strokeDashArray: 4,
  };

  const developerApiOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: 'bar', background: 'transparent', toolbar: { show: false }, foreColor: chartTextColor },
      colors: developerApiColors,
      plotOptions: { bar: { horizontal: true, distributed: true, borderRadius: 5, barHeight: '56%' } },
      dataLabels: { enabled: false },
      legend: { show: false },
      xaxis: {
        categories: developerApiCategories,
        min: 0,
        max: 100,
        labels: { style: { colors: chartMutedColor } },
      },
      yaxis: { labels: { style: { colors: chartTextColor } } },
      grid: developerBarGrid,
      tooltip: { theme: chartTooltipTheme, y: { formatter: (value) => `${Math.round(value)}%` } },
      noData: { text: 'No API data', style: { color: chartMutedColor } },
    }),
    [chartMutedColor, chartTextColor, chartTooltipTheme, developerApiCategories, developerApiColors, developerBarGrid],
  );

  const developerRiskOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: 'bar', background: 'transparent', toolbar: { show: false }, foreColor: chartTextColor },
      colors: ['#f97316'],
      plotOptions: { bar: { horizontal: false, borderRadius: 6, columnWidth: '56%' } },
      dataLabels: { enabled: false },
      legend: { show: false },
      xaxis: { categories: developerRiskCategories, labels: { style: { colors: chartMutedColor }, rotate: -24 } },
      yaxis: { min: 0, max: 100, labels: { style: { colors: chartMutedColor } } },
      grid: developerBarGrid,
      tooltip: { theme: chartTooltipTheme, y: { formatter: (value) => `${Math.round(value)} risk` } },
      noData: { text: 'No risk data', style: { color: chartMutedColor } },
    }),
    [chartMutedColor, chartTextColor, chartTooltipTheme, developerBarGrid, developerRiskCategories],
  );

  const developerDeliveryOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: 'bar', background: 'transparent', toolbar: { show: false }, stacked: true, foreColor: chartTextColor },
      colors: ['#22d3ee', '#fb7185'],
      plotOptions: { bar: { horizontal: false, borderRadius: 6, columnWidth: '48%' } },
      dataLabels: { enabled: false },
      stroke: { show: true, width: 1, colors: ['transparent'] },
      xaxis: { categories: ['Email', 'SMS'], labels: { style: { colors: chartMutedColor } } },
      yaxis: { labels: { style: { colors: chartMutedColor } } },
      legend: { position: 'top', horizontalAlign: 'left', labels: { colors: chartTextColor }, fontSize: '11px' },
      grid: developerBarGrid,
      tooltip: { theme: chartTooltipTheme },
      noData: { text: 'No delivery data', style: { color: chartMutedColor } },
    }),
    [chartMutedColor, chartTextColor, chartTooltipTheme, developerBarGrid],
  );

  const developerTimelineOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: 'area', background: 'transparent', toolbar: { show: false }, foreColor: chartTextColor },
      colors: ['#60a5fa', '#8b5cf6', '#34d399'],
      stroke: { curve: 'smooth', width: 3 },
      fill: {
        type: 'gradient',
        gradient: { shade: 'dark', type: 'vertical', opacityFrom: 0.34, opacityTo: 0.04, stops: [0, 85, 100] },
      },
      markers: { size: 3, strokeWidth: 0, hover: { sizeOffset: 2 } },
      dataLabels: { enabled: false },
      legend: { position: 'top', horizontalAlign: 'left', labels: { colors: chartTextColor }, fontSize: '11px' },
      xaxis: { categories: developerTimeline.categories, labels: { style: { colors: chartMutedColor } } },
      yaxis: { labels: { style: { colors: chartMutedColor } } },
      grid: developerBarGrid,
      tooltip: { theme: chartTooltipTheme, shared: true },
      noData: { text: 'No timeline data', style: { color: chartMutedColor } },
    }),
    [chartMutedColor, chartTextColor, chartTooltipTheme, developerBarGrid, developerTimeline.categories],
  );

  const developerMomentumOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: 'bar', background: 'transparent', toolbar: { show: false }, foreColor: chartTextColor },
      colors: ['#8b5cf6'],
      plotOptions: { bar: { horizontal: true, borderRadius: 6, barHeight: '58%' } },
      dataLabels: { enabled: false },
      legend: { show: false },
      xaxis: { categories: developerMomentumCategories, labels: { style: { colors: chartMutedColor } } },
      yaxis: { labels: { style: { colors: chartTextColor } } },
      grid: developerBarGrid,
      tooltip: { theme: chartTooltipTheme },
      noData: { text: 'No account momentum', style: { color: chartMutedColor } },
    }),
    [chartMutedColor, chartTextColor, chartTooltipTheme, developerBarGrid, developerMomentumCategories],
  );

  const developerIndustryOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: 'bar', background: 'transparent', toolbar: { show: false }, foreColor: chartTextColor },
      colors: ['#22d3ee'],
      plotOptions: { bar: { horizontal: false, borderRadius: 6, columnWidth: '52%' } },
      dataLabels: { enabled: false },
      legend: { show: false },
      xaxis: { categories: developerIndustryCategories, labels: { style: { colors: chartMutedColor }, rotate: -20 } },
      yaxis: { labels: { style: { colors: chartMutedColor } } },
      grid: developerBarGrid,
      tooltip: { theme: chartTooltipTheme },
      noData: { text: 'No industry data', style: { color: chartMutedColor } },
    }),
    [chartMutedColor, chartTextColor, chartTooltipTheme, developerBarGrid, developerIndustryCategories],
  );

  const developerMixOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: 'donut', background: 'transparent', toolbar: { show: false }, foreColor: chartTextColor },
      labels: developerMixLabels,
      colors: ['#60a5fa', '#8b5cf6', '#34d399'],
      dataLabels: { enabled: false },
      legend: { show: true, position: 'bottom', labels: { colors: chartTextColor }, fontSize: '11px' },
      stroke: { width: 2, colors: [chartStrokeColor] },
      plotOptions: { pie: { donut: { size: '70%' } } },
      tooltip: { theme: chartTooltipTheme },
      noData: { text: 'No mix data', style: { color: chartMutedColor } },
    }),
    [chartMutedColor, chartStrokeColor, chartTextColor, chartTooltipTheme, developerMixLabels],
  );

  const developerGaugeOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: 'radialBar', background: 'transparent', toolbar: { show: false }, foreColor: chartTextColor },
      labels: ['Connected', 'Active Email', 'Open Rate', 'Click Rate'],
      colors: ['#22d3ee', '#60a5fa', '#a78bfa', '#f472b6'],
      plotOptions: {
        radialBar: {
          hollow: { size: '28%' },
          track: { background: chartGridColor },
          dataLabels: {
            name: { fontSize: '10px', color: chartMutedColor },
            value: { fontSize: '12px', color: chartTextColor },
            total: {
              show: true,
              label: 'Health',
              color: chartTextColor,
              formatter: () => `${Math.round((connectedRatePct + activeEmailRatePct + openRatePct + clickRatePct) / 4)}%`,
            },
          },
        },
      },
      legend: { show: true, position: 'bottom', labels: { colors: chartTextColor }, fontSize: '11px' },
      tooltip: { theme: chartTooltipTheme },
      noData: { text: 'No health data', style: { color: chartMutedColor } },
    }),
    [activeEmailRatePct, chartGridColor, chartMutedColor, chartTextColor, chartTooltipTheme, clickRatePct, connectedRatePct, openRatePct],
  );

  const welcomeName = userName?.trim() || 'there';
  const focusedAccountData = focusedAccountKey ? accounts[focusedAccountKey] : null;
  const focusedAccountName = focusedAccountKey ? (accountNames[focusedAccountKey] || focusedAccountKey) : '';
  const dashboardTitle = isAccountMode && focusedAccountName
    ? `${toPossessiveLabel(focusedAccountName)} Dashboard`
    : 'Dashboard';
  const developerShellClass = theme === 'dark'
    ? 'rounded-[28px] border border-violet-400/20 bg-[linear-gradient(145deg,rgba(15,16,34,0.94),rgba(27,16,41,0.9))] p-5 shadow-[0_28px_70px_rgba(7,8,20,0.55),inset_0_1px_0_rgba(255,255,255,0.05)]'
    : 'rounded-[28px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.46),rgba(238,244,255,0.42))] backdrop-blur-2xl p-5 shadow-[0_18px_42px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.78)]';
  const developerPanelClass = theme === 'dark'
    ? 'rounded-2xl border border-white/10 bg-[linear-gradient(155deg,rgba(24,24,43,0.86),rgba(31,18,42,0.82))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
    : 'rounded-2xl border border-white/70 bg-[linear-gradient(155deg,rgba(255,255,255,0.44),rgba(237,243,255,0.38))] backdrop-blur-xl p-4 shadow-[0_8px_20px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.8)]';
  const developerMetricClass = theme === 'dark'
    ? 'rounded-2xl border border-violet-300/20 bg-[linear-gradient(155deg,rgba(58,29,79,0.58),rgba(33,28,61,0.58))] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
    : 'rounded-2xl border border-indigo-100/70 bg-[linear-gradient(155deg,rgba(239,245,255,0.54),rgba(250,252,255,0.44))] backdrop-blur-xl px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.82)]';
  const developerHeadingClass = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const developerSubtleClass = theme === 'dark' ? 'text-violet-100/70' : 'text-slate-500';
  const developerMetricLabelClass = theme === 'dark' ? 'text-violet-200/70' : 'text-slate-500';
  const developerMetricValueClass = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const developerMetricNoteClass = theme === 'dark' ? 'text-violet-100/80' : 'text-slate-600';
  const developerIconTintClass = theme === 'dark' ? 'text-violet-200' : 'text-indigo-600';
  const developerMetricIconClasses = theme === 'dark'
    ? ['text-cyan-300', 'text-violet-300', 'text-emerald-300', 'text-amber-300', 'text-fuchsia-300']
    : ['text-sky-600', 'text-violet-600', 'text-emerald-600', 'text-amber-600', 'text-fuchsia-600'];
  const developerControlIconClasses = theme === 'dark'
    ? ['text-sky-300', 'text-violet-300', 'text-emerald-300', 'text-fuchsia-300', 'text-amber-300', 'text-cyan-300']
    : ['text-sky-600', 'text-violet-600', 'text-emerald-600', 'text-fuchsia-600', 'text-amber-600', 'text-cyan-600'];
  const developerControlCardClass = theme === 'dark'
    ? 'rounded-xl border border-violet-300/20 bg-violet-400/10 p-3 transition-colors hover:bg-violet-300/20'
    : 'rounded-xl border border-white/70 bg-[rgba(255,255,255,0.45)] backdrop-blur-sm p-3 transition-colors hover:bg-[rgba(255,255,255,0.62)]';
  const developerControlLabelClass = theme === 'dark' ? 'text-violet-100' : 'text-slate-700';
  const developerWarnIconClass = theme === 'dark' ? 'text-amber-300' : 'text-amber-600';

  const activeFilterCount = (selectedAccounts.length > 0 ? 1 : 0) + (selectedRepIds.length > 0 ? 1 : 0);

  function toggleAccountFilter(accountKey: string) {
    setSelectedAccounts((prev) =>
      prev.includes(accountKey)
        ? prev.filter((key) => key !== accountKey)
        : [...prev, accountKey],
    );
  }

  function toggleSuperAdminRepFilter(repId: string) {
    setSelectedRepIds((prev) =>
      prev.includes(repId)
        ? prev.filter((id) => id !== repId)
        : [...prev, repId],
    );
  }

  function clearSuperAdminFilters() {
    setSelectedAccounts([]);
    setSelectedRepIds([]);
  }

  function saveSuperAdminPreset() {
    const trimmedName = superAdminPresetName.trim();
    const nextPreset: SuperAdminFilterPreset = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: trimmedName || `Quick Filter ${superAdminPresets.length + 1}`,
      accountKeys: selectedAccounts.filter((key) => Boolean(accounts[key])),
      repIds: selectedRepIds.filter((id) => id === UNASSIGNED_REP_ID || repScopeOptions.some((rep) => rep.id === id)),
      dateRange,
      customRange:
        dateRange === 'custom' && customRange
          ? { start: customRange.start.toISOString(), end: customRange.end.toISOString() }
          : null,
      createdAt: new Date().toISOString(),
    };

    setSuperAdminPresets((prev) => [nextPreset, ...prev].slice(0, 12));
    setSuperAdminPresetName('');
  }

  function applySuperAdminPreset(preset: SuperAdminFilterPreset) {
    setSelectedAccounts(preset.accountKeys.filter((key) => Boolean(accounts[key])));
    setSelectedRepIds(
      preset.repIds.filter((id) => id === UNASSIGNED_REP_ID || repScopeOptions.some((rep) => rep.id === id)),
    );
    setDateRange(preset.dateRange);

    if (preset.dateRange === 'custom' && preset.customRange) {
      const start = new Date(preset.customRange.start);
      const end = new Date(preset.customRange.end);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
        setCustomRange({ start, end });
      } else {
        setCustomRange(null);
      }
    } else {
      setCustomRange(null);
    }
  }

  function deleteSuperAdminPreset(presetId: string) {
    setSuperAdminPresets((prev) => prev.filter((preset) => preset.id !== presetId));
  }

  return (
    <div>
      <div className="page-sticky-header mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {isAccountMode && focusedAccountKey ? (
              <AccountAvatar
                name={focusedAccountName}
                accountKey={focusedAccountKey}
                storefrontImage={focusedAccountData?.storefrontImage}
                logos={focusedAccountData?.logos}
                size={44}
                className="h-11 w-11 rounded-xl border border-[var(--border)] bg-[var(--card)] flex-shrink-0"
              />
            ) : null}

            <div>
              <h2 className="text-2xl font-bold">{dashboardTitle}</h2>
              <p className="mt-0.5 text-sm font-medium text-[var(--foreground)]">Welcome, {welcomeName}!</p>
              {usingMockData ? (
                <p className="mt-1 inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                  Dummy Data Mode
                </p>
              ) : null}
            </div>
          </div>

          {isDeveloper ? (
            <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
              <button
                type="button"
                onClick={() => setDeveloperMode('analytics')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  developerMode === 'analytics'
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                Analytics View
              </button>
              <button
                type="button"
                onClick={() => setDeveloperMode('technical')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  developerMode === 'technical'
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                Technical View
              </button>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <DashboardToolbar
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
            />
            <button
              type="button"
              onClick={() => setFiltersPanelOpen(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--muted-foreground)] transition-colors hover:border-[var(--primary)] hover:text-[var(--foreground)]"
            >
              <FunnelIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 ? (
                <span className="rounded-full bg-[var(--primary)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--primary)]">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </div>

      {filtersPanelOpen ? (
        <div className="fixed inset-0 z-[80]">
          <button
            type="button"
            aria-label="Close filters panel"
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setFiltersPanelOpen(false)}
          />

          <aside
            className="glass-panel glass-panel-strong fixed right-3 top-3 bottom-3 w-[380px] rounded-2xl flex flex-col overflow-hidden animate-slide-in-right"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[var(--sidebar-border-soft)] px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FunnelIcon className="h-5 w-5 text-[var(--primary)]" />
                  <h3 className="text-sm font-bold tracking-tight">Filters</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setFiltersPanelOpen(false)}
                  className="rounded-xl p-1.5 text-[var(--sidebar-muted-foreground)] transition-colors hover:bg-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)]"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                Accounts: {selectedAccounts.length === 0 ? 'all' : selectedAccounts.length} · Reps: {selectedRepIds.length === 0 ? 'all' : selectedRepIds.length}
              </p>
            </div>

            <div className="themed-scrollbar flex-1 space-y-5 overflow-y-auto p-4">
              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Accounts</h4>
                  <button
                    type="button"
                    onClick={() => setSelectedAccounts([])}
                    className="text-[10px] text-[var(--primary)] hover:underline"
                  >
                    Select all
                  </button>
                </div>
                <div className="space-y-1 rounded-xl border border-[var(--border)] p-1.5">
                  {accountOptions.map((account) => {
                    const selected = selectedAccounts.includes(account.key);
                    return (
                      <button
                        key={account.key}
                        type="button"
                        onClick={() => toggleAccountFilter(account.key)}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors ${
                          selected
                            ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                            : 'text-[var(--foreground)] hover:bg-[var(--muted)]/30'
                        }`}
                      >
                        <span className="truncate text-left">{account.label}</span>
                        {selected ? <span className="text-[10px] font-semibold">Selected</span> : null}
                      </button>
                    );
                  })}
                </div>
              </section>

              {isSuperAdmin ? (
                <section>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Account Reps</h4>
                    <button
                      type="button"
                      onClick={() => setSelectedRepIds([])}
                      className="text-[10px] text-[var(--primary)] hover:underline"
                    >
                      Select all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 rounded-xl border border-[var(--border)] p-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRepIds([])}
                      className={`rounded-lg border px-2.5 py-1 text-[10px] transition-colors ${
                        selectedRepIds.length === 0
                          ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                          : 'border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      All reps
                    </button>
                    {repScopeOptions.map((rep) => {
                      const selected = selectedRepIds.includes(rep.id);
                      return (
                        <button
                          key={rep.id}
                          type="button"
                          onClick={() => toggleSuperAdminRepFilter(rep.id)}
                          className={`rounded-lg border px-2.5 py-1 text-[10px] transition-colors ${
                            selected
                              ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                              : 'border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          {rep.label} ({rep.accountCount})
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {isSuperAdmin ? (
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Quick Filters</h4>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={superAdminPresetName}
                      onChange={(event) => setSuperAdminPresetName(event.target.value)}
                      placeholder="Name this quick filter"
                      className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={saveSuperAdminPreset}
                      className="h-9 rounded-lg bg-[var(--primary)] px-3 text-xs font-medium text-white transition-opacity hover:opacity-90"
                    >
                      Save Quick Filter
                    </button>
                  </div>

                  {superAdminPresets.length === 0 ? (
                    <p className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
                      No quick filters saved yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {superAdminPresets.map((preset) => (
                        <div key={preset.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{preset.name}</p>
                            <p className="text-[10px] text-[var(--muted-foreground)]">
                              Accounts {preset.accountKeys.length === 0 ? 'all' : preset.accountKeys.length} · Reps {preset.repIds.length === 0 ? 'all' : preset.repIds.length}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => applySuperAdminPreset(preset)}
                              className="rounded-md border border-[var(--border)] px-2 py-1 text-[10px] transition-colors hover:bg-[var(--muted)]/30"
                            >
                              Apply
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSuperAdminPreset(preset.id)}
                              className="rounded-md border border-rose-500/30 px-2 py-1 text-[10px] text-rose-300 transition-colors hover:bg-rose-500/10"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-[var(--sidebar-border-soft)] p-4">
              <button
                type="button"
                onClick={clearSuperAdminFilters}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
              >
                Reset Filters
              </button>
              <button
                type="button"
                onClick={() => setFiltersPanelOpen(false)}
                className="rounded-lg border border-[var(--primary)] bg-[var(--primary)]/90 px-3 py-2 text-xs text-white transition-colors hover:bg-[var(--primary)]"
              >
                Done
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="glass-card h-28 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : null}

      {!loading && isDeveloper && developerMode === 'technical' ? (
        <div className={`${developerShellClass} space-y-5`}>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: 'Accounts', value: totals.accountCount, note: `${totals.connectedAccounts} connected`, icon: BuildingStorefrontIcon },
              { label: 'Users', value: users.length, note: `${roleCounts.length} role groups`, icon: UsersIcon },
              { label: 'API Health', value: `${apiHealth.filter((api) => api.ok).length}/${apiHealth.length}`, note: 'reporting endpoints', icon: CommandLineIcon },
              { label: 'Alerts', value: attentionAccounts.length, note: attentionAccounts.length > 0 ? 'needs action' : 'all clear', icon: ExclamationTriangleIcon },
            ].map((item, index) => (
              <div key={item.label} className={developerMetricClass}>
                <div className="mb-2 flex items-center justify-between">
                  <item.icon className={`h-7 w-7 ${developerMetricIconClasses[index % developerMetricIconClasses.length]}`} />
                  <span className={`text-[10px] uppercase tracking-wider ${developerMetricLabelClass}`}>{item.label}</span>
                </div>
                <p className={`text-3xl font-semibold tabular-nums ${developerMetricValueClass}`}>{item.value}</p>
                <p className={`text-[11px] ${developerMetricNoteClass}`}>{item.note}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className={`${developerPanelClass} xl:col-span-2`}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>Platform Activity Timeline</h3>
                <span className={`text-[10px] uppercase tracking-wider ${developerSubtleClass}`}>Campaigns vs flows vs contacts</span>
              </div>
              <ApexChart type="area" options={developerTimelineOptions} series={developerTimeline.series} height={280} />
            </div>

            <div className={developerPanelClass}>
              <div className="mb-3 flex items-center gap-2">
                <WrenchScrewdriverIcon className={`h-6 w-6 ${developerIconTintClass}`} />
                <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>Developer Controls</h3>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { href: '/users', label: 'Users', icon: UsersIcon },
                  { href: '/accounts', label: 'Accounts', icon: BuildingStorefrontIcon },
                  { href: '/settings/accounts', label: 'Integrations', icon: ArrowPathIcon },
                  { href: '/campaigns', label: 'Campaigns', icon: PaperAirplaneIcon },
                  { href: '/flows', label: 'Flows', icon: FlowIcon },
                  { href: '/media', label: 'Media', icon: PhotoIcon },
                ].map((item, index) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={developerControlCardClass}
                  >
                    <item.icon className={`h-8 w-8 ${developerControlIconClasses[index % developerControlIconClasses.length]}`} />
                    <p className={`mt-2 text-xs font-medium ${developerControlLabelClass}`}>{item.label}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className={developerPanelClass}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>Reporting API Health</h3>
                <span className={`text-[10px] uppercase tracking-wider ${developerSubtleClass}`}>score / 100</span>
              </div>
              <ApexChart type="bar" options={developerApiOptions} series={developerApiSeries} height={265} />
            </div>

            <div className={developerPanelClass}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>System Health Rings</h3>
                <span className={`text-[10px] uppercase tracking-wider ${developerSubtleClass}`}>live mix</span>
              </div>
              <ApexChart type="radialBar" options={developerGaugeOptions} series={developerGaugeSeries} height={265} />
            </div>

            <div className={developerPanelClass}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>User Role Split</h3>
                <span className={`text-[10px] uppercase tracking-wider ${developerSubtleClass}`}>{users.length} users</span>
              </div>
              <ApexChart type="donut" options={developerDonutOptions} series={developerRoleSeries} height={265} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className={developerPanelClass}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>Integration Risk Intensity</h3>
                <span className={`text-[10px] uppercase tracking-wider ${developerSubtleClass}`}>top accounts</span>
              </div>
              <ApexChart type="bar" options={developerRiskOptions} series={developerRiskSeries} height={255} />
            </div>

            <div className={developerPanelClass}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>Loomi Delivery Throughput</h3>
                <span className={`text-[10px] uppercase tracking-wider ${developerSubtleClass}`}>sent vs failed</span>
              </div>
              <ApexChart type="bar" options={developerDeliveryOptions} series={developerDeliverySeries} height={255} />
            </div>
          </div>
        </div>
      ) : null}

      {!loading && (!isDeveloper || developerMode === 'analytics') ? (
        <div className={isDeveloper ? `${developerShellClass} space-y-5` : 'space-y-8'}>
          {isDeveloper ? (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
                {[
                  { label: 'Accounts', value: totals.accountCount, icon: BuildingStorefrontIcon },
                  { label: 'Contacts', value: formatCompactNumber(totals.contactsTotal), icon: UserGroupIcon },
                  { label: 'Emails', value: totals.emailCount, icon: BookOpenIcon },
                  { label: 'Campaigns', value: totals.campaignCount, icon: PaperAirplaneIcon },
                  { label: 'Flows', value: totals.workflowCount, icon: FlowIcon },
                ].map((item, index) => (
                  <div key={item.label} className={developerMetricClass}>
                    <div className="mb-2 flex items-center justify-between">
                      <item.icon className={`h-7 w-7 ${developerMetricIconClasses[index % developerMetricIconClasses.length]}`} />
                      <span className={`text-[10px] uppercase tracking-wider ${developerMetricLabelClass}`}>{item.label}</span>
                    </div>
                    <p className={`text-3xl font-semibold tabular-nums ${developerMetricValueClass}`}>{item.value}</p>
                    <p className={`text-[11px] ${developerMetricNoteClass}`}>Current scoped totals</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className={`${developerPanelClass} xl:col-span-2`}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>Performance Timeline</h3>
                    <span className={`text-[10px] uppercase tracking-wider ${developerSubtleClass}`}>multi-series trend</span>
                  </div>
                  <ApexChart type="area" options={developerTimelineOptions} series={developerTimeline.series} height={280} />
                </div>

                <div className={developerPanelClass}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>Channel Mix</h3>
                    <span className={`text-[10px] uppercase tracking-wider ${developerSubtleClass}`}>donut</span>
                  </div>
                  <ApexChart type="donut" options={developerMixOptions} series={developerMixSeries} height={280} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                <StatCard
                  label={isSuperAdmin ? 'Total Accounts' : 'Assigned Accounts'}
                  value={totals.accountCount}
                  sub={`${totals.connectedAccounts} connected`}
                  icon={BuildingStorefrontIcon}
                  href="/accounts"
                />
                <StatCard label="Contacts" value={formatCompactNumber(totals.contactsTotal)} icon={UserGroupIcon} />
                <StatCard label="Emails" value={totals.emailCount} sub={`${totals.activeEmails} active`} icon={BookOpenIcon} href="/templates" />
                <StatCard label="Campaigns" value={totals.campaignCount} icon={PaperAirplaneIcon} href="/campaigns" />
                <StatCard label="Flows" value={totals.workflowCount} icon={FlowIcon} href="/flows" />
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className={developerPanelClass}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>Portfolio Pulse</h3>
                    <span className={`text-[10px] uppercase tracking-wider ${developerSubtleClass}`}>connection + engagement</span>
                  </div>
                  <ApexChart type="radialBar" options={developerGaugeOptions} series={developerGaugeSeries} height={275} />
                </div>

                <div className={developerPanelClass}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>Campaign &amp; Flow Mix</h3>
                    <span className={`text-[10px] uppercase tracking-wider ${developerSubtleClass}`}>current scope</span>
                  </div>
                  <ApexChart type="donut" options={developerMixOptions} series={developerMixSeries} height={275} />
                </div>

                <div className={developerPanelClass}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>Industry Signal</h3>
                    <span className={`text-[10px] uppercase tracking-wider ${developerSubtleClass}`}>top segments</span>
                  </div>
                  <ApexChart type="bar" options={developerIndustryOptions} series={developerIndustrySeries} height={275} />
                </div>
              </div>
            </>
          )}

          {isAdmin ? (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Account Health</h3>
                <Link href="/accounts" className="text-[10px] text-[var(--primary)] hover:underline">
                  Open accounts
                </Link>
              </div>
              <AccountHealthGrid
                accounts={selectedAccountMap}
                crmStats={contactStats}
                emailsByAccount={emailRollupByAccount}
                loading={loading}
              />
            </div>
          ) : isDeveloper ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className={developerPanelClass}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>System KPI Rings</h3>
                  <span className={`text-[10px] uppercase tracking-wider ${developerSubtleClass}`}>connection + engagement</span>
                </div>
                <ApexChart type="radialBar" options={developerGaugeOptions} series={developerGaugeSeries} height={275} />
              </div>

              <div className={developerPanelClass}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>Industry Concentration</h3>
                  <span className={`text-[10px] uppercase tracking-wider ${developerSubtleClass}`}>contacts by segment</span>
                </div>
                <ApexChart type="bar" options={developerIndustryOptions} series={developerIndustrySeries} height={275} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className={developerPanelClass}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>Portfolio Overview</h3>
                  <span className={`text-[10px] uppercase tracking-wider ${developerSubtleClass}`}>all scoped sub-accounts</span>
                </div>
                <ApexChart type="radialBar" options={developerGaugeOptions} series={developerGaugeSeries} height={275} />
              </div>

              <div className={developerPanelClass}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>Industry Breakdown</h3>
                  <span className={`text-[10px] uppercase tracking-wider ${developerSubtleClass}`}>top segments</span>
                </div>
                <ApexChart type="bar" options={developerIndustryOptions} series={developerIndustrySeries} height={275} />
              </div>
            </div>
          )}

          {isDeveloper ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className={developerPanelClass}>
                <div className="mb-3 flex items-center gap-2">
                  <Image
                    src="/icons/icons8-leaderboard.svg"
                    alt="Leaderboard"
                    width={30}
                    height={30}
                    className="h-7 w-7"
                  />
                  <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>Top Account Momentum</h3>
                </div>
                <ApexChart type="bar" options={developerMomentumOptions} series={developerMomentumSeries} height={260} />
              </div>

              <div className={developerPanelClass}>
                <div className="mb-3 flex items-center gap-2">
                  <ExclamationTriangleIcon className={`h-6 w-6 ${developerWarnIconClass}`} />
                  <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>Account Risk Intensity</h3>
                </div>
                <ApexChart type="bar" options={developerRiskOptions} series={developerRiskSeries} height={260} />
              </div>

              <div className={developerPanelClass}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className={`text-sm font-semibold ${developerHeadingClass}`}>Channel Delivery Trend</h3>
                  <span className={`text-[10px] uppercase tracking-wider ${developerSubtleClass}`}>stacked volume</span>
                </div>
                <ApexChart type="bar" options={developerDeliveryOptions} series={developerDeliverySeries} height={260} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="glass-card rounded-xl p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Image
                    src="/icons/icons8-leaderboard.svg"
                    alt="Leaderboard"
                    width={24}
                    height={24}
                    className="h-6 w-6"
                  />
                  <h3 className="text-sm font-semibold">Account Leaderboard</h3>
                </div>
                {accountLeaderboard.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)]">No account-level metrics available.</p>
                ) : (
                  <div className="space-y-2">
                    {accountLeaderboard.map((row, index) => (
                      <div key={row.key} className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2">
                        <span className="w-4 text-xs text-[var(--muted-foreground)]">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{row.dealer}</p>
                          <p className="text-[10px] text-[var(--muted-foreground)]">
                            {row.rollup.contactCount.toLocaleString()} contacts · {row.rollup.campaignCount} campaigns · {row.rollup.workflowCount} flows
                          </p>
                        </div>
                        <Link href={`/accounts/${row.key}`} className="text-[10px] text-[var(--primary)] hover:underline">
                          View
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="glass-card rounded-xl p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-5 w-5 text-amber-400" />
                  <h3 className="text-sm font-semibold">Needs Attention</h3>
                </div>
                {attentionAccounts.length === 0 ? (
                  <p className="text-sm text-emerald-400">All scoped accounts look healthy.</p>
                ) : (
                  <div className="space-y-2">
                    {attentionAccounts.map((item) => (
                      <div key={item.key} className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">{item.dealer}</p>
                          <Link href={`/accounts/${item.key}`} className="text-[10px] text-[var(--primary)] hover:underline">
                            Resolve
                          </Link>
                        </div>
                        <p className="text-xs text-[var(--muted-foreground)]">{item.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">ESP Campaign Performance</h3>
              <Link href="/campaigns" className="text-[10px] text-[var(--primary)] hover:underline">
                Open campaign center
              </Link>
            </div>
            <CampaignPageAnalytics
              campaigns={filteredEspCampaigns}
              loading={loading || campaignsAggregateLoading}
              showAccountBreakdown
              accountNames={accountNames}
            />
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Flow Performance</h3>
              <Link href="/flows" className="text-[10px] text-[var(--primary)] hover:underline">
                Open flow center
              </Link>
            </div>
            <FlowAnalytics
              workflows={filteredEspWorkflows}
              loading={loading || workflowsAggregateLoading}
              showAccountBreakdown
              accountNames={accountNames}
            />
          </div>

          {isAdmin || isDeveloper ? (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Template & Email Utilization</h3>
                <Link href="/templates" className="text-[10px] text-[var(--primary)] hover:underline">
                  Open templates
                </Link>
              </div>
              <EmailAnalytics
                emails={filteredEmails}
                loading={loading}
                showAccountBreakdown
                accountNames={accountNames}
                dateRange={dateRange}
                customRange={customRange}
              />
            </div>
          ) : null}

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Contact Analytics</h3>
              <Link href="/contacts" className="text-[10px] text-[var(--primary)] hover:underline">
                Open contacts
              </Link>
            </div>
            <ContactAnalytics
              contacts={filteredContacts}
              totalCount={totals.contactsTotal}
              loading={loading || contactsAggregateLoading}
              dateRange={dateRange}
              customRange={customRange}
            />
          </div>

          {!isDeveloper ? (
            <div className="glass-card rounded-xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Recent Loomi Campaign Activity</h3>
                <Link href="/campaigns" className="text-[10px] text-[var(--primary)] hover:underline">
                  View all campaigns
                </Link>
              </div>
              {recentLoomiCampaigns.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">No Loomi campaigns in the selected scope.</p>
              ) : (
                <div className="space-y-2">
                  {recentLoomiCampaigns.map((campaign) => (
                    <div key={campaign.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${campaign.source === 'email' ? 'bg-blue-500/10 text-blue-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                        {campaign.source}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{campaign.name}</p>
                        <p className="text-[10px] text-[var(--muted-foreground)]">
                          {campaign.recipients.toLocaleString()} recipients · {campaign.sentCount} sent · {campaign.failedCount} failed · {campaign.accountCount} account{campaign.accountCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="text-right text-[10px] text-[var(--muted-foreground)]">
                        <p className="capitalize">{campaign.status}</p>
                        <p>{relativeTime(campaign.updatedAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ClientRoleDashboard({
  accountKey,
  accountData,
  userName,
}: {
  accountKey: string | null;
  accountData: AccountData | null;
  userName: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRangeKey>(DEFAULT_DATE_RANGE);
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);

  const [espCampaigns, setEspCampaigns] = useState<EspCampaign[]>([]);
  const [loomiEmailCampaigns, setLoomiEmailCampaigns] = useState<LoomiEmailCampaign[]>([]);
  const [loomiSmsCampaigns, setLoomiSmsCampaigns] = useState<LoomiSmsCampaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [usingMockData, setUsingMockData] = useState(false);
  const { theme } = useTheme();
  const clientChartTextColor = theme === 'dark' ? '#cbd5e1' : '#334155';
  const clientChartMutedColor = theme === 'dark' ? '#94a3b8' : '#64748b';
  const clientChartGridColor = theme === 'dark' ? 'rgba(148,163,184,0.18)' : 'rgba(100,116,139,0.24)';
  const clientChartStrokeColor = theme === 'dark' ? 'rgba(16,15,35,0.95)' : 'rgba(248,250,252,0.96)';
  const clientChartTooltipTheme: 'dark' | 'light' = theme === 'dark' ? 'dark' : 'light';
  const clientPanelClass = theme === 'dark'
    ? 'rounded-2xl border border-white/10 bg-[linear-gradient(155deg,rgba(24,24,43,0.86),rgba(31,18,42,0.82))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
    : 'rounded-2xl border border-white/70 bg-[linear-gradient(155deg,rgba(255,255,255,0.44),rgba(237,243,255,0.38))] backdrop-blur-xl p-5 shadow-[0_8px_20px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.8)]';
  const clientHeadingClass = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const clientSubtleClass = theme === 'dark' ? 'text-violet-100/70' : 'text-slate-500';

  useEffect(() => {
    if (!accountKey) {
      setLoading(false);
      return;
    }
    const targetAccountKey = accountKey;

    let cancelled = false;

    async function loadClientData() {
      setLoading(true);
      setError(null);

      if (DASHBOARD_DUMMY_MODE) {
        const mockAccounts: Record<string, AccountData> = {
          [targetAccountKey]: accountData || ({ dealer: 'Demo Account' } as AccountData),
        };
        const mock = buildMockManagementDataset(mockAccounts);
        if (cancelled) return;
        setEspCampaigns(mock.espCampaigns.filter((campaign) => campaign.accountKey === targetAccountKey));
        setLoomiEmailCampaigns(mock.loomiEmailCampaigns.filter((campaign) => campaign.accountKeys.includes(targetAccountKey)));
        setLoomiSmsCampaigns(mock.loomiSmsCampaigns.filter((campaign) => campaign.accountKeys.includes(targetAccountKey)));
        setUsingMockData(true);
        setLoading(false);
        return;
      }

      const [campaignRes, loomiEmailRes, loomiSmsRes] = await Promise.all([
        loadJson(`/api/esp/campaigns?accountKey=${encodeURIComponent(targetAccountKey)}`),
        loadJson('/api/campaigns/email?limit=50'),
        loadJson('/api/esp/messages/bulk?limit=50'),
      ]);

      if (cancelled) return;

      const shouldFallbackToMock = process.env.NODE_ENV === 'development' && !campaignRes.ok;
      if (shouldFallbackToMock) {
        const mockAccounts: Record<string, AccountData> = {
          [targetAccountKey]: accountData || ({ dealer: 'Demo Account' } as AccountData),
        };
        const mock = buildMockManagementDataset(mockAccounts);
        setEspCampaigns(mock.espCampaigns.filter((campaign) => campaign.accountKey === targetAccountKey));
        setLoomiEmailCampaigns(mock.loomiEmailCampaigns.filter((campaign) => campaign.accountKeys.includes(targetAccountKey)));
        setLoomiSmsCampaigns(mock.loomiSmsCampaigns.filter((campaign) => campaign.accountKeys.includes(targetAccountKey)));
        setUsingMockData(true);
        setLoading(false);
        return;
      }

      if (campaignRes.ok) {
        setEspCampaigns(asArray<EspCampaign>((campaignRes.json as Record<string, unknown>).campaigns));
      } else {
        setEspCampaigns([]);
      }

      if (loomiEmailRes.ok) {
        const allRows = asArray<LoomiEmailCampaign>((loomiEmailRes.json as Record<string, unknown>).campaigns);
        setLoomiEmailCampaigns(allRows.filter((campaign) => asArray<string>(campaign.accountKeys).includes(targetAccountKey)));
      } else {
        setLoomiEmailCampaigns([]);
      }

      if (loomiSmsRes.ok) {
        const allRows = asArray<LoomiSmsCampaign>((loomiSmsRes.json as Record<string, unknown>).campaigns);
        setLoomiSmsCampaigns(allRows.filter((campaign) => asArray<string>(campaign.accountKeys).includes(targetAccountKey)));
      } else {
        setLoomiSmsCampaigns([]);
      }

      if (!campaignRes.ok) {
        const message = String((campaignRes.json as Record<string, unknown>).error || 'Unable to load campaign reporting');
        setError(message);
      }

      setUsingMockData(false);
      setLoading(false);
    }

    loadClientData();

    return () => {
      cancelled = true;
    };
  }, [accountKey, accountData]);

  const bounds = useMemo(
    () =>
      dateRange === 'custom' && customRange
        ? getDateRangeBounds('custom', customRange.start, customRange.end)
        : getDateRangeBounds(dateRange),
    [dateRange, customRange],
  );

  const filteredEspCampaigns = useMemo(
    () =>
      espCampaigns.filter((campaign) => {
        const dateValue = firstCampaignDate(campaign);
        return inBounds(dateValue, bounds);
      }),
    [espCampaigns, bounds],
  );

  const filteredLoomiEmailCampaigns = useMemo(
    () => loomiEmailCampaigns.filter((campaign) => inBounds(campaign.updatedAt || campaign.createdAt, bounds)),
    [loomiEmailCampaigns, bounds],
  );

  const filteredLoomiSmsCampaigns = useMemo(
    () => loomiSmsCampaigns.filter((campaign) => inBounds(campaign.updatedAt || campaign.createdAt, bounds)),
    [loomiSmsCampaigns, bounds],
  );

  const clientEngagement = useMemo(() => sumCampaignEngagement(filteredEspCampaigns), [filteredEspCampaigns]);

  const scheduledEsp = filteredEspCampaigns.filter((campaign) => {
    const status = normalizeStatus(campaign.status);
    return status.includes('sched') || status.includes('active') || status.includes('queue') || status.includes('progress');
  }).length;

  const sentEsp = filteredEspCampaigns.filter((campaign) => {
    const status = normalizeStatus(campaign.status);
    return status.includes('sent') || status.includes('deliver') || status.includes('complete') || status.includes('finish');
  }).length;

  const otherEsp = Math.max(0, filteredEspCampaigns.length - scheduledEsp - sentEsp);
  const clientOpenRatePct = Math.max(0, Math.min(100, Math.round((clientEngagement.openRate || 0) * 100)));
  const clientClickRatePct = Math.max(0, Math.min(100, Math.round((clientEngagement.clickRate || 0) * 100)));

  const clientStatusMix = useMemo(
    () => [
      { label: 'Scheduled', value: scheduledEsp },
      { label: 'Sent / Complete', value: sentEsp },
      { label: 'Other', value: otherEsp },
    ],
    [scheduledEsp, sentEsp, otherEsp],
  );

  const clientChannelMix = useMemo(
    () => [
      { label: 'ESP Campaigns', value: filteredEspCampaigns.length },
      { label: 'Loomi Email', value: filteredLoomiEmailCampaigns.length },
      { label: 'Loomi SMS', value: filteredLoomiSmsCampaigns.length },
    ],
    [filteredEspCampaigns.length, filteredLoomiEmailCampaigns.length, filteredLoomiSmsCampaigns.length],
  );
  const clientStatusMixLabels = useMemo(
    () => clientStatusMix.map((row) => row.label),
    [clientStatusMix],
  );
  const clientStatusMixSeries = useMemo(
    () => clientStatusMix.map((row) => row.value),
    [clientStatusMix],
  );
  const clientChannelCategories = useMemo(
    () => clientChannelMix.map((row) => row.label),
    [clientChannelMix],
  );
  const clientChannelSeries = useMemo(
    () => [{ name: 'Volume', data: clientChannelMix.map((row) => row.value) }],
    [clientChannelMix],
  );
  const clientBarGrid = useMemo(
    () => ({ borderColor: clientChartGridColor, strokeDashArray: 4 }),
    [clientChartGridColor],
  );
  const clientGaugeSeries = [clientOpenRatePct, clientClickRatePct];

  const clientGaugeOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: 'radialBar', background: 'transparent', toolbar: { show: false }, foreColor: clientChartTextColor },
      labels: ['Open Rate', 'Click Rate'],
      colors: ['#22d3ee', '#a78bfa'],
      plotOptions: {
        radialBar: {
          hollow: { size: '34%' },
          track: { background: clientChartGridColor },
          dataLabels: {
            name: { fontSize: '10px', color: clientChartMutedColor },
            value: { fontSize: '12px', color: clientChartTextColor },
            total: {
              show: true,
              label: 'Delivery',
              color: clientChartTextColor,
              formatter: () => `${Math.round((clientOpenRatePct + clientClickRatePct) / 2)}%`,
            },
          },
        },
      },
      legend: { show: true, position: 'bottom', labels: { colors: clientChartTextColor }, fontSize: '11px' },
      tooltip: { theme: clientChartTooltipTheme },
      noData: { text: 'No delivery data', style: { color: clientChartMutedColor } },
    }),
    [
      clientChartGridColor,
      clientChartMutedColor,
      clientChartTextColor,
      clientChartTooltipTheme,
      clientClickRatePct,
      clientOpenRatePct,
    ],
  );

  const clientStatusMixOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: 'donut', background: 'transparent', toolbar: { show: false }, foreColor: clientChartTextColor },
      labels: clientStatusMixLabels,
      colors: ['#818cf8', '#34d399', '#94a3b8'],
      dataLabels: { enabled: false },
      stroke: { width: 2, colors: [clientChartStrokeColor] },
      legend: { show: true, position: 'bottom', labels: { colors: clientChartTextColor }, fontSize: '11px' },
      plotOptions: { pie: { donut: { size: '70%' } } },
      tooltip: { theme: clientChartTooltipTheme },
      noData: { text: 'No status mix', style: { color: clientChartMutedColor } },
    }),
    [
      clientChartMutedColor,
      clientChartStrokeColor,
      clientChartTextColor,
      clientChartTooltipTheme,
      clientStatusMixLabels,
    ],
  );

  const clientChannelOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: 'bar', background: 'transparent', toolbar: { show: false }, foreColor: clientChartTextColor },
      colors: ['#60a5fa', '#f472b6', '#f59e0b'],
      plotOptions: { bar: { horizontal: true, borderRadius: 6, barHeight: '58%', distributed: true } },
      dataLabels: { enabled: false },
      legend: { show: false },
      xaxis: { categories: clientChannelCategories, labels: { style: { colors: clientChartMutedColor } } },
      yaxis: { labels: { style: { colors: clientChartTextColor } } },
      grid: clientBarGrid,
      tooltip: { theme: clientChartTooltipTheme },
      noData: { text: 'No channel output', style: { color: clientChartMutedColor } },
    }),
    [
      clientBarGrid,
      clientChannelCategories,
      clientChartMutedColor,
      clientChartTextColor,
      clientChartTooltipTheme,
    ],
  );

  const recentActivity = useMemo(() => {
    type Row = {
      id: string;
      source: 'esp' | 'email' | 'sms';
      title: string;
      status: string;
      date: string;
      detail: string;
    };

    const espRows: Row[] = filteredEspCampaigns.map((campaign) => ({
      id: `esp-${campaign.id}`,
      source: 'esp',
      title: campaign.name,
      status: campaign.status,
      date: firstCampaignDate(campaign) || campaign.updatedAt || campaign.createdAt || '',
      detail: campaign.sentCount
        ? `${campaign.sentCount.toLocaleString()} sent`
        : 'ESP campaign',
    }));

    const emailRows: Row[] = filteredLoomiEmailCampaigns.map((campaign) => ({
      id: `email-${campaign.id}`,
      source: 'email',
      title: campaign.name || campaign.subject || 'Email Campaign',
      status: campaign.status,
      date: campaign.updatedAt || campaign.createdAt,
      detail: `${asNumber(campaign.sentCount)} sent · ${asNumber(campaign.failedCount)} failed`,
    }));

    const smsRows: Row[] = filteredLoomiSmsCampaigns.map((campaign) => ({
      id: `sms-${campaign.id}`,
      source: 'sms',
      title: campaign.name || 'SMS Campaign',
      status: campaign.status,
      date: campaign.updatedAt || campaign.createdAt,
      detail: `${asNumber(campaign.sentCount)} sent · ${asNumber(campaign.failedCount)} failed`,
    }));

    return [...espRows, ...emailRows, ...smsRows]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 12);
  }, [filteredEspCampaigns, filteredLoomiEmailCampaigns, filteredLoomiSmsCampaigns]);

  if (!accountKey || !accountData) {
    return (
      <div className="glass-card rounded-xl p-6">
        <h2 className="text-lg font-semibold">Dashboard</h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">No account context is available for this user.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-sticky-header mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Dashboard</h2>
            <p className="mt-0.5 text-sm font-medium text-[var(--foreground)]">Welcome, {userName?.trim() || 'there'}!</p>
            {usingMockData ? (
              <p className="mt-1 inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                Dummy Data Mode
              </p>
            ) : null}
          </div>

          <DashboardToolbar
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="glass-card h-28 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {error ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Campaigns" value={filteredEspCampaigns.length} icon={PaperAirplaneIcon} href="/campaigns" />
            <StatCard label="Scheduled" value={scheduledEsp} icon={ArrowPathIcon} href="/campaigns/schedule" />
            <StatCard label="Sent / Completed" value={sentEsp} icon={CheckCircleIcon} href="/campaigns" />
            <StatCard label="Loomi Email" value={filteredLoomiEmailCampaigns.length} icon={BookOpenIcon} href="/campaigns" />
            <StatCard
              label="Loomi SMS"
              value={filteredLoomiSmsCampaigns.length}
              sub={`OR ${formatRatePct(clientEngagement.openRate)}`}
              icon={ChartBarIcon}
              href="/campaigns"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className={clientPanelClass}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${clientHeadingClass}`}>Delivery Pulse</h3>
                <span className={`text-[10px] uppercase tracking-wider ${clientSubtleClass}`}>open + click</span>
              </div>
              <ApexChart type="radialBar" options={clientGaugeOptions} series={clientGaugeSeries} height={265} />
            </div>

            <div className={clientPanelClass}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${clientHeadingClass}`}>Campaign Status Mix</h3>
                <span className={`text-[10px] uppercase tracking-wider ${clientSubtleClass}`}>date range</span>
              </div>
              <ApexChart type="donut" options={clientStatusMixOptions} series={clientStatusMixSeries} height={265} />
            </div>

            <div className={clientPanelClass}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${clientHeadingClass}`}>Channel Output</h3>
                <span className={`text-[10px] uppercase tracking-wider ${clientSubtleClass}`}>by campaign type</span>
              </div>
              <ApexChart type="bar" options={clientChannelOptions} series={clientChannelSeries} height={265} />
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">ESP Campaign Performance</h3>
              <Link href="/campaigns" className="text-[10px] text-[var(--primary)] hover:underline">
                Open campaign center
              </Link>
            </div>
            <CampaignPageAnalytics
              campaigns={filteredEspCampaigns}
              loading={loading}
              showAccountBreakdown={false}
              emptyTitle="No ESP campaign activity for this date range"
              emptySubtitle="Try a wider date range or publish a campaign from your campaign center."
            />
          </div>

          <div className="glass-card rounded-xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Recent Campaign Activity</h3>
              <span className="text-[10px] text-[var(--muted-foreground)]">{recentActivity.length} items</span>
            </div>

            {recentActivity.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">No campaign events in this date range.</p>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                        activity.source === 'esp'
                          ? 'bg-blue-500/10 text-blue-300'
                          : activity.source === 'email'
                              ? 'bg-cyan-500/10 text-cyan-300'
                              : 'bg-emerald-500/10 text-emerald-300'
                      }`}
                    >
                      {activity.source}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{activity.title}</p>
                      <p className="text-[10px] text-[var(--muted-foreground)]">{activity.detail}</p>
                    </div>
                    <div className="text-right text-[10px] text-[var(--muted-foreground)]">
                      <p className="capitalize">{activity.status}</p>
                      <p>{relativeTime(activity.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
