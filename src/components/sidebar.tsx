'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
import { useTheme } from '@/contexts/theme-context';
import { SectionsIcon, FlowIcon } from '@/components/icon-map';
import { AccountSwitcher } from '@/components/account-switcher';
import { DevImpersonate } from '@/components/dev-impersonate';
import { AppLogo } from '@/components/app-logo';
import { accountKeyToSlug, isSubaccountRoute, stripSubaccountPrefix } from '@/lib/account-slugs';

// Admin-level nav (when in admin mode)
const adminNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Squares2X2Icon },
  { href: '/contacts', label: 'Contacts', icon: UserGroupIcon },
  { href: '/components', label: 'Sections', icon: SectionsIcon },
  { href: '/templates', label: 'Templates', icon: EnvelopeIcon },
  { href: '/media', label: 'Media', icon: PhotoIcon },
  { href: '/campaigns', label: 'Campaigns', icon: PaperAirplaneIcon },
  { href: '/flows', label: 'Flows', icon: FlowIcon },
];

// Sub-account nav for admin/developer users viewing a sub-account
const subaccountAdminNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Squares2X2Icon },
  { href: '/contacts', label: 'Contacts', icon: UserGroupIcon },
  { href: '/templates', label: 'Templates', icon: EnvelopeIcon },
  { href: '/media', label: 'Media', icon: PhotoIcon },
  { href: '/campaigns', label: 'Campaigns', icon: PaperAirplaneIcon },
  { href: '/flows', label: 'Flows', icon: FlowIcon },
];

// Sub-account nav for client users
const subaccountClientNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Squares2X2Icon },
  { href: '/contacts', label: 'Contacts', icon: UserGroupIcon },
  { href: '/templates', label: 'Templates', icon: EnvelopeIcon },
  { href: '/campaigns', label: 'Campaigns', icon: PaperAirplaneIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const { userRole, isAdmin, isAccount, accountKey, accounts } = useAccount();
  const { theme, toggleTheme } = useTheme();

  const isClientRole = userRole === 'client';
  const slug = accountKey ? accountKeyToSlug(accountKey, accounts) : null;
  const inSubaccountRoute = isSubaccountRoute(pathname);

  // Determine which nav items to show and how to prefix them
  let navItems: typeof adminNavItems;
  let prefix = '';

  if (isAdmin && !inSubaccountRoute) {
    // Admin mode — show full admin nav at top-level
    navItems = adminNavItems;
  } else if (slug) {
    // Sub-account mode — prefix all links with /subaccount/[slug]
    prefix = `/subaccount/${slug}`;
    navItems = isClientRole ? subaccountClientNavItems : subaccountAdminNavItems;
  } else {
    // Fallback: use client nav without prefix
    navItems = isClientRole ? subaccountClientNavItems : adminNavItems;
  }

  // Resolve nav item hrefs with the prefix
  const resolvedNavItems = navItems.map((item) => ({
    ...item,
    href: prefix ? `${prefix}${item.href}` : item.href,
  }));

  // Normalize pathname for active-link detection
  const normalizedPath = inSubaccountRoute ? stripSubaccountPrefix(pathname) : pathname;

  // Settings href
  const settingsHref = isClientRole
    ? (slug ? `/subaccount/${slug}/settings` : '/settings/subaccount')
    : isAccount && slug
      ? `/subaccount/${slug}/settings`
      : '/settings/subaccounts';

  const settingsActive =
    normalizedPath === '/settings' ||
    normalizedPath.startsWith('/settings') ||
    pathname.startsWith('/users') ||
    pathname.startsWith('/subaccounts');

  return (
    <aside className="glass-panel fixed left-3 top-3 bottom-3 w-60 rounded-2xl text-[var(--sidebar-foreground)] flex flex-col z-50 overflow-hidden">
      {/* Logo + Account Switcher */}
      <div className="p-5 pb-4 border-b border-[var(--sidebar-border)]">
        <div className="mb-3">
          <AppLogo className="h-8 w-auto max-w-[150px] object-contain" />
        </div>
        <AccountSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5">
        {resolvedNavItems.map((item) => {
          // Active check: compare the normalized (prefix-stripped) path segment
          const itemPage = item.href.replace(prefix, '');
          const isActive = itemPage === '/dashboard'
            ? normalizedPath === '/dashboard' || normalizedPath === '/'
            : normalizedPath.startsWith(itemPage);
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
