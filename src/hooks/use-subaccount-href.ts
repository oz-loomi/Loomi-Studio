'use client';

import { usePathname } from 'next/navigation';
import { useAccount } from '@/contexts/account-context';
import { accountKeyToSlug, isSubaccountRoute, extractSlugFromPath } from '@/lib/account-slugs';

/**
 * Returns a function that prefixes paths with the sub-account slug
 * when the user is currently in a sub-account context (either via URL
 * or account context). Use this for internal links that should stay
 * within the sub-account scope.
 *
 * Example:
 *   const href = useSubaccountHref();
 *   <Link href={href('/contacts')} />
 *   // Returns '/subaccount/audi-layton/contacts' when in sub-account mode
 *   // Returns '/contacts' when in admin mode
 */
export function useSubaccountHref(): (path: string) => string {
  const pathname = usePathname();
  const { accountKey, accounts } = useAccount();

  const inSubaccountRoute = isSubaccountRoute(pathname);

  // Determine the slug — prefer the URL slug (in case context hasn't synced yet)
  const urlSlug = inSubaccountRoute ? extractSlugFromPath(pathname) : null;
  const contextSlug = accountKey ? accountKeyToSlug(accountKey, accounts) : null;
  const slug = urlSlug || contextSlug;

  return (path: string): string => {
    if (!slug) return path;
    // Don't double-prefix if path already starts with /subaccount/
    if (path.startsWith('/subaccount/')) return path;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `/subaccount/${slug}${normalizedPath}`;
  };
}
