'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAccount } from '@/contexts/account-context';
import { slugToAccountKey } from '@/lib/account-slugs';

export default function SubaccountLayout({ children }: { children: React.ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { accounts, accountsLoaded, setAccount, account, accountKey, userRole } = useAccount();
  const syncedRef = useRef(false);

  const resolvedKey = slugToAccountKey(slug, accounts);

  // Sync context from URL slug.
  // When this layout first mounts from an admin route, the shared account
  // context is still in admin mode and needs to be hydrated from the URL.
  // We only skip the sync after this layout has already been active once and
  // the user has explicitly switched back to admin, which avoids reverting
  // that outbound navigation during the brief unmount window.
  useEffect(() => {
    if (!accountsLoaded || !resolvedKey) return;
    if (account.mode === 'admin' && syncedRef.current) return;
    if (accountKey !== resolvedKey) {
      setAccount({ mode: 'account', accountKey: resolvedKey });
    }
    syncedRef.current = true;
  }, [accountsLoaded, resolvedKey, account.mode, accountKey, setAccount]);

  // Validate access: ensure user can access this account
  useEffect(() => {
    if (!accountsLoaded) return;

    if (!resolvedKey) {
      // Invalid slug — redirect to dashboard
      router.replace('/dashboard');
      return;
    }

    // Client users: verify account is in their assignments
    if (userRole === 'client') {
      const userAccounts = Object.keys(accounts);
      if (!userAccounts.includes(resolvedKey)) {
        // Redirect to their first available account
        const firstSlug = Object.values(accounts)[0]?.slug;
        if (firstSlug) {
          router.replace(`/subaccount/${firstSlug}/dashboard`);
        }
      }
    }
  }, [accountsLoaded, resolvedKey, userRole, accounts, router]);

  if (!accountsLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]" />
      </div>
    );
  }

  if (!resolvedKey) {
    return null; // Redirecting
  }

  return <>{children}</>;
}
