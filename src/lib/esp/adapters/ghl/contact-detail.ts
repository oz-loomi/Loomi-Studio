import {
  normalizeContact,
  resolveGhlCredentials,
} from './contacts';
import { API_VERSION, GHL_BASE } from './constants';
import * as accountService from '@/lib/services/accounts';

type DndChannelKey =
  | 'SMS'
  | 'Email'
  | 'Call'
  | 'Voicemail'
  | 'WhatsApp'
  | 'FB'
  | 'GMB';

interface DndChannelState {
  enabled: boolean;
  status: string;
  message: string;
  code: string;
}

export type NormalizedDndSettings = Record<DndChannelKey, DndChannelState>;

const DND_CHANNEL_KEYS: DndChannelKey[] = [
  'SMS',
  'Email',
  'Call',
  'Voicemail',
  'WhatsApp',
  'FB',
  'GMB',
];

export class GhlContactError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'GhlContactError';
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (!lower) return false;
    if (['true', 'yes', 'y', '1', 'active', 'enabled', 'on', 'blocked'].includes(lower)) {
      return true;
    }
    if (['false', 'no', 'n', '0', 'inactive', 'disabled', 'off', 'unblocked'].includes(lower)) {
      return false;
    }
  }
  return false;
}

function emptyDndSettings(): NormalizedDndSettings {
  return {
    SMS: { enabled: false, status: 'inactive', message: '', code: '' },
    Email: { enabled: false, status: 'inactive', message: '', code: '' },
    Call: { enabled: false, status: 'inactive', message: '', code: '' },
    Voicemail: { enabled: false, status: 'inactive', message: '', code: '' },
    WhatsApp: { enabled: false, status: 'inactive', message: '', code: '' },
    FB: { enabled: false, status: 'inactive', message: '', code: '' },
    GMB: { enabled: false, status: 'inactive', message: '', code: '' },
  };
}

function normalizeChannelKey(rawKey: string): DndChannelKey | null {
  const normalized = rawKey.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!normalized) return null;
  if (normalized === 'sms' || normalized === 'text') return 'SMS';
  if (normalized === 'email') return 'Email';
  if (normalized === 'call' || normalized === 'phone') return 'Call';
  if (normalized === 'voicemail' || normalized === 'vm') return 'Voicemail';
  if (normalized === 'whatsapp' || normalized === 'wa') return 'WhatsApp';
  if (normalized === 'fb' || normalized === 'facebook' || normalized === 'messenger') return 'FB';
  if (normalized === 'gmb' || normalized === 'gbp' || normalized === 'googlemybusiness' || normalized === 'googlebusiness') return 'GMB';
  return null;
}

function parseChannelState(value: unknown): DndChannelState {
  const row = asRecord(value);
  if (row) {
    const statusRaw = String(row.status ?? row.state ?? row.value ?? '').trim();
    const message = String(row.message ?? row.reason ?? '').trim();
    const code = String(row.code ?? row.reasonCode ?? '').trim();
    const enabled = statusRaw
      ? toBoolean(statusRaw)
      : toBoolean(row.enabled ?? row.dnd ?? row.isDnd ?? row.blocked ?? row.active ?? row.value);
    return {
      enabled,
      status: statusRaw || (enabled ? 'active' : 'inactive'),
      message,
      code,
    };
  }

  const enabled = toBoolean(value);
  const status =
    typeof value === 'string' && value.trim()
      ? value.trim()
      : enabled
        ? 'active'
        : 'inactive';
  return { enabled, status, message: '', code: '' };
}

export function normalizeDndSettings(raw: Record<string, unknown>): {
  dnd: boolean;
  dndSettings: NormalizedDndSettings;
} {
  const settings = emptyDndSettings();
  const globalDnd = toBoolean(raw.dnd ?? raw.doNotDisturb ?? raw.do_not_disturb);
  const dndRaw = raw.dndSettings ?? raw.dnd_settings;

  if (Array.isArray(dndRaw)) {
    for (const item of dndRaw) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const keyRaw = String(row.channel ?? row.type ?? row.name ?? row.key ?? '').trim();
      const channelKey = normalizeChannelKey(keyRaw);
      if (!channelKey) continue;
      settings[channelKey] = parseChannelState(row);
    }
  } else if (dndRaw && typeof dndRaw === 'object') {
    const row = dndRaw as Record<string, unknown>;
    for (const [key, value] of Object.entries(row)) {
      const channelKey = normalizeChannelKey(key);
      if (!channelKey) continue;
      settings[channelKey] = parseChannelState(value);
    }
  }

  const hasEnabledChannel = DND_CHANNEL_KEYS.some((key) => settings[key].enabled);
  return { dnd: globalDnd || hasEnabledChannel, dndSettings: settings };
}

function normalizeRequestedDndSettings(value: unknown): NormalizedDndSettings | null {
  const row = asRecord(value);
  if (!row) return null;

  const settings = emptyDndSettings();
  let hasAny = false;
  for (const [key, rawVal] of Object.entries(row)) {
    const channelKey = normalizeChannelKey(key);
    if (!channelKey) continue;
    const enabled = toBoolean(rawVal);
    settings[channelKey] = {
      enabled,
      status: enabled ? 'active' : 'inactive',
      message: '',
      code: '',
    };
    hasAny = true;
  }

  return hasAny ? settings : null;
}

function toDndUpdatePayload(settings: NormalizedDndSettings): {
  dnd: boolean;
  dndSettings: Record<string, { status: string }>;
} {
  const dndSettings: Record<string, { status: string }> = {};
  for (const key of DND_CHANNEL_KEYS) {
    dndSettings[key] = { status: settings[key].enabled ? 'active' : 'inactive' };
  }
  const dnd = DND_CHANNEL_KEYS.some((key) => settings[key].enabled);
  return { dnd, dndSettings };
}

type AccountSummary = {
  key: string;
  dealer: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  logos: Record<string, unknown> | null;
} | null;

type ContactPayload = ReturnType<typeof normalizeContact> & {
  _accountKey: string;
  dnd: boolean;
  dndSettings: NormalizedDndSettings;
};

function resolveAccountKey(accountKeyRaw?: string): string {
  const accountKey = (accountKeyRaw || '').trim();
  if (!accountKey) {
    throw new GhlContactError('accountKey is required', 400);
  }
  return accountKey;
}

export async function fetchGhlContactDetail(params: {
  accountKey: string;
  contactId: string;
}): Promise<{ contact: ContactPayload; account: AccountSummary }> {
  const { contactId } = params;
  const accountKey = resolveAccountKey(params.accountKey);
  const credentials = await resolveGhlCredentials(accountKey);
  if (!credentials) {
    throw new GhlContactError('Account does not have a GHL connection', 400);
  }

  const account = await accountService.getAccount(accountKey);
  const accountSummary: AccountSummary = account
    ? {
      key: account.key,
      dealer: account.dealer,
      address: account.address || '',
      city: account.city || '',
      state: account.state || '',
      postalCode: account.postalCode || '',
      logos: parseJsonObject(account.logos || null),
    }
    : null;

  const headers = {
    Authorization: `Bearer ${credentials.token}`,
    Version: API_VERSION,
    Accept: 'application/json',
  };

  const endpoints = [
    `${GHL_BASE}/contacts/${encodeURIComponent(contactId)}?locationId=${encodeURIComponent(credentials.locationId)}`,
    `${GHL_BASE}/contacts/${encodeURIComponent(contactId)}`,
    `${GHL_BASE}/contacts/${encodeURIComponent(contactId)}/?locationId=${encodeURIComponent(credentials.locationId)}`,
  ];

  let lastErrorStatus = 500;
  let lastErrorMessage = 'Failed to fetch contact';

  for (const endpoint of endpoints) {
    const res = await fetch(endpoint, { method: 'GET', headers });
    if (!res.ok) {
      lastErrorStatus = res.status;
      lastErrorMessage = `GHL API error (${res.status})`;
      continue;
    }

    const data = await res.json();
    const raw = asRecord(data?.contact) || asRecord(data?.data) || asRecord(data);
    if (!raw) continue;

    const dndState = normalizeDndSettings(raw);
    return {
      contact: {
        ...normalizeContact(raw),
        _accountKey: accountKey,
        dnd: dndState.dnd,
        dndSettings: dndState.dndSettings,
      },
      account: accountSummary,
    };
  }

  const status =
    lastErrorStatus === 404
      ? 404
      : lastErrorStatus === 401
        ? 401
        : 500;
  const message = status === 404 ? 'Contact not found' : lastErrorMessage;
  throw new GhlContactError(message, status);
}

export async function updateGhlContactDnd(params: {
  accountKey: string;
  contactId: string;
  body: unknown;
}): Promise<{
  contact: {
    id: string;
    _accountKey: string;
    dnd: boolean;
    dndSettings: NormalizedDndSettings;
  };
}> {
  const { contactId, body } = params;
  const accountKey = resolveAccountKey(params.accountKey);
  const bodyRow = asRecord(body) || {};
  const requestedSettings = normalizeRequestedDndSettings(bodyRow.dndSettings);
  if (!requestedSettings) {
    throw new GhlContactError('dndSettings object is required', 400);
  }

  const credentials = await resolveGhlCredentials(accountKey);
  if (!credentials) {
    throw new GhlContactError('Account does not have a GHL connection', 400);
  }

  const payload = toDndUpdatePayload(requestedSettings);
  const headers = {
    Authorization: `Bearer ${credentials.token}`,
    Version: API_VERSION,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const updateAttempts: Array<{
    url: string;
    method: 'PUT' | 'POST';
    body: Record<string, unknown>;
  }> = [
    {
      url: `${GHL_BASE}/contacts/${encodeURIComponent(contactId)}?locationId=${encodeURIComponent(credentials.locationId)}`,
      method: 'PUT',
      body: payload,
    },
    {
      url: `${GHL_BASE}/contacts/${encodeURIComponent(contactId)}`,
      method: 'PUT',
      body: { locationId: credentials.locationId, ...payload },
    },
    {
      url: `${GHL_BASE}/contacts/upsert`,
      method: 'POST',
      body: { locationId: credentials.locationId, id: contactId, ...payload },
    },
    {
      url: `${GHL_BASE}/contacts/upsert`,
      method: 'POST',
      body: {
        locationId: credentials.locationId,
        contact: {
          id: contactId,
          ...payload,
        },
      },
    },
  ];

  let lastErrorStatus = 500;
  let lastErrorText = 'Failed to update DND settings';

  for (const attempt of updateAttempts) {
    const res = await fetch(attempt.url, {
      method: attempt.method,
      headers,
      body: JSON.stringify(attempt.body),
    });

    const text = await res.text();
    if (!res.ok) {
      lastErrorStatus = res.status;
      lastErrorText = text || `GHL API error (${res.status})`;
      continue;
    }

    let responseJson: Record<string, unknown> | null = null;
    try {
      responseJson = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      responseJson = null;
    }

    const raw = asRecord(responseJson?.contact) || asRecord(responseJson?.data) || asRecord(responseJson);
    if (raw) {
      const dndState = normalizeDndSettings(raw);
      return {
        contact: {
          id: contactId,
          _accountKey: accountKey,
          dnd: dndState.dnd,
          dndSettings: dndState.dndSettings,
        },
      };
    }

    return {
      contact: {
        id: contactId,
        _accountKey: accountKey,
        dnd: payload.dnd,
        dndSettings: requestedSettings,
      },
    };
  }

  const status =
    lastErrorStatus === 401
      ? 401
      : lastErrorStatus === 403
        ? 403
        : 500;
  const message =
    status === 403
      ? 'DND update forbidden by provider. Some DND states may require opt-in from the contact.'
      : `Failed to update DND settings: ${lastErrorText}`;
  throw new GhlContactError(message, status);
}
