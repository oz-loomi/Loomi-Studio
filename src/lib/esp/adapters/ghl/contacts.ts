import { getValidToken, getConnection } from './oauth';
import crypto from 'crypto';

import { GHL_BASE, API_VERSION } from './constants';

// ── Credential Resolution ──

/**
 * Resolve the GHL token and locationId for an account.
 * OAuth-only credential resolution.
 */
export async function resolveGhlCredentials(accountKey: string): Promise<{
  token: string;
  locationId: string;
} | null> {
  try {
    const oauthToken = await getValidToken(accountKey);
    if (oauthToken) {
      const connection = await getConnection(accountKey);
      if (connection?.locationId) {
        return { token: oauthToken, locationId: connection.locationId };
      }
    }
  } catch (err) {
    console.warn(`Failed to resolve OAuth credentials for "${accountKey}"`, err);
  }

  return null;
}

// ── Contact Count Cache ──

const contactCountCache = new Map<string, { total: number; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getCachedContactCount(accountKey: string): number | null {
  const cached = contactCountCache.get(accountKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.total;
  }
  return null;
}

export function setCachedContactCount(accountKey: string, total: number): void {
  contactCountCache.set(accountKey, { total, fetchedAt: Date.now() });
}

// ── Fetch Contact Count ──

/**
 * Fetch the total contact count for a GHL location.
 * Uses limit=1 to minimize data transfer — only needs meta.total.
 */
export async function fetchContactCount(
  token: string,
  locationId: string,
): Promise<number> {
  const query = new URLSearchParams({ locationId, limit: '1' });

  const endpoints = [
    `${GHL_BASE}/contacts/?${query.toString()}`,
    `${GHL_BASE}/contacts/search?${query.toString()}`,
  ];

  let lastError = 'Failed to fetch contact count';
  for (const endpoint of endpoints) {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Version: API_VERSION,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      lastError = `GHL API error (${res.status})`;
      continue;
    }

    const data = await res.json();
    const total =
      data?.meta?.total ??
      data?.total ??
      data?.data?.meta?.total ??
      0;

    return typeof total === 'number' ? total : 0;
  }

  throw new Error(lastError);
}

// ── Fetch All Contacts (paginated) ──

const MAX_CONTACTS = 500;
const PAGE_SIZE = 100;

/**
 * Fetch all contacts (up to MAX_CONTACTS) for analytics aggregation.
 * Returns raw contact objects from GHL.
 */
export async function fetchAllContacts(
  token: string,
  locationId: string,
): Promise<Record<string, unknown>[]> {
  const allContacts: Record<string, unknown>[] = [];
  let hasMore = true;
  let startAfter: string | undefined;
  let page = 0;

  while (hasMore && allContacts.length < MAX_CONTACTS) {
    const query = new URLSearchParams({
      locationId,
      limit: String(PAGE_SIZE),
    });
    if (startAfter) query.set('startAfter', startAfter);
    if (page > 0) query.set('startAfterId', startAfter || '');

    const res = await fetch(`${GHL_BASE}/contacts/?${query.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Version: API_VERSION,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      // If first page fails, try alternate endpoint
      if (page === 0) {
        return fetchAllContactsFallback(token, locationId);
      }
      break;
    }

    const data = await res.json();
    const contactsRaw =
      (Array.isArray(data?.contacts) && data.contacts) ||
      (Array.isArray(data?.data?.contacts) && data.data.contacts) ||
      (Array.isArray(data?.data) && data.data) ||
      [];

    allContacts.push(...contactsRaw);

    // GHL pagination: use startAfterId from meta or last contact id
    const nextPageUrl = data?.meta?.nextPageUrl || data?.meta?.nextPage;
    const startAfterId = data?.meta?.startAfterId;

    if (startAfterId) {
      startAfter = startAfterId;
    } else if (contactsRaw.length > 0) {
      const lastContact = contactsRaw[contactsRaw.length - 1];
      startAfter = lastContact?.id || lastContact?._id;
    }

    hasMore = contactsRaw.length >= PAGE_SIZE && !!startAfter && !!(nextPageUrl || startAfterId);
    page++;
  }

  return allContacts;
}

async function fetchAllContactsFallback(
  token: string,
  locationId: string,
): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({
    locationId,
    limit: String(PAGE_SIZE),
  });

  const res = await fetch(`${GHL_BASE}/contacts/search?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Version: API_VERSION,
      Accept: 'application/json',
    },
  });

  if (!res.ok) return [];

  const data = await res.json();
  return (
    (Array.isArray(data?.contacts) && data.contacts) ||
    (Array.isArray(data?.data?.contacts) && data.data.contacts) ||
    (Array.isArray(data?.data) && data.data) ||
    []
  );
}

// ── Contact Normalization ──

export interface SimplifiedContact {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  tags: string[];
  dateAdded: string;
  source: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleVin: string;
  vehicleMileage: string;
  lastServiceDate: string;
  nextServiceDate: string;
  leaseEndDate: string;
  warrantyEndDate: string;
  purchaseDate: string;
  hasReceivedMessage: boolean;
  hasReceivedEmail: boolean;
  hasReceivedSms: boolean;
  lastMessageDate: string;
}

function firstTruthy(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return '';
}

function firstDefined(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      return raw[key];
    }
  }
  return undefined;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (!lower) return false;
    if (['true', 'yes', 'y', '1'].includes(lower)) return true;
    if (['false', 'no', 'n', '0'].includes(lower)) return false;
  }
  return false;
}

function stringifyFieldValue(value: unknown): string {
  if (value === undefined || value === null) return '';

  if (Array.isArray(value)) {
    const joined = value
      .map((entry) => stringifyFieldValue(entry))
      .filter(Boolean)
      .join(', ');
    return joined.trim();
  }

  if (typeof value === 'object') {
    const nested = firstTruthy(value as Record<string, unknown>, [
      'value',
      'fieldValue',
      'field_value',
      'label',
      'name',
      'id',
    ]);
    return nested.trim();
  }

  return String(value).trim();
}

function customFieldKeyAliases(rawKey: string): string[] {
  const normalized = rawKey.trim().toLowerCase();
  if (!normalized) return [];

  const aliases = new Set<string>();
  const queue = [normalized];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!current || aliases.has(current)) continue;
    aliases.add(current);

    const unwrapped = current
      .replace(/^\{\{\s*/g, '')
      .replace(/\s*\}\}$/g, '')
      .trim();
    if (unwrapped && unwrapped !== current) queue.push(unwrapped);

    if (current.startsWith('contact.')) queue.push(current.slice('contact.'.length));
    if (current.startsWith('contact_')) queue.push(current.slice('contact_'.length));

    queue.push(current.replace(/[.\-\s]+/g, '_'));
    queue.push(current.replace(/[.\-\s]+/g, ''));
  }

  return [...aliases];
}

function mapCustomFieldValue(
  map: Map<string, string>,
  key: string,
  value: string,
): void {
  if (!value) return;
  for (const alias of customFieldKeyAliases(key)) {
    map.set(alias, value);
  }
}

const KNOWN_VEHICLE_MAKES = new Set([
  'acura',
  'alfa romeo',
  'aston martin',
  'audi',
  'bentley',
  'bmw',
  'buick',
  'cadillac',
  'chevrolet',
  'chrysler',
  'dodge',
  'ferrari',
  'fiat',
  'ford',
  'genesis',
  'gmc',
  'honda',
  'hyundai',
  'infiniti',
  'jaguar',
  'jeep',
  'kia',
  'lamborghini',
  'land rover',
  'lexus',
  'lincoln',
  'lotus',
  'maserati',
  'mazda',
  'mclaren',
  'mercedes',
  'mercedes-benz',
  'mini',
  'mitsubishi',
  'nissan',
  'polestar',
  'porsche',
  'ram',
  'rivian',
  'rolls-royce',
  'rolls royce',
  'subaru',
  'tesla',
  'toyota',
  'volkswagen',
  'vw',
  'volvo',
]);

function looksLikeVehicleYear(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  const current = new Date().getFullYear() + 1;
  return year >= 1980 && year <= current;
}

function looksLikeIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(?:[tT].*)?$/.test(value);
}

function looksLikeEpochMilliseconds(value: string): boolean {
  return /^\d{11,13}$/.test(value);
}

function looksLikeVehicleMake(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (KNOWN_VEHICLE_MAKES.has(normalized)) return true;
  // Normalize punctuation/spacing to catch "Mercedes Benz", "Land-Rover", etc.
  const squashed = normalized.replace(/[\s\-_.]+/g, ' ');
  return KNOWN_VEHICLE_MAKES.has(squashed);
}

function inferVehicleFromCustomFieldValues(values: string[]): {
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
} {
  const unique = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  if (!unique.length) {
    return { vehicleYear: '', vehicleMake: '', vehicleModel: '' };
  }

  const vehicleYear = unique.find(looksLikeVehicleYear) ?? '';
  const vehicleMake = unique.find(looksLikeVehicleMake) ?? '';
  const vehicleModel =
    unique.find((value) => {
      if (!value) return false;
      if (value === vehicleYear || value === vehicleMake) return false;
      if (looksLikeVehicleYear(value)) return false;
      if (looksLikeVehicleMake(value)) return false;
      if (looksLikeIsoDate(value)) return false;
      if (looksLikeEpochMilliseconds(value)) return false;
      if (!/[a-z]/i.test(value)) return false;
      if (value.length < 2 || value.length > 40) return false;
      return true;
    }) ?? '';

  return { vehicleYear, vehicleMake, vehicleModel };
}

export function normalizeContact(raw: Record<string, unknown>): SimplifiedContact {
  const firstName = firstTruthy(raw, ['firstName', 'first_name', 'first']);
  const lastName = firstTruthy(raw, ['lastName', 'last_name', 'last']);
  const fullName = firstTruthy(raw, ['name', 'fullName', 'full_name']) || [firstName, lastName].filter(Boolean).join(' ');

  const customFields = Array.isArray(raw.customFields)
    ? raw.customFields
    : Array.isArray(raw.custom_fields)
    ? raw.custom_fields
    : [];

  const customFieldMap = new Map<string, string>();

  const addCustomFieldRow = (row: Record<string, unknown>) => {
    const value =
      firstTruthy(row, [
        'value',
        'fieldValue',
        'field_value',
        'textValue',
        'text_value',
        'stringValue',
        'string_value',
      ]) || stringifyFieldValue(row.value);
    if (!value) return;

    const keys: string[] = [];
    for (const keyName of ['key', 'fieldKey', 'field_key', 'name', 'fieldName', 'field_name', 'id']) {
      const candidate = stringifyFieldValue(row[keyName]);
      if (candidate) keys.push(candidate);
    }

    for (const key of keys) {
      mapCustomFieldValue(customFieldMap, key, value);
    }
  };

  for (const field of customFields) {
    if (!field || typeof field !== 'object') continue;
    addCustomFieldRow(field as Record<string, unknown>);
  }

  const customFieldsObject =
    raw.customFields && !Array.isArray(raw.customFields) && typeof raw.customFields === 'object'
      ? (raw.customFields as Record<string, unknown>)
      : raw.custom_fields && !Array.isArray(raw.custom_fields) && typeof raw.custom_fields === 'object'
      ? (raw.custom_fields as Record<string, unknown>)
      : null;

  if (customFieldsObject) {
    for (const [key, value] of Object.entries(customFieldsObject)) {
      const stringValue = stringifyFieldValue(value);
      if (stringValue) {
        mapCustomFieldValue(customFieldMap, key, stringValue);
      }
    }
  }

  const customFieldValues: string[] = [];
  for (const field of customFields) {
    if (!field || typeof field !== 'object') continue;
    const row = field as Record<string, unknown>;
    const value =
      firstTruthy(row, [
        'value',
        'fieldValue',
        'field_value',
        'textValue',
        'text_value',
        'stringValue',
        'string_value',
      ]) || stringifyFieldValue(row.value);
    if (value) customFieldValues.push(value);
  }
  if (customFieldsObject) {
    for (const value of Object.values(customFieldsObject)) {
      const stringValue = stringifyFieldValue(value);
      if (stringValue) customFieldValues.push(stringValue);
    }
  }

  const customField = (...keys: string[]) => {
    for (const key of keys) {
      for (const alias of customFieldKeyAliases(key)) {
        const value = customFieldMap.get(alias);
        if (value) return value;
      }
    }
    return '';
  };

  // Extract tags
  const tagsRaw = raw.tags;
  const tags: string[] = Array.isArray(tagsRaw)
    ? tagsRaw.map((t: unknown) => String(t)).filter(Boolean)
    : [];

  let vehicleYear =
    firstTruthy(raw, ['vehicle_year', 'vehicleYear', 'contact.vehicle_year', 'contact.vehicleYear']) ||
    customField('vehicle_year', 'vehicleYear', 'contact.vehicle_year', '{{contact.vehicle_year}}');
  let vehicleMake =
    firstTruthy(raw, ['vehicle_make', 'vehicleMake', 'contact.vehicle_make', 'contact.vehicleMake']) ||
    customField('vehicle_make', 'vehicleMake', 'contact.vehicle_make', '{{contact.vehicle_make}}');
  let vehicleModel =
    firstTruthy(raw, ['vehicle_model', 'vehicleModel', 'contact.vehicle_model', 'contact.vehicleModel']) ||
    customField('vehicle_model', 'vehicleModel', 'contact.vehicle_model', '{{contact.vehicle_model}}');

  if (!vehicleYear || !vehicleMake || !vehicleModel) {
    const inferred = inferVehicleFromCustomFieldValues(customFieldValues);
    if (!vehicleYear) vehicleYear = inferred.vehicleYear;
    if (!vehicleMake) vehicleMake = inferred.vehicleMake;
    if (!vehicleModel) vehicleModel = inferred.vehicleModel;
  }

  const lastMessageDate =
    firstTruthy(raw, [
      'lastMessageDate',
      'last_message_date',
      'lastMessageAt',
      'last_message_at',
      'lastActivityDate',
      'last_activity_date',
      'lastActivityAt',
      'last_activity_at',
      'dateOfLastMessage',
      'date_of_last_message',
    ]) ||
    customField('last_message_date', 'lastMessageDate', 'lastActivityDate');

  const hasReceivedMessageRaw =
    firstDefined(raw, [
      'hasReceivedMessage',
      'has_received_message',
      'messageReceived',
      'message_received',
      'receivedAnyMessage',
      'received_any_message',
    ]) ??
    customField('has_received_message', 'hasReceivedMessage');

  const hasReceivedEmailRaw =
    firstDefined(raw, [
      'hasReceivedEmail',
      'has_received_email',
      'emailReceived',
      'email_received',
      'receivedEmail',
      'received_email',
    ]) ??
    customField('has_received_email', 'hasReceivedEmail');

  const hasReceivedSmsRaw =
    firstDefined(raw, [
      'hasReceivedSms',
      'has_received_sms',
      'smsReceived',
      'sms_received',
      'receivedSms',
      'received_sms',
    ]) ??
    customField('has_received_sms', 'hasReceivedSms');

  const hasReceivedEmail = toBoolean(hasReceivedEmailRaw);
  const hasReceivedSms = toBoolean(hasReceivedSmsRaw);
  const hasReceivedMessage = toBoolean(hasReceivedMessageRaw) || hasReceivedEmail || hasReceivedSms || Boolean(lastMessageDate);

  return {
    id: firstTruthy(raw, ['id', '_id']) || crypto.randomUUID(),
    firstName,
    lastName,
    fullName,
    email: firstTruthy(raw, ['email']),
    phone: firstTruthy(raw, ['phone']),
    address1: firstTruthy(raw, ['address1', 'address', 'streetAddress']),
    city: firstTruthy(raw, ['city']),
    state: firstTruthy(raw, ['state']),
    postalCode: firstTruthy(raw, ['postalCode', 'postal_code', 'zip']),
    country: firstTruthy(raw, ['country']),
    tags,
    dateAdded: firstTruthy(raw, ['dateAdded', 'date_added', 'createdAt', 'created_at']),
    source: firstTruthy(raw, ['source', 'leadSource', 'lead_source']),
    vehicleYear,
    vehicleMake,
    vehicleModel,
    vehicleVin:
      firstTruthy(raw, ['vehicle_vin', 'vehicleVin', 'contact.vehicle_vin', 'contact.vehicleVin']) ||
      customField('vehicle_vin', 'vehicleVin', 'contact.vehicle_vin', '{{contact.vehicle_vin}}'),
    vehicleMileage:
      firstTruthy(raw, ['vehicle_mileage', 'vehicleMileage', 'contact.vehicle_mileage', 'contact.vehicleMileage']) ||
      customField('vehicle_mileage', 'vehicleMileage', 'contact.vehicle_mileage', '{{contact.vehicle_mileage}}'),
    lastServiceDate: firstTruthy(raw, ['last_service_date', 'lastServiceDate']) || customField('last_service_date', 'lastServiceDate'),
    nextServiceDate: firstTruthy(raw, ['next_service_date', 'nextServiceDate']) || customField('next_service_date', 'nextServiceDate'),
    leaseEndDate: firstTruthy(raw, ['lease_end_date', 'leaseEndDate']) || customField('lease_end_date', 'leaseEndDate'),
    warrantyEndDate: firstTruthy(raw, ['warranty_end_date', 'warrantyEndDate']) || customField('warranty_end_date', 'warrantyEndDate'),
    purchaseDate: firstTruthy(raw, ['purchase_date', 'purchaseDate']) || customField('purchase_date', 'purchaseDate'),
    hasReceivedMessage,
    hasReceivedEmail,
    hasReceivedSms,
    lastMessageDate,
  };
}

// ── Request Contacts (single page) ──

export async function requestContacts({
  token,
  locationId,
  limit,
  search,
}: {
  token: string;
  locationId: string;
  limit: number;
  search: string;
}): Promise<{ contacts: Record<string, unknown>[]; total: number }> {
  const query = new URLSearchParams({
    locationId,
    limit: String(limit),
  });
  if (search) query.set('query', search);

  const endpoints = [
    `${GHL_BASE}/contacts/?${query.toString()}`,
    `${GHL_BASE}/contacts/search?${query.toString()}`,
  ];

  let lastError = 'Failed to fetch contacts';
  for (const endpoint of endpoints) {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Version: API_VERSION,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      lastError = `GHL API error (${res.status})`;
      continue;
    }

    const data = await res.json();
    const contactsRaw =
      (Array.isArray(data?.contacts) && data.contacts) ||
      (Array.isArray(data?.data?.contacts) && data.data.contacts) ||
      (Array.isArray(data?.data) && data.data) ||
      [];

    const total =
      data?.meta?.total ??
      data?.total ??
      data?.data?.meta?.total ??
      contactsRaw.length;

    return {
      contacts: contactsRaw as Record<string, unknown>[],
      total: typeof total === 'number' ? total : contactsRaw.length,
    };
  }

  throw new Error(lastError);
}
