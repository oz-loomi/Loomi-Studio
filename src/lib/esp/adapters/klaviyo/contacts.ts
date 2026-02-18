// ── Klaviyo Contacts (Profiles) Adapter ──

import { KLAVIYO_BASE, KLAVIYO_REVISION } from './constants';
import { resolveKlaviyoCredentials } from './auth';
import type { EspCredentials, NormalizedContact } from '../../types';

// ── Shared request helper ──

function klaviyoHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    revision: KLAVIYO_REVISION,
    Accept: 'application/vnd.api+json',
  };
}

// ── Contact count cache (5 minute TTL, same pattern as GHL) ──

const countCache = new Map<string, { total: number; ts: number }>();
const COUNT_TTL = 5 * 60 * 1000;

export function getCachedContactCount(accountKey: string): number | null {
  const entry = countCache.get(accountKey);
  if (entry && Date.now() - entry.ts < COUNT_TTL) return entry.total;
  countCache.delete(accountKey);
  return null;
}

export function setCachedContactCount(accountKey: string, total: number): void {
  countCache.set(accountKey, { total, ts: Date.now() });
}

// ── Credential Resolution ──

export async function resolveCredentials(
  accountKey: string,
): Promise<EspCredentials | null> {
  return resolveKlaviyoCredentials(accountKey);
}

// ── Fetch Contact Count ──

/**
 * Klaviyo has no direct count endpoint. We paginate with page[size]=1
 * and use the total from the response, or count through full pagination
 * for an accurate number.
 *
 * Strategy: Fetch first page with minimal fields. If there's a total
 * in the response metadata, use it. Otherwise estimate from pagination.
 */
export async function fetchContactCount(
  apiKey: string,
  _locationId: string,
): Promise<number> {
  // Klaviyo doesn't return a total count in pagination.
  // Best approach: paginate through all profiles counting them.
  // For performance, use page[size]=100 and just count pages.
  let count = 0;
  let url: string | null = `${KLAVIYO_BASE}/profiles/?page[size]=100&fields[profile]=email`;

  while (url) {
    const res: Response = await fetch(url, { headers: klaviyoHeaders(apiKey) });
    if (!res.ok) {
      throw new Error(`Klaviyo profiles count failed (${res.status})`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    count += (json.data?.length ?? 0);
    url = json.links?.next ?? null;

    // Safety limit — if > 100k contacts, stop and return estimate
    if (count >= 100_000) break;
  }

  return count;
}

// ── Fetch All Contacts ──

const MAX_PROFILES = 50_000;

export async function fetchAllContacts(
  apiKey: string,
  _locationId: string,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let url: string | null = `${KLAVIYO_BASE}/profiles/?page[size]=100`;

  while (url && all.length < MAX_PROFILES) {
    const res: Response = await fetch(url, { headers: klaviyoHeaders(apiKey) });
    if (!res.ok) {
      throw new Error(`Klaviyo profiles fetch failed (${res.status})`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    const profiles = json.data ?? [];
    for (const profile of profiles) {
      all.push(profile);
    }
    url = json.links?.next ?? null;
  }

  return all;
}

// ── Request Contacts (paginated with search) ──

export async function requestContacts(params: {
  token: string;
  locationId: string;
  limit: number;
  search: string;
}): Promise<{ contacts: Record<string, unknown>[]; total: number }> {
  const { token: apiKey, limit, search } = params;

  let url = `${KLAVIYO_BASE}/profiles/?page[size]=${Math.min(limit, 100)}`;

  // Klaviyo only supports equals filter on email and phone_number
  if (search) {
    // Try to detect if search is an email or phone, otherwise do a name filter
    if (search.includes('@')) {
      url += `&filter=equals(email,"${encodeURIComponent(search)}")`;
    } else if (search.startsWith('+') || /^\d{10,}$/.test(search)) {
      url += `&filter=equals(phone_number,"${encodeURIComponent(search)}")`;
    }
    // For name searches, Klaviyo doesn't support contains/partial match.
    // We fetch all and filter client-side.
  }

  url += '&sort=-created';

  const res = await fetch(url, { headers: klaviyoHeaders(apiKey) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Klaviyo profiles request failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  let profiles: Record<string, unknown>[] = json.data ?? [];

  // Client-side name filtering if search isn't email/phone
  if (search && !search.includes('@') && !search.startsWith('+') && !/^\d{10,}$/.test(search)) {
    const lower = search.toLowerCase();
    profiles = profiles.filter((p: Record<string, unknown>) => {
      const attrs = p.attributes as Record<string, unknown> | undefined;
      const first = String(attrs?.first_name || '').toLowerCase();
      const last = String(attrs?.last_name || '').toLowerCase();
      const email = String(attrs?.email || '').toLowerCase();
      return first.includes(lower) || last.includes(lower) || email.includes(lower) ||
             `${first} ${last}`.includes(lower);
    });
  }

  return { contacts: profiles, total: profiles.length };
}

// ── Normalize Contact ──

/**
 * Map a Klaviyo JSON:API profile object to NormalizedContact.
 * Klaviyo profile structure:
 *   { id, type: "profile", attributes: { email, phone_number, first_name, last_name, properties: {...}, ... } }
 */
export function normalizeContact(raw: Record<string, unknown>): NormalizedContact {
  const attrs = (raw.attributes ?? raw) as Record<string, unknown>;
  const props = (attrs.properties ?? {}) as Record<string, unknown>;

  const firstName = String(attrs.first_name || '');
  const lastName = String(attrs.last_name || '');

  return {
    id: String(raw.id || ''),
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(' ') || String(attrs.email || ''),
    email: String(attrs.email || ''),
    phone: String(attrs.phone_number || ''),
    address1: String(attrs.address1 || (attrs.location as Record<string, unknown> | undefined)?.address1 || ''),
    city: String(attrs.city || (attrs.location as Record<string, unknown> | undefined)?.city || ''),
    state: String(attrs.region || (attrs.location as Record<string, unknown> | undefined)?.region || ''),
    postalCode: String(attrs.zip || (attrs.location as Record<string, unknown> | undefined)?.zip || ''),
    country: String(attrs.country || (attrs.location as Record<string, unknown> | undefined)?.country || ''),
    tags: Array.isArray(props.tags) ? props.tags.map(String) : [],
    dateAdded: String(attrs.created || ''),
    source: String(props.source || props['Lead Source'] || ''),
    // Vehicle-specific (from custom properties)
    vehicleYear: String(props.vehicleYear || props.vehicle_year || props['Vehicle Year'] || ''),
    vehicleMake: String(props.vehicleMake || props.vehicle_make || props['Vehicle Make'] || ''),
    vehicleModel: String(props.vehicleModel || props.vehicle_model || props['Vehicle Model'] || ''),
    vehicleVin: String(props.vehicleVin || props.vehicle_vin || props['Vehicle VIN'] || ''),
    vehicleMileage: String(props.vehicleMileage || props.vehicle_mileage || props['Vehicle Mileage'] || ''),
    lastServiceDate: String(props.lastServiceDate || props.last_service_date || props['Last Service Date'] || ''),
    nextServiceDate: String(props.nextServiceDate || props.next_service_date || props['Next Service Date'] || ''),
    leaseEndDate: String(props.leaseEndDate || props.lease_end_date || props['Lease End Date'] || ''),
    warrantyEndDate: String(props.warrantyEndDate || props.warranty_end_date || props['Warranty End Date'] || ''),
    purchaseDate: String(props.purchaseDate || props.purchase_date || props['Purchase Date'] || ''),
    // Messaging engagement — Klaviyo tracks this differently
    hasReceivedMessage: false,
    hasReceivedEmail: Boolean(props.hasReceivedEmail || props._klaviyo_email_received),
    hasReceivedSms: Boolean(props.hasReceivedSms || props._klaviyo_sms_received),
    lastMessageDate: String(props.lastMessageDate || ''),
  };
}
