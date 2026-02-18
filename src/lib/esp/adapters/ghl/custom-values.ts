/**
 * GHL Custom Values API helper.
 *
 * Provides CRUD operations for GHL location custom values and a
 * high-level `syncCustomValues()` orchestrator that diffs local
 * definitions against the remote state and applies creates/updates/deletes.
 *
 * Scopes required: locations/customValues.readonly, locations/customValues.write
 * These are Sub-Account-only scopes — must use per-location OAuth tokens.
 */

import { GHL_BASE, API_VERSION } from './constants';

// ── Types ──

export interface GhlCustomValue {
  id: string;
  name: string;
  fieldKey: string;
  value: string;
}

export interface CustomValueInput {
  name: string;
  fieldKey: string;
  value: string;
}

export interface SyncResult {
  created: string[];
  updated: string[];
  deleted: string[];
  skipped: string[];
  errors: Array<{ fieldKey: string; error: string }>;
}

// ── CRUD Operations ──

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Version: API_VERSION,
    Accept: 'application/json',
  };
}

/**
 * Fetch all custom values for a GHL location.
 */
export async function fetchCustomValues(
  token: string,
  locationId: string,
): Promise<GhlCustomValue[]> {
  const res = await fetch(`${GHL_BASE}/locations/${locationId}/customValues`, {
    method: 'GET',
    headers: headers(token),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch custom values (${res.status}): ${body}`);
  }

  const data = await res.json();
  // GHL may return { customValues: [...] } or just an array
  const values = data.customValues || data;
  if (!Array.isArray(values)) return [];

  return values.map((v: Record<string, string>) => ({
    id: String(v.id || v._id || ''),
    name: String(v.name || ''),
    fieldKey: String(v.fieldKey || ''),
    value: String(v.value || ''),
  }));
}

/**
 * Create a new custom value on a GHL location.
 */
export async function createCustomValue(
  token: string,
  locationId: string,
  input: CustomValueInput,
): Promise<GhlCustomValue> {
  const res = await fetch(`${GHL_BASE}/locations/${locationId}/customValues`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      name: input.name,
      value: input.value,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create custom value "${input.fieldKey}" (${res.status}): ${body}`);
  }

  const data = await res.json();
  const v = data.customValue || data;
  return {
    id: String(v.id || v._id || ''),
    name: String(v.name || input.name),
    fieldKey: String(v.fieldKey || input.fieldKey),
    value: String(v.value || input.value),
  };
}

/**
 * Update an existing custom value on a GHL location.
 */
export async function updateCustomValue(
  token: string,
  locationId: string,
  customValueId: string,
  update: { name: string; value: string },
): Promise<GhlCustomValue> {
  const res = await fetch(`${GHL_BASE}/locations/${locationId}/customValues/${customValueId}`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ name: update.name, value: update.value }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to update custom value "${customValueId}" (${res.status}): ${body}`);
  }

  const data = await res.json();
  const v = data.customValue || data;
  return {
    id: String(v.id || v._id || customValueId),
    name: String(v.name || update.name),
    fieldKey: String(v.fieldKey || ''),
    value: String(v.value || update.value),
  };
}

/**
 * Delete a custom value from a GHL location.
 */
export async function deleteCustomValue(
  token: string,
  locationId: string,
  customValueId: string,
): Promise<void> {
  const res = await fetch(`${GHL_BASE}/locations/${locationId}/customValues/${customValueId}`, {
    method: 'DELETE',
    headers: headers(token),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to delete custom value "${customValueId}" (${res.status}): ${body}`);
  }
}

// ── Sync Orchestrator ──

/**
 * Sync a set of desired custom values to a GHL location.
 *
 * 1. Fetches existing values from GHL
 * 2. Matches by fieldKey or name
 * 3. Creates new values, updates changed ones
 * 4. Deletes GHL values that Loomi manages but are no longer in the desired list
 *    (only if managedNames is provided — values not in managedNames are left alone)
 *
 * @param managedNames - Display names of all values Loomi knows about (global defaults + overrides).
 *   When provided, any GHL value whose name matches a managed name BUT is not in the desired list
 *   will be deleted. Values created directly in GHL (outside Loomi) are never touched.
 *
 * Returns a SyncResult with arrays of what was created/updated/deleted/skipped/errored.
 */
export async function syncCustomValues(
  token: string,
  locationId: string,
  desired: CustomValueInput[],
  managedNames?: string[],
): Promise<SyncResult> {
  const result: SyncResult = {
    created: [],
    updated: [],
    deleted: [],
    skipped: [],
    errors: [],
  };

  // 1. Fetch existing custom values from GHL
  let existing: GhlCustomValue[];
  try {
    existing = await fetchCustomValues(token, locationId);
  } catch (err) {
    result.errors.push({
      fieldKey: '*',
      error: `Failed to fetch existing values: ${err instanceof Error ? err.message : String(err)}`,
    });
    return result;
  }

  // 2. Build lookup by fieldKey AND by name (GHL auto-generates fieldKey from name,
  //    so the fieldKey in GHL may differ from what Loomi defines — e.g. "contact.crm_name"
  //    vs "crm_name". Matching by name is more reliable for finding our own values.)
  const existingByKey = new Map<string, GhlCustomValue>();
  const existingByName = new Map<string, GhlCustomValue>();
  for (const cv of existing) {
    if (cv.fieldKey) existingByKey.set(cv.fieldKey, cv);
    if (cv.name) existingByName.set(cv.name.toLowerCase(), cv);
  }

  // Track which existing values we've matched so we know what's left for deletion
  const matchedIds = new Set<string>();

  // 3. Create or update each desired value
  for (const input of desired) {
    // Try matching by fieldKey first, then by name as fallback
    const remote = existingByKey.get(input.fieldKey)
      || existingByName.get(input.name.toLowerCase());

    if (remote) {
      matchedIds.add(remote.id);
      // Exists in GHL — check if update needed
      if (remote.name !== input.name || remote.value !== input.value) {
        try {
          await updateCustomValue(token, locationId, remote.id, {
            name: input.name,
            value: input.value,
          });
          result.updated.push(input.fieldKey);
        } catch (err) {
          result.errors.push({
            fieldKey: input.fieldKey,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        result.skipped.push(input.fieldKey);
      }
    } else {
      // New — create in GHL
      try {
        await createCustomValue(token, locationId, input);
        result.created.push(input.fieldKey);
      } catch (err) {
        result.errors.push({
          fieldKey: input.fieldKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 4. Delete GHL values that Loomi manages but are no longer in the desired list.
  //    Only delete values whose name matches a Loomi-managed name — leave
  //    values created directly in GHL (outside of Loomi) untouched.
  if (managedNames && managedNames.length > 0) {
    const managedSet = new Set(managedNames.map(n => n.toLowerCase()));

    for (const cv of existing) {
      if (matchedIds.has(cv.id)) continue; // Matched to a desired value — keep it
      // Only delete if the GHL value's name matches something Loomi manages
      if (!cv.name || !managedSet.has(cv.name.toLowerCase())) continue;
      try {
        await deleteCustomValue(token, locationId, cv.id);
        result.deleted.push(cv.fieldKey || cv.name);
      } catch (err) {
        result.errors.push({
          fieldKey: cv.fieldKey || cv.name,
          error: `Delete failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  return result;
}
