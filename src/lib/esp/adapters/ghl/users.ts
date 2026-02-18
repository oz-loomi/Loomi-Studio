import { GHL_BASE, API_VERSION } from './constants';

// ── Types ──

export interface GhlUser {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  type: string;
}

// ── Cache ──

const userCache = new Map<string, { users: GhlUser[]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Fetch ──

export async function fetchLocationUsers(
  token: string,
  locationId: string,
  options?: { forceRefresh?: boolean },
): Promise<GhlUser[]> {
  const cached = userCache.get(locationId);
  if (!options?.forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.users;
  }

  const url = `${GHL_BASE}/users/?locationId=${encodeURIComponent(locationId)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Version: API_VERSION,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`GHL Users API error (${res.status}): ${bodyText.slice(0, 200)}`);
  }

  const data = await res.json();

  const rawUsers: Record<string, unknown>[] =
    Array.isArray(data?.users) ? data.users :
    Array.isArray(data) ? data : [];

  const users: GhlUser[] = rawUsers.map((u) => {
    const firstName = String(u.firstName || u.first_name || '');
    const lastName = String(u.lastName || u.last_name || '');
    const fullName = String(u.name || u.fullName || '').trim();
    const derivedName = [firstName, lastName].filter(Boolean).join(' ');

    return {
      id: String(u.id || u._id || ''),
      name: fullName || derivedName || '',
      firstName,
      lastName,
      email: String(u.email || ''),
      phone: String(u.phone || ''),
      role: String(u.role || u.roles || ''),
      type: String(u.type || ''),
    };
  }).filter((u) => u.id);

  userCache.set(locationId, { users, fetchedAt: Date.now() });
  return users;
}

// ── Helpers ──

/** Build a userId -> userName map for quick resolution */
export function buildUserNameMap(users: GhlUser[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const user of users) {
    if (user.id && user.name) {
      map.set(user.id, user.name);
    }
  }
  return map;
}
