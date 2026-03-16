/**
 * Client-safe role types, constants, and utilities.
 * Import from here in client components — never from @/lib/auth (which imports prisma).
 */

export type UserRole = 'developer' | 'super_admin' | 'admin' | 'client';

/** Roles with full system access (all accounts, user CRUD, account CRUD) */
export const ELEVATED_ROLES: UserRole[] = ['developer', 'super_admin'];

/** All management-tier roles (elevated + admin for read access) */
export const MANAGEMENT_ROLES: UserRole[] = ['developer', 'super_admin', 'admin'];

/** Every valid role */
export const ALL_ROLES: UserRole[] = ['developer', 'super_admin', 'admin', 'client'];

/** Display-friendly role name (e.g. 'super_admin' → 'Super Admin') */
export function roleDisplayName(role: string): string {
  if (role === 'super_admin') return 'Super Admin';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function hasUnrestrictedAccountAccess(role: UserRole, accountKeys: string[]): boolean {
  return role === 'developer' || role === 'super_admin' || (role === 'admin' && accountKeys.length === 0);
}

export function filterAccountKeysByAccess(
  allKeys: string[],
  role: UserRole,
  accountKeys: string[],
): string[] {
  if (hasUnrestrictedAccountAccess(role, accountKeys)) {
    return allKeys;
  }
  const allowed = new Set(accountKeys);
  return allKeys.filter((key) => allowed.has(key));
}
