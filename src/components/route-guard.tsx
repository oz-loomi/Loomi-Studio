'use client';

import { useAccount } from '@/contexts/account-context';

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin, setAccount, userRole } = useAccount();

  if (userRole === 'client') {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 rounded-full bg-[var(--muted)] flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        </div>
        <p className="text-[var(--muted-foreground)] text-sm">You don&apos;t have permission to view this page.</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 rounded-full bg-[var(--muted)] flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
        </div>
        <p className="text-[var(--muted-foreground)] text-sm">This page is only available in Admin mode.</p>
        <button
          onClick={() => setAccount({ mode: 'admin' })}
          className="mt-4 text-sm text-[var(--primary)] hover:underline"
        >
          Switch to Admin
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

export function ClientOnly({ children }: { children: React.ReactNode }) {
  const { isAccount } = useAccount();

  if (!isAccount) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 rounded-full bg-[var(--muted)] flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
        </div>
        <p className="text-[var(--muted-foreground)] text-sm">Select an account to access this page.</p>
        <p className="text-[var(--muted-foreground)] text-xs mt-1">Use the Account switcher in the sidebar.</p>
      </div>
    );
  }

  return <>{children}</>;
}

export function DeveloperOnly({ children }: { children: React.ReactNode }) {
  const { userRole } = useAccount();

  if (userRole !== 'developer') {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 rounded-full bg-[var(--muted)] flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        </div>
        <p className="text-[var(--muted-foreground)] text-sm">This page requires developer access.</p>
      </div>
    );
  }

  return <>{children}</>;
}
