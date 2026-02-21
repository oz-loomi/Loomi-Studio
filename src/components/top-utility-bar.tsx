'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  ArrowRightStartOnRectangleIcon,
  BugAntIcon,
  ClockIcon,
  QuestionMarkCircleIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { useAccount } from '@/contexts/account-context';
import { UserAvatar } from '@/components/user-avatar';
import { AI_ASSIST_OPEN_EVENT } from '@/lib/ui-events';
import { ChangelogPanel } from '@/components/changelog-panel';

function UtilityIconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="inline-flex items-center justify-center w-8 h-8 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
    >
      {children}
    </button>
  );
}

export function TopUtilityBar() {
  const pathname = usePathname();
  const { userName, userTitle, userEmail, userAvatarUrl, userRole } = useAccount();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userSecondaryLabel = userTitle || userEmail || 'No email';

  // Changelog
  const [showChangelog, setShowChangelog] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const checkUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/changelog');
      if (!res.ok) return;
      const data = await res.json();
      const entries = data.entries || [];
      if (entries.length === 0) { setHasUnread(false); return; }
      const latest = entries[0].publishedAt;
      const seen = localStorage.getItem('loomi-changelog-seen');
      setHasUnread(!seen || new Date(latest) > new Date(seen));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { checkUnread(); }, [checkUnread]);

  useEffect(() => {
    if (!userMenuOpen) return;
    function handleMouseDown(event: MouseEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setUserMenuOpen(false);
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    setUserMenuOpen(false);
  }, [pathname]);

  return (
    <header className="flex justify-end mb-2" aria-label="Page utilities">
      <div className="flex items-center gap-2">
        <UtilityIconButton
          title="Help"
          onClick={() => {
            window.dispatchEvent(new Event(AI_ASSIST_OPEN_EVENT));
          }}
        >
          <QuestionMarkCircleIcon className="w-5 h-5" />
        </UtilityIconButton>

        <div className="relative">
          <UtilityIconButton
            title="Changelog"
            onClick={() => { setShowChangelog(true); setHasUnread(false); }}
          >
            <ClockIcon className="w-5 h-5" />
          </UtilityIconButton>
          {hasUnread && (
            <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-[var(--primary)] rounded-full pointer-events-none" />
          )}
        </div>

        <UtilityIconButton
          title="Report a Bug"
          onClick={() => toast.info('Bug reporting portal coming soon')}
        >
          <BugAntIcon className="w-5 h-5" />
        </UtilityIconButton>

        <div ref={userMenuRef} className="relative">
          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 z-50 w-64 glass-dropdown shadow-lg">
              <div className="p-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2.5">
                  <UserAvatar
                    name={userName}
                    email={userEmail}
                    avatarUrl={userAvatarUrl}
                    size={36}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--foreground)] truncate">
                      {userName || 'User'}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)] truncate">
                      {userSecondaryLabel}
                    </p>
                    {userRole && (
                      <span className="inline-block mt-1 text-[10px] font-medium uppercase tracking-wider text-[var(--primary)] bg-[var(--primary)]/10 rounded px-1.5 py-0.5">
                        {userRole}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-1.5">
                <Link
                  href="/profile"
                  onClick={() => setUserMenuOpen(false)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-lg text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                >
                  <UserCircleIcon className="w-4 h-4" />
                  Profile
                </Link>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            title="Account"
            aria-label="Account"
            onClick={() => setUserMenuOpen((prev) => !prev)}
            className="inline-flex items-center justify-center w-8 h-8 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            <UserAvatar
              name={userName}
              email={userEmail}
              avatarUrl={userAvatarUrl}
              size={32}
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
          </button>
        </div>
      </div>

      {showChangelog && (
        <ChangelogPanel onClose={() => { setShowChangelog(false); checkUnread(); }} />
      )}
    </header>
  );
}
