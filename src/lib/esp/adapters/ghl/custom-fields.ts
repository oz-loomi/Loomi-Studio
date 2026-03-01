/**
 * GHL Custom Fields API helper.
 *
 * Provides CRUD operations for sub-account custom field definitions.
 * Endpoints (Sub-Account API):
 * - GET    /locations/:locationId/customFields
 * - POST   /locations/:locationId/customFields
 * - GET    /locations/:locationId/customFields/:id
 * - PUT    /locations/:locationId/customFields/:id
 * - DELETE /locations/:locationId/customFields/:id
 *
 * Typical scopes: locations/customFields.readonly, locations/customFields.write
 */

import { GHL_BASE, API_VERSION } from './constants';

export interface GhlCustomField {
  id: string;
  name: string;
  fieldKey: string;
  dataType: string;
  model: string;
  placeholder?: string;
  groupId?: string;
  options?: unknown[];
  raw: Record<string, unknown>;
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Version: API_VERSION,
    Accept: 'application/json',
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractCollection(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.map((entry) => asRecord(entry));
  }

  const record = asRecord(data);
  const candidates = [
    record.customFields,
    record.fields,
    record.data,
    record.items,
    asRecord(record.data).customFields,
    asRecord(record.data).fields,
    asRecord(record.data).items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((entry) => asRecord(entry));
    }
  }

  return [];
}

function normalizeField(raw: unknown): GhlCustomField {
  const row = asRecord(raw);
  const optionCandidate = row.options;
  const options = Array.isArray(optionCandidate) ? optionCandidate : undefined;

  return {
    id: String(row.id || row._id || ''),
    name: String(row.name || row.fieldName || row.label || ''),
    fieldKey: String(row.fieldKey || row.key || row.objectKey || ''),
    dataType: String(row.dataType || row.type || ''),
    model: String(row.model || row.fieldFor || row.object || ''),
    placeholder: row.placeholder ? String(row.placeholder) : undefined,
    groupId: row.groupId ? String(row.groupId) : undefined,
    options,
    raw: row,
  };
}

async function parseResponseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function customFieldsUrl(locationId: string, model?: string): string {
  const url = new URL(`${GHL_BASE}/locations/${encodeURIComponent(locationId)}/customFields`);
  if (model && model.trim()) {
    url.searchParams.set('model', model.trim());
  }
  return url.toString();
}

export async function fetchCustomFields(
  token: string,
  locationId: string,
  model?: string,
): Promise<GhlCustomField[]> {
  const res = await fetch(customFieldsUrl(locationId, model), {
    method: 'GET',
    headers: headers(token),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch custom fields (${res.status}): ${body}`);
  }

  const data = await parseResponseJson(res);
  return extractCollection(data).map((entry) => normalizeField(entry));
}

export async function fetchCustomField(
  token: string,
  locationId: string,
  customFieldId: string,
): Promise<GhlCustomField | null> {
  const encodedId = encodeURIComponent(customFieldId);
  const res = await fetch(
    `${GHL_BASE}/locations/${encodeURIComponent(locationId)}/customFields/${encodedId}`,
    {
      method: 'GET',
      headers: headers(token),
    },
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch custom field "${customFieldId}" (${res.status}): ${body}`);
  }

  const data = await parseResponseJson(res);
  const row = asRecord(data);
  const candidate =
    row.customField ||
    row.field ||
    row.data ||
    row;

  return normalizeField(candidate);
}

export async function createCustomField(
  token: string,
  locationId: string,
  payload: Record<string, unknown>,
  model?: string,
): Promise<GhlCustomField> {
  const res = await fetch(customFieldsUrl(locationId, model), {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create custom field (${res.status}): ${body}`);
  }

  const data = await parseResponseJson(res);
  const row = asRecord(data);
  const candidate =
    row.customField ||
    row.field ||
    row.data ||
    row;

  return normalizeField(candidate);
}

export async function updateCustomField(
  token: string,
  locationId: string,
  customFieldId: string,
  payload: Record<string, unknown>,
): Promise<GhlCustomField> {
  const encodedId = encodeURIComponent(customFieldId);
  const res = await fetch(
    `${GHL_BASE}/locations/${encodeURIComponent(locationId)}/customFields/${encodedId}`,
    {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to update custom field "${customFieldId}" (${res.status}): ${body}`);
  }

  const data = await parseResponseJson(res);
  if (data) {
    const row = asRecord(data);
    const candidate =
      row.customField ||
      row.field ||
      row.data ||
      row;
    return normalizeField(candidate);
  }

  const refreshed = await fetchCustomField(token, locationId, customFieldId).catch(() => null);
  if (refreshed) return refreshed;

  return normalizeField({ id: customFieldId, ...payload });
}

export async function deleteCustomField(
  token: string,
  locationId: string,
  customFieldId: string,
): Promise<void> {
  const encodedId = encodeURIComponent(customFieldId);
  const res = await fetch(
    `${GHL_BASE}/locations/${encodeURIComponent(locationId)}/customFields/${encodedId}`,
    {
      method: 'DELETE',
      headers: headers(token),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to delete custom field "${customFieldId}" (${res.status}): ${body}`);
  }
}
