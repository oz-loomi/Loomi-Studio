import { prisma } from '@/lib/prisma';
import * as accountService from '@/lib/services/accounts';
import { isYagRollupAccount } from '@/lib/accounts/rollup';
import {
  isLikelyDeliverableEmail,
  isLikelyDialablePhone,
  normalizeEmailAddress,
  normalizePhoneNumber,
} from '@/lib/contact-hygiene';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { withConcurrencyLimit } from '@/lib/esp/utils';
import { GHL_BASE, API_VERSION } from '@/lib/esp/adapters/ghl/constants';
import '@/lib/esp/init';

const YAG_ROLLUP_SINGLETON_KEY = 'primary';
const GHL_PAGE_SIZE = 100;
const DEFAULT_INCREMENTAL_LOOKBACK_HOURS = 48;
const DEFAULT_SOURCE_ACCOUNT_CONCURRENCY = 3;
const DEFAULT_TARGET_UPSERT_CONCURRENCY = 4;
const DEFAULT_MAX_SOURCE_CONTACTS_PER_ACCOUNT = 50_000;
const DEFAULT_MAX_UPSERTS_PER_RUN = 10_000;
const DEFAULT_TARGET_DELETE_CONCURRENCY = 4;
const DEFAULT_MAX_DELETES_PER_RUN = 50_000;
const DEFAULT_MAX_TARGET_CONTACTS_FOR_WIPE = 150_000;
const ROLLUP_TAG_PREFIX = 'rollup-src:';

export interface YagRollupAccountOption {
  key: string;
  dealer: string;
}

export interface YagRollupConfigPayload {
  targetAccountKey: string;
  sourceAccountKeys: string[];
  enabled: boolean;
  scrubInvalidEmails: boolean;
  scrubInvalidPhones: boolean;
  updatedByUserId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncSummary: Record<string, unknown> | null;
}

export interface YagRollupConfigSnapshot {
  config: YagRollupConfigPayload;
  targetOptions: YagRollupAccountOption[];
  sourceOptions: YagRollupAccountOption[];
  accountOptions: YagRollupAccountOption[];
  isDefaultConfig: boolean;
}

export interface SaveYagRollupConfigInput {
  targetAccountKey: string;
  sourceAccountKeys: string[];
  enabled: boolean;
  scrubInvalidEmails: boolean;
  scrubInvalidPhones: boolean;
  updatedByUserId?: string | null;
}

export interface RunYagRollupSyncOptions {
  dryRun?: boolean;
  fullSync?: boolean;
  sourceAccountLimit?: number;
  maxUpserts?: number;
}

export type YagRollupWipeMode = 'all' | 'tagged';

export interface RunYagRollupWipeOptions {
  dryRun?: boolean;
  mode?: YagRollupWipeMode;
  maxDeletes?: number;
}

interface SourceSyncStats {
  provider: string;
  fetchedContacts: number;
  consideredContacts: number;
  acceptedContacts: number;
  skippedInvalid: number;
  localDuplicatesCollapsed: number;
}

interface PreparedContact {
  dedupeKey: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  tags: string[];
  sourceAccountKeys: string[];
}

export interface RunYagRollupSyncResult {
  status: 'ok' | 'disabled' | 'failed';
  dryRun: boolean;
  fullSync: boolean;
  targetAccountKey: string;
  sourceAccountKeys: string[];
  startedAt: string;
  finishedAt: string;
  totals: {
    sourceAccountsRequested: number;
    sourceAccountsProcessed: number;
    fetchedContacts: number;
    consideredContacts: number;
    acceptedContacts: number;
    skippedInvalid: number;
    localDuplicatesCollapsed: number;
    globalDuplicatesCollapsed: number;
    queuedForTarget: number;
    truncatedByMaxUpserts: number;
    upsertsAttempted: number;
    upsertsSucceeded: number;
    upsertsFailed: number;
  };
  perSource: Record<string, SourceSyncStats>;
  errors: Record<string, string>;
}

export interface RunYagRollupWipeResult {
  status: 'ok' | 'failed';
  dryRun: boolean;
  mode: YagRollupWipeMode;
  targetAccountKey: string;
  startedAt: string;
  finishedAt: string;
  totals: {
    fetchedContacts: number;
    eligibleContacts: number;
    queuedForDelete: number;
    truncatedByMaxDeletes: number;
    deletesAttempted: number;
    deletesSucceeded: number;
    deletesFailed: number;
  };
  errors: Record<string, string>;
}

function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => String(value || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function uniqueKeys(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name] || '');
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(raw)));
}

function toIsoOrNull(date: Date | null | undefined): string | null {
  return date instanceof Date ? date.toISOString() : null;
}

function parseDateMs(value: string): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAccountOptions(
  accounts: Array<{ key: string; dealer: string | null }>,
): YagRollupAccountOption[] {
  return accounts
    .map((account) => ({
      key: account.key,
      dealer: account.dealer || account.key,
    }))
    .sort((a, b) => a.dealer.localeCompare(b.dealer));
}

function buildDefaultConfig(
  accountOptions: YagRollupAccountOption[],
): YagRollupConfigPayload {
  const target = accountOptions.find((account) =>
    isYagRollupAccount(account.key, account.dealer),
  ) || null;
  const targetAccountKey = target?.key || '';
  const sourceAccountKeys = accountOptions
    .filter((account) => account.key !== targetAccountKey)
    .filter((account) => !isYagRollupAccount(account.key, account.dealer))
    .map((account) => account.key);

  return {
    targetAccountKey,
    sourceAccountKeys,
    enabled: true,
    scrubInvalidEmails: true,
    scrubInvalidPhones: true,
    updatedByUserId: null,
    createdAt: null,
    updatedAt: null,
    lastSyncedAt: null,
    lastSyncStatus: null,
    lastSyncSummary: null,
  };
}

function hydrateSavedConfig(
  accountOptions: YagRollupAccountOption[],
  row: {
    targetAccountKey: string;
    sourceAccountKeys: string;
    enabled: boolean;
    scrubInvalidEmails: boolean;
    scrubInvalidPhones: boolean;
    updatedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    lastSyncedAt: Date | null;
    lastSyncStatus: string | null;
    lastSyncSummary: string | null;
  },
): YagRollupConfigPayload {
  const allowed = new Set(accountOptions.map((account) => account.key));
  const dealerByKey = new Map(accountOptions.map((account) => [account.key, account.dealer]));
  const targetAccountKey = allowed.has(row.targetAccountKey) ? row.targetAccountKey : '';
  const sourceAccountKeys = parseJsonStringArray(row.sourceAccountKeys)
    .filter((key) => allowed.has(key))
    .filter((key) => key !== targetAccountKey)
    .filter((key) => !isYagRollupAccount(key, dealerByKey.get(key) || key));

  return {
    targetAccountKey,
    sourceAccountKeys,
    enabled: Boolean(row.enabled),
    scrubInvalidEmails: Boolean(row.scrubInvalidEmails),
    scrubInvalidPhones: Boolean(row.scrubInvalidPhones),
    updatedByUserId: row.updatedByUserId || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastSyncedAt: toIsoOrNull(row.lastSyncedAt),
    lastSyncStatus: row.lastSyncStatus || null,
    lastSyncSummary: parseJsonObject(row.lastSyncSummary),
  };
}

export async function getYagRollupConfigSnapshot(
  accountKeys?: string[],
): Promise<YagRollupConfigSnapshot> {
  const accounts = await accountService.getAccounts(accountKeys);
  const accountOptions = normalizeAccountOptions(
    accounts.map((account) => ({
      key: account.key,
      dealer: account.dealer || null,
    })),
  );

  const defaultConfig = buildDefaultConfig(accountOptions);
  const saved = await prisma.yagRollupConfig.findUnique({
    where: { singletonKey: YAG_ROLLUP_SINGLETON_KEY },
  });

  const config = saved
    ? hydrateSavedConfig(accountOptions, saved)
    : defaultConfig;

  const targetOptions = accountOptions.filter((account) =>
    isYagRollupAccount(account.key, account.dealer),
  );
  const sourceOptions = accountOptions
    .filter((account) => account.key !== config.targetAccountKey)
    .filter((account) => !isYagRollupAccount(account.key, account.dealer));

  const sourceFallback = sourceOptions.map((account) => account.key);
  const safeSourceKeys = config.sourceAccountKeys.filter((key) =>
    sourceOptions.some((option) => option.key === key),
  );

  return {
    config: {
      ...config,
      sourceAccountKeys: safeSourceKeys.length > 0 ? safeSourceKeys : sourceFallback,
    },
    targetOptions,
    sourceOptions,
    accountOptions,
    isDefaultConfig: !saved,
  };
}

export async function upsertYagRollupConfig(
  input: SaveYagRollupConfigInput,
): Promise<YagRollupConfigPayload> {
  const row = await prisma.yagRollupConfig.upsert({
    where: { singletonKey: YAG_ROLLUP_SINGLETON_KEY },
    create: {
      singletonKey: YAG_ROLLUP_SINGLETON_KEY,
      targetAccountKey: input.targetAccountKey,
      sourceAccountKeys: JSON.stringify(uniqueKeys(input.sourceAccountKeys)),
      enabled: Boolean(input.enabled),
      scrubInvalidEmails: Boolean(input.scrubInvalidEmails),
      scrubInvalidPhones: Boolean(input.scrubInvalidPhones),
      updatedByUserId: input.updatedByUserId || null,
    },
    update: {
      targetAccountKey: input.targetAccountKey,
      sourceAccountKeys: JSON.stringify(uniqueKeys(input.sourceAccountKeys)),
      enabled: Boolean(input.enabled),
      scrubInvalidEmails: Boolean(input.scrubInvalidEmails),
      scrubInvalidPhones: Boolean(input.scrubInvalidPhones),
      updatedByUserId: input.updatedByUserId || null,
    },
  });

  return {
    targetAccountKey: row.targetAccountKey,
    sourceAccountKeys: parseJsonStringArray(row.sourceAccountKeys),
    enabled: row.enabled,
    scrubInvalidEmails: row.scrubInvalidEmails,
    scrubInvalidPhones: row.scrubInvalidPhones,
    updatedByUserId: row.updatedByUserId || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastSyncedAt: toIsoOrNull(row.lastSyncedAt),
    lastSyncStatus: row.lastSyncStatus || null,
    lastSyncSummary: parseJsonObject(row.lastSyncSummary),
  };
}

async function fetchAllGhlContactsForRollup(
  token: string,
  locationId: string,
  maxContacts: number,
): Promise<Record<string, unknown>[]> {
  const allContacts: Record<string, unknown>[] = [];
  let hasMore = true;
  let startAfter: string | undefined;
  let page = 0;

  while (hasMore && allContacts.length < maxContacts) {
    const query = new URLSearchParams({
      locationId,
      limit: String(GHL_PAGE_SIZE),
    });
    if (startAfter) query.set('startAfter', startAfter);
    if (page > 0 && startAfter) query.set('startAfterId', startAfter);

    const res = await fetch(`${GHL_BASE}/contacts/?${query.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Version: API_VERSION,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      // First page fallback: some accounts only support /contacts/search.
      if (page === 0) {
        const fallbackQuery = new URLSearchParams({
          locationId,
          limit: String(Math.min(GHL_PAGE_SIZE, maxContacts)),
        });
        const fallbackRes = await fetch(`${GHL_BASE}/contacts/search?${fallbackQuery.toString()}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Version: API_VERSION,
            Accept: 'application/json',
          },
        });
        if (!fallbackRes.ok) {
          throw new Error(`GHL contacts fetch failed (${fallbackRes.status})`);
        }
        const fallbackData = await fallbackRes.json();
        const fallbackContacts =
          (Array.isArray(fallbackData?.contacts) && fallbackData.contacts) ||
          (Array.isArray(fallbackData?.data?.contacts) && fallbackData.data.contacts) ||
          (Array.isArray(fallbackData?.data) && fallbackData.data) ||
          [];
        return (fallbackContacts as Record<string, unknown>[]).slice(0, maxContacts);
      }

      throw new Error(`GHL contacts fetch failed (${res.status})`);
    }

    const data = await res.json();
    const contactsRaw =
      (Array.isArray(data?.contacts) && data.contacts) ||
      (Array.isArray(data?.data?.contacts) && data.data.contacts) ||
      (Array.isArray(data?.data) && data.data) ||
      [];

    if (contactsRaw.length === 0) break;

    allContacts.push(...contactsRaw);
    if (allContacts.length >= maxContacts) break;

    const nextPageUrl = data?.meta?.nextPageUrl || data?.meta?.nextPage;
    const startAfterId = data?.meta?.startAfterId;
    if (startAfterId) {
      startAfter = String(startAfterId);
    } else {
      const lastContact = contactsRaw[contactsRaw.length - 1] as Record<string, unknown> | undefined;
      const lastId = lastContact?.id || lastContact?._id;
      startAfter = typeof lastId === 'string' ? lastId : '';
    }

    hasMore = contactsRaw.length >= GHL_PAGE_SIZE && Boolean(startAfter) && Boolean(nextPageUrl || startAfterId);
    page += 1;
  }

  return allContacts.slice(0, maxContacts);
}

async function fetchSourcePreparedContacts(params: {
  accountKey: string;
  scrubInvalidEmails: boolean;
  scrubInvalidPhones: boolean;
  fullSync: boolean;
  incrementalCutoffMs: number;
  maxSourceContactsPerAccount: number;
}): Promise<{ prepared: PreparedContact[]; stats: SourceSyncStats }> {
  const result = await resolveAdapterAndCredentials(params.accountKey, {
    requireCapability: 'contacts',
  });
  if (isResolveError(result)) {
    throw new Error(result.error);
  }

  const { adapter, credentials } = result;
  const contactsAdapter = adapter.contacts!;
  const rawContacts =
    adapter.provider === 'ghl'
      ? await fetchAllGhlContactsForRollup(
          credentials.token,
          credentials.locationId,
          params.maxSourceContactsPerAccount,
        )
      : (await contactsAdapter.fetchAllContacts(credentials.token, credentials.locationId))
          .slice(0, params.maxSourceContactsPerAccount);
  const normalized = rawContacts.map((raw) => contactsAdapter.normalizeContact(raw));

  let consideredContacts = 0;
  let skippedInvalid = 0;
  let localDuplicatesCollapsed = 0;
  const localMap = new Map<string, PreparedContact>();

  for (const contact of normalized) {
    if (!params.fullSync) {
      const addedAtMs = parseDateMs(contact.dateAdded);
      if (!addedAtMs || addedAtMs < params.incrementalCutoffMs) {
        continue;
      }
    }

    consideredContacts += 1;

    const normalizedEmail = normalizeEmailAddress(contact.email);
    const normalizedPhone = normalizePhoneNumber(contact.phone);

    const validEmail = normalizedEmail
      && (!params.scrubInvalidEmails || isLikelyDeliverableEmail(normalizedEmail))
      ? normalizedEmail
      : '';
    const validPhone = normalizedPhone
      && (!params.scrubInvalidPhones || isLikelyDialablePhone(normalizedPhone))
      ? normalizedPhone
      : '';

    if (!validEmail && !validPhone) {
      skippedInvalid += 1;
      continue;
    }

    const dedupeKey = validEmail ? `email:${validEmail}` : `phone:${validPhone}`;
    const existing = localMap.get(dedupeKey);
    if (existing) {
      localDuplicatesCollapsed += 1;
      if (!existing.firstName && contact.firstName) existing.firstName = contact.firstName;
      if (!existing.lastName && contact.lastName) existing.lastName = contact.lastName;
      if (!existing.fullName && contact.fullName) existing.fullName = contact.fullName;
      if (!existing.email && validEmail) existing.email = validEmail;
      if (!existing.phone && validPhone) existing.phone = validPhone;
      if (Array.isArray(contact.tags) && contact.tags.length > 0) {
        existing.tags = [...new Set([...existing.tags, ...contact.tags.map(String)])];
      }
      continue;
    }

    localMap.set(dedupeKey, {
      dedupeKey,
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      fullName: contact.fullName || '',
      email: validEmail,
      phone: validPhone,
      tags: Array.isArray(contact.tags) ? [...new Set(contact.tags.map(String))] : [],
      sourceAccountKeys: [params.accountKey],
    });
  }

  return {
    prepared: [...localMap.values()],
    stats: {
      provider: adapter.provider,
      fetchedContacts: normalized.length,
      consideredContacts,
      acceptedContacts: localMap.size,
      skippedInvalid,
      localDuplicatesCollapsed,
    },
  };
}

function mergePreparedContact(existing: PreparedContact, incoming: PreparedContact): void {
  if (!existing.firstName && incoming.firstName) existing.firstName = incoming.firstName;
  if (!existing.lastName && incoming.lastName) existing.lastName = incoming.lastName;
  if (!existing.fullName && incoming.fullName) existing.fullName = incoming.fullName;
  if (!existing.email && incoming.email) existing.email = incoming.email;
  if (!existing.phone && incoming.phone) existing.phone = incoming.phone;

  existing.tags = [...new Set([...existing.tags, ...incoming.tags])];
  existing.sourceAccountKeys = [...new Set([...existing.sourceAccountKeys, ...incoming.sourceAccountKeys])];
}

function stripEmpty<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null) continue;
    if (typeof entry === 'string' && !entry.trim()) continue;
    if (Array.isArray(entry) && entry.length === 0) continue;
    out[key] = entry;
  }
  return out as T;
}

function buildRollupTags(contact: PreparedContact): string[] {
  const tags = new Set<string>();
  tags.add('loomi-rollup');
  tags.add('loomi-yag-rollup');
  for (const sourceKey of contact.sourceAccountKeys) {
    tags.add(`rollup-src:${sourceKey}`);
  }
  for (const tag of contact.tags) {
    if (!tag) continue;
    tags.add(tag);
  }
  return [...tags].slice(0, 25);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRawContactId(raw: Record<string, unknown>): string {
  const candidates = [
    raw.id,
    raw._id,
    raw.contactId,
    raw.contact_id,
    raw.contactID,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function coerceTagList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>;
          const raw = record.name ?? record.tag ?? record.value ?? record.label;
          return typeof raw === 'string' ? raw.trim() : '';
        }
        return '';
      })
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        return coerceTagList(JSON.parse(trimmed));
      } catch {
        // Fall through to comma-split.
      }
    }
    return trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function readContactTags(raw: Record<string, unknown>): string[] {
  const tags = new Set<string>();
  const candidates = [
    raw.tags,
    raw.contactTags,
    raw.contact_tags,
    raw.tagNames,
    raw.tag_names,
    raw.tag,
  ];

  for (const candidate of candidates) {
    for (const tag of coerceTagList(candidate)) {
      tags.add(tag);
    }
  }

  return [...tags];
}

function isRollupTaggedContact(raw: Record<string, unknown>): boolean {
  const tags = readContactTags(raw).map((tag) => tag.toLowerCase());
  return tags.some((tag) =>
    tag === 'loomi-rollup'
    || tag === 'loomi-yag-rollup'
    || tag.startsWith(ROLLUP_TAG_PREFIX),
  );
}

async function upsertGhlContact(params: {
  token: string;
  locationId: string;
  contact: PreparedContact;
}): Promise<void> {
  const baseContact = stripEmpty({
    locationId: params.locationId,
    firstName: params.contact.firstName,
    lastName: params.contact.lastName,
    name: params.contact.fullName,
    email: params.contact.email,
    phone: params.contact.phone,
    tags: buildRollupTags(params.contact),
    source: 'Loomi YAG Rollup',
  });
  const wrappedContact = stripEmpty({
    locationId: params.locationId,
    contact: stripEmpty({
      firstName: params.contact.firstName,
      lastName: params.contact.lastName,
      name: params.contact.fullName,
      email: params.contact.email,
      phone: params.contact.phone,
      tags: buildRollupTags(params.contact),
      source: 'Loomi YAG Rollup',
    }),
  });
  const bodies = [baseContact, wrappedContact];

  let lastError = 'Failed to upsert contact';
  for (const body of bodies) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await fetch(`${GHL_BASE}/contacts/upsert`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.token}`,
          Version: API_VERSION,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (res.ok) return;

      const text = await res.text().catch(() => '');
      lastError = text || `GHL upsert failed (${res.status})`;
      const isRetryable = res.status === 429 || res.status >= 500;
      if (!isRetryable || attempt === 2) break;
      await sleep(300 * (attempt + 1));
    }
  }

  throw new Error(lastError);
}

async function deleteGhlContact(params: {
  token: string;
  locationId: string;
  contactId: string;
}): Promise<void> {
  const encodedId = encodeURIComponent(params.contactId);
  const encodedLocation = encodeURIComponent(params.locationId);
  const endpoints = [
    `${GHL_BASE}/contacts/${encodedId}?locationId=${encodedLocation}`,
    `${GHL_BASE}/contacts/${encodedId}`,
    `${GHL_BASE}/contacts/${encodedId}/?locationId=${encodedLocation}`,
  ];

  let lastError = `Failed to delete contact ${params.contactId}`;
  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${params.token}`,
          Version: API_VERSION,
          Accept: 'application/json',
        },
      });

      if (res.ok || res.status === 404) return;

      const text = await res.text().catch(() => '');
      lastError = text || `GHL delete failed (${res.status})`;
      const isRetryable = res.status === 429 || res.status >= 500;
      if (!isRetryable || attempt === 2) break;
      await sleep(300 * (attempt + 1));
    }
  }

  throw new Error(lastError);
}

async function persistSyncMetadata(
  config: YagRollupConfigPayload,
  status: 'ok' | 'disabled' | 'failed',
  summary: Record<string, unknown>,
): Promise<void> {
  await prisma.yagRollupConfig.upsert({
    where: { singletonKey: YAG_ROLLUP_SINGLETON_KEY },
    create: {
      singletonKey: YAG_ROLLUP_SINGLETON_KEY,
      targetAccountKey: config.targetAccountKey,
      sourceAccountKeys: JSON.stringify(config.sourceAccountKeys),
      enabled: config.enabled,
      scrubInvalidEmails: config.scrubInvalidEmails,
      scrubInvalidPhones: config.scrubInvalidPhones,
      updatedByUserId: config.updatedByUserId || null,
      lastSyncedAt: new Date(),
      lastSyncStatus: status,
      lastSyncSummary: JSON.stringify(summary),
    },
    update: {
      targetAccountKey: config.targetAccountKey,
      sourceAccountKeys: JSON.stringify(config.sourceAccountKeys),
      enabled: config.enabled,
      scrubInvalidEmails: config.scrubInvalidEmails,
      scrubInvalidPhones: config.scrubInvalidPhones,
      updatedByUserId: config.updatedByUserId || null,
      lastSyncedAt: new Date(),
      lastSyncStatus: status,
      lastSyncSummary: JSON.stringify(summary),
    },
  });
}

export async function runYagRollupWipe(
  options: RunYagRollupWipeOptions = {},
): Promise<RunYagRollupWipeResult> {
  const startedAt = new Date();
  const dryRun = Boolean(options.dryRun);
  const mode: YagRollupWipeMode = options.mode === 'all' ? 'all' : 'tagged';
  const deleteConcurrency = envInt(
    'YAG_ROLLUP_TARGET_DELETE_CONCURRENCY',
    DEFAULT_TARGET_DELETE_CONCURRENCY,
    1,
    10,
  );
  const defaultMaxDeletes = envInt(
    'YAG_ROLLUP_MAX_DELETES_PER_RUN',
    DEFAULT_MAX_DELETES_PER_RUN,
    100,
    500_000,
  );
  const maxDeletes = Number.isFinite(options.maxDeletes)
    ? Math.max(100, Math.min(500_000, Math.floor(Number(options.maxDeletes))))
    : defaultMaxDeletes;
  const maxTargetContactsForWipe = envInt(
    'YAG_ROLLUP_MAX_TARGET_CONTACTS_FOR_WIPE',
    DEFAULT_MAX_TARGET_CONTACTS_FOR_WIPE,
    100,
    500_000,
  );
  const fetchLimit = Math.max(maxDeletes, maxTargetContactsForWipe);

  const snapshot = await getYagRollupConfigSnapshot();
  const targetAccountKey = snapshot.config.targetAccountKey;
  const errors: Record<string, string> = {};

  if (!targetAccountKey) {
    return {
      status: 'failed',
      dryRun,
      mode,
      targetAccountKey: '',
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      totals: {
        fetchedContacts: 0,
        eligibleContacts: 0,
        queuedForDelete: 0,
        truncatedByMaxDeletes: 0,
        deletesAttempted: 0,
        deletesSucceeded: 0,
        deletesFailed: 0,
      },
      errors: {
        config: 'No YAG rollup target account is configured',
      },
    };
  }

  const target = await resolveAdapterAndCredentials(targetAccountKey, {
    requireCapability: 'contacts',
  });
  if (isResolveError(target)) {
    return {
      status: 'failed',
      dryRun,
      mode,
      targetAccountKey,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      totals: {
        fetchedContacts: 0,
        eligibleContacts: 0,
        queuedForDelete: 0,
        truncatedByMaxDeletes: 0,
        deletesAttempted: 0,
        deletesSucceeded: 0,
        deletesFailed: 0,
      },
      errors: {
        target: target.error,
      },
    };
  }

  if (target.adapter.provider !== 'ghl') {
    return {
      status: 'failed',
      dryRun,
      mode,
      targetAccountKey,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      totals: {
        fetchedContacts: 0,
        eligibleContacts: 0,
        queuedForDelete: 0,
        truncatedByMaxDeletes: 0,
        deletesAttempted: 0,
        deletesSucceeded: 0,
        deletesFailed: 0,
      },
      errors: {
        target: `Target provider "${target.adapter.provider}" is not supported for wipe`,
      },
    };
  }

  const rawContacts = await fetchAllGhlContactsForRollup(
    target.credentials.token,
    target.credentials.locationId,
    fetchLimit,
  );
  const eligibleIds: string[] = [];
  const seenIds = new Set<string>();
  for (const raw of rawContacts) {
    const contactId = extractRawContactId(raw);
    if (!contactId || seenIds.has(contactId)) continue;
    if (mode === 'tagged' && !isRollupTaggedContact(raw)) continue;
    seenIds.add(contactId);
    eligibleIds.push(contactId);
  }

  const queuedForDelete = Math.min(eligibleIds.length, maxDeletes);
  const truncatedByMaxDeletes = Math.max(0, eligibleIds.length - maxDeletes);
  const toDelete = eligibleIds.slice(0, maxDeletes);

  let deletesAttempted = 0;
  let deletesSucceeded = 0;
  let deletesFailed = 0;
  let status: 'ok' | 'failed' = 'ok';

  if (!dryRun && toDelete.length > 0) {
    const deleteTasks = toDelete.map((contactId) => async () => {
      deletesAttempted += 1;
      await deleteGhlContact({
        token: target.credentials.token,
        locationId: target.credentials.locationId,
        contactId,
      });
    });
    const settled = await withConcurrencyLimit(deleteTasks, deleteConcurrency);
    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index];
      if (result.status === 'fulfilled') {
        deletesSucceeded += 1;
      } else {
        deletesFailed += 1;
        status = 'failed';
        if (deletesFailed <= 25) {
          errors[`delete:${toDelete[index]}`] = result.reason instanceof Error
            ? result.reason.message
            : 'Failed to delete contact';
        }
      }
    }
  }

  return {
    status,
    dryRun,
    mode,
    targetAccountKey,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    totals: {
      fetchedContacts: rawContacts.length,
      eligibleContacts: eligibleIds.length,
      queuedForDelete,
      truncatedByMaxDeletes,
      deletesAttempted,
      deletesSucceeded,
      deletesFailed,
    },
    errors,
  };
}

export async function runYagRollupSync(
  options: RunYagRollupSyncOptions = {},
): Promise<RunYagRollupSyncResult> {
  const startedAt = new Date();
  const dryRun = Boolean(options.dryRun);
  const fullSync = Boolean(options.fullSync);
  const sourceConcurrency = envInt(
    'YAG_ROLLUP_SOURCE_ACCOUNT_CONCURRENCY',
    DEFAULT_SOURCE_ACCOUNT_CONCURRENCY,
    1,
    10,
  );
  const targetConcurrency = envInt(
    'YAG_ROLLUP_TARGET_UPSERT_CONCURRENCY',
    DEFAULT_TARGET_UPSERT_CONCURRENCY,
    1,
    10,
  );
  const maxSourceContactsPerAccount = envInt(
    'YAG_ROLLUP_MAX_SOURCE_CONTACTS_PER_ACCOUNT',
    DEFAULT_MAX_SOURCE_CONTACTS_PER_ACCOUNT,
    100,
    250_000,
  );
  const defaultMaxUpserts = envInt(
    'YAG_ROLLUP_MAX_UPSERTS_PER_RUN',
    DEFAULT_MAX_UPSERTS_PER_RUN,
    100,
    250_000,
  );
  const maxUpserts = Number.isFinite(options.maxUpserts)
    ? Math.max(100, Math.min(250_000, Math.floor(Number(options.maxUpserts))))
    : defaultMaxUpserts;
  const incrementalLookbackHours = envInt(
    'YAG_ROLLUP_INCREMENTAL_LOOKBACK_HOURS',
    DEFAULT_INCREMENTAL_LOOKBACK_HOURS,
    1,
    24 * 14,
  );
  const incrementalCutoffMs = Date.now() - incrementalLookbackHours * 60 * 60 * 1000;

  const snapshot = await getYagRollupConfigSnapshot();
  const config = snapshot.config;
  const errors: Record<string, string> = {};
  const perSource: Record<string, SourceSyncStats> = {};

  const sourceKeys = uniqueKeys(config.sourceAccountKeys)
    .filter((key) => key !== config.targetAccountKey);
  const limitedSourceKeys = Number.isFinite(options.sourceAccountLimit)
    ? sourceKeys.slice(0, Math.max(1, Math.floor(Number(options.sourceAccountLimit))))
    : sourceKeys;

  const emptyResultBase = {
    dryRun,
    fullSync,
    targetAccountKey: config.targetAccountKey,
    sourceAccountKeys: limitedSourceKeys,
    startedAt: startedAt.toISOString(),
  };

  if (!config.enabled) {
    const finishedAt = new Date();
    const result: RunYagRollupSyncResult = {
      status: 'disabled',
      ...emptyResultBase,
      finishedAt: finishedAt.toISOString(),
      totals: {
        sourceAccountsRequested: limitedSourceKeys.length,
        sourceAccountsProcessed: 0,
        fetchedContacts: 0,
        consideredContacts: 0,
        acceptedContacts: 0,
        skippedInvalid: 0,
        localDuplicatesCollapsed: 0,
        globalDuplicatesCollapsed: 0,
        queuedForTarget: 0,
        truncatedByMaxUpserts: 0,
        upsertsAttempted: 0,
        upsertsSucceeded: 0,
        upsertsFailed: 0,
      },
      perSource,
      errors,
    };
    await persistSyncMetadata(config, 'disabled', {
      reason: 'config disabled',
      sourceAccountsRequested: limitedSourceKeys.length,
      dryRun,
      fullSync,
    });
    return result;
  }

  if (!config.targetAccountKey) {
    const finishedAt = new Date();
    const result: RunYagRollupSyncResult = {
      status: 'failed',
      ...emptyResultBase,
      finishedAt: finishedAt.toISOString(),
      totals: {
        sourceAccountsRequested: limitedSourceKeys.length,
        sourceAccountsProcessed: 0,
        fetchedContacts: 0,
        consideredContacts: 0,
        acceptedContacts: 0,
        skippedInvalid: 0,
        localDuplicatesCollapsed: 0,
        globalDuplicatesCollapsed: 0,
        queuedForTarget: 0,
        truncatedByMaxUpserts: 0,
        upsertsAttempted: 0,
        upsertsSucceeded: 0,
        upsertsFailed: 0,
      },
      perSource,
      errors: { config: 'No YAG rollup target account is configured' },
    };
    await persistSyncMetadata(config, 'failed', {
      reason: 'missing target account',
      sourceAccountsRequested: limitedSourceKeys.length,
      dryRun,
      fullSync,
    });
    return result;
  }

  const globalMap = new Map<string, PreparedContact>();
  let fetchedContacts = 0;
  let consideredContacts = 0;
  let acceptedContacts = 0;
  let skippedInvalid = 0;
  let localDuplicatesCollapsed = 0;
  let globalDuplicatesCollapsed = 0;

  const sourceTasks = limitedSourceKeys.map((accountKey) => async () => {
    const prepared = await fetchSourcePreparedContacts({
      accountKey,
      scrubInvalidEmails: config.scrubInvalidEmails,
      scrubInvalidPhones: config.scrubInvalidPhones,
      fullSync,
      incrementalCutoffMs,
      maxSourceContactsPerAccount,
    });
    return {
      accountKey,
      ...prepared,
    };
  });

  const sourceSettled = await withConcurrencyLimit(sourceTasks, sourceConcurrency);
  for (let index = 0; index < sourceSettled.length; index += 1) {
    const sourceKey = limitedSourceKeys[index];
    const result = sourceSettled[index];
    if (result.status === 'rejected') {
      errors[sourceKey] = result.reason instanceof Error
        ? result.reason.message
        : 'Failed to fetch source contacts';
      continue;
    }

    perSource[sourceKey] = result.value.stats;
    fetchedContacts += result.value.stats.fetchedContacts;
    consideredContacts += result.value.stats.consideredContacts;
    acceptedContacts += result.value.stats.acceptedContacts;
    skippedInvalid += result.value.stats.skippedInvalid;
    localDuplicatesCollapsed += result.value.stats.localDuplicatesCollapsed;

    for (const contact of result.value.prepared) {
      const existing = globalMap.get(contact.dedupeKey);
      if (existing) {
        globalDuplicatesCollapsed += 1;
        mergePreparedContact(existing, contact);
        continue;
      }
      globalMap.set(contact.dedupeKey, contact);
    }
  }

  const dedupedContacts = [...globalMap.values()];
  const queuedForTarget = Math.min(dedupedContacts.length, maxUpserts);
  const truncatedByMaxUpserts = Math.max(0, dedupedContacts.length - maxUpserts);
  const toUpsert = dedupedContacts.slice(0, maxUpserts);

  let upsertsAttempted = 0;
  let upsertsSucceeded = 0;
  let upsertsFailed = 0;
  let status: 'ok' | 'failed' = 'ok';

  if (!dryRun && toUpsert.length > 0) {
    const target = await resolveAdapterAndCredentials(config.targetAccountKey, {
      requireCapability: 'contacts',
    });
    if (isResolveError(target)) {
      status = 'failed';
      errors.target = target.error;
    } else if (target.adapter.provider !== 'ghl') {
      status = 'failed';
      errors.target = `Target provider "${target.adapter.provider}" is not supported for rollup writes yet`;
    } else {
      const upsertTasks = toUpsert.map((contact) => async () => {
        upsertsAttempted += 1;
        await upsertGhlContact({
          token: target.credentials.token,
          locationId: target.credentials.locationId,
          contact,
        });
      });

      const upsertSettled = await withConcurrencyLimit(upsertTasks, targetConcurrency);
      for (let index = 0; index < upsertSettled.length; index += 1) {
        const result = upsertSettled[index];
        if (result.status === 'fulfilled') {
          upsertsSucceeded += 1;
        } else {
          upsertsFailed += 1;
          status = 'failed';
          if (upsertsFailed <= 25) {
            const err = result.reason instanceof Error
              ? result.reason.message
              : 'Failed to upsert contact';
            errors[`upsert:${index}`] = err;
          }
        }
      }
    }
  }

  const finishedAt = new Date();
  const output: RunYagRollupSyncResult = {
    status,
    ...emptyResultBase,
    finishedAt: finishedAt.toISOString(),
    totals: {
      sourceAccountsRequested: limitedSourceKeys.length,
      sourceAccountsProcessed: Object.keys(perSource).length,
      fetchedContacts,
      consideredContacts,
      acceptedContacts,
      skippedInvalid,
      localDuplicatesCollapsed,
      globalDuplicatesCollapsed,
      queuedForTarget,
      truncatedByMaxUpserts,
      upsertsAttempted,
      upsertsSucceeded,
      upsertsFailed,
    },
    perSource,
    errors,
  };

  await persistSyncMetadata(config, status, {
    dryRun,
    fullSync,
    totals: output.totals,
    sourceAccounts: limitedSourceKeys,
    errors,
  });

  return output;
}
