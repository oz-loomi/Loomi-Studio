'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Squares2X2Icon,
  CogIcon,
  EnvelopeIcon,
  PaperAirplaneIcon,
  UserGroupIcon,
  PhotoIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/react/24/outline';
import { useAccount } from '@/contexts/account-context';
import { useUnsavedChanges } from '@/contexts/unsaved-changes-context';
import { useTheme } from '@/contexts/theme-context';
import { SectionsIcon, FlowIcon } from '@/components/icon-map';
import { AccountSwitcher } from '@/components/account-switcher';
import { DevImpersonate } from '@/components/dev-impersonate';
import { AppLogo } from '@/components/app-logo';

const adminNavItems = [
  { href: '/', label: 'Dashboard', icon: Squares2X2Icon },
  { href: '/contacts', label: 'Contacts', icon: UserGroupIcon },
  { href: '/components', label: 'Sections', icon: SectionsIcon },
  { href: '/templates', label: 'Templates', icon: EnvelopeIcon },
  { href: '/media', label: 'Media', icon: PhotoIcon },
  { href: '/campaigns', label: 'Campaigns', icon: PaperAirplaneIcon },
  { href: '/flows', label: 'Flows', icon: FlowIcon },
];

const clientNavItems = [
  { href: '/', label: 'Dashboard', icon: Squares2X2Icon },
  { href: '/contacts', label: 'Contacts', icon: UserGroupIcon },
  { href: '/templates', label: 'Templates', icon: EnvelopeIcon },
  { href: '/media', label: 'Media', icon: PhotoIcon },
  { href: '/campaigns', label: 'Campaigns', icon: PaperAirplaneIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { userRole, isAccount } = useAccount();
  const { confirmNavigation } = useUnsavedChanges();
  const { theme, toggleTheme } = useTheme();

  const isClientRole = userRole === 'client';
  const navItems = isClientRole ? clientNavItems : adminNavItems;
  const settingsHref = isClientRole ? '/settings/account' : (isAccount ? '/settings/account' : '/settings/accounts');

  const settingsActive = pathname === '/settings' || pathname.startsWith('/settings') || pathname.startsWith('/users') || pathname.startsWith('/accounts');

  return (
    <aside className="glass-panel fixed left-3 top-3 bottom-3 w-60 rounded-2xl text-[var(--sidebar-foreground)] flex flex-col z-50 overflow-hidden">
      {/* Logo + Account Switcher */}
      <div className="p-5 pb-4 border-b border-[var(--sidebar-border)]">
        <div className="mb-3">
          <AppLogo className="h-8 w-auto max-w-[150px] object-contain" />
        </div>
        <AccountSwitcher
          onSwitch={() => {
            confirmNavigation(() => router.push('/'), '/');
          }}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-[var(--primary)] text-white shadow-[0_2px_8px_rgba(59,130,246,0.3)]'
                  : 'text-[var(--sidebar-muted-foreground)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-muted)]'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Developer impersonation */}
      <DevImpersonate />

      {/* Settings / Theme Toggle */}
      <div className="p-3 border-t border-[var(--sidebar-border)]">
        {isClientRole ? (
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-[var(--sidebar-muted-foreground)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-muted)]"
          >
            {theme === 'dark' ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
        ) : (
          <Link
            href={settingsHref}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              settingsActive
                ? 'bg-[var(--primary)] text-white shadow-[0_2px_8px_rgba(59,130,246,0.3)]'
                : 'text-[var(--sidebar-muted-foreground)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-muted)]'
            }`}
          >
            <CogIcon className="w-5 h-5" />
            Settings
          </Link>
        )}
      </div>
    </aside>
  );
}
