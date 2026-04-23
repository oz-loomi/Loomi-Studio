'use client';

import { useEffect, useState, type ComponentType, type SVGProps } from 'react';
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
  WrenchScrewdriverIcon,
  MegaphoneIcon,
  ChevronDownIcon,
  ChartBarSquareIcon,
} from '@heroicons/react/24/outline';
import { useAccount } from '@/contexts/account-context';
import { useTheme } from '@/contexts/theme-context';
import { SectionsIcon, FlowIcon } from '@/components/icon-map';
import { AccountSwitcher } from '@/components/account-switcher';
import { DevImpersonate } from '@/components/dev-impersonate';
import { AppLogo } from '@/components/app-logo';
import { accountKeyToSlug, isSubaccountRoute, stripSubaccountPrefix } from '@/lib/account-slugs';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  href: string;
  label: string;
  icon: IconComponent;
  children?: NavItem[];
  // When true, href is used as-is and the sub-account prefix is NOT applied.
  // Use for global tools that live outside the /subaccount/[slug]/* route tree
  // but should still appear in the sub-account nav (e.g. Tools for admins).
  absolute?: boolean;
}

const toolsNavItem: NavItem = {
  href: '/tools',
  label: 'Tools',
  icon: WrenchScrewdriverIcon,
  absolute: true,
  children: [
    {
      href: '/tools/meta-ads-pacer',
      label: 'Meta Ads Pacer',
      icon: MegaphoneIcon,
      absolute: true,
    },
  ],
};

// Campaigns group — nests the core campaign-building surfaces underneath.
// Sections is admin-only (dev/super_admin/admin) and not included in sub-account navs.
const campaignsGroupOverview: NavItem = {
  href: '/campaigns',
  label: 'Overview',
  icon: ChartBarSquareIcon,
};
const campaignsGroupSections: NavItem = {
  href: '/components',
  label: 'Sections',
  icon: SectionsIcon as IconComponent,
};
const campaignsGroupTemplates: NavItem = {
  href: '/templates',
  label: 'Templates',
  icon: EnvelopeIcon,
};
const campaignsGroupFlows: NavItem = {
  href: '/flows',
  label: 'Flows',
  icon: FlowIcon as IconComponent,
};

const campaignsNavAdmin: NavItem = {
  href: '/campaigns',
  label: 'Campaigns',
  icon: PaperAirplaneIcon,
  children: [
    campaignsGroupOverview,
    campaignsGroupSections,
    campaignsGroupTemplates,
    campaignsGroupFlows,
  ],
};

const campaignsNavSubaccountAdmin: NavItem = {
  href: '/campaigns',
  label: 'Campaigns',
  icon: PaperAirplaneIcon,
  children: [campaignsGroupOverview, campaignsGroupTemplates, campaignsGroupFlows],
};

const campaignsNavClient: NavItem = {
  href: '/campaigns',
  label: 'Campaigns',
  icon: PaperAirplaneIcon,
  children: [campaignsGroupOverview, campaignsGroupTemplates],
};

// Admin-level nav (when in admin mode)
const adminNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: Squares2X2Icon },
  { href: '/contacts', label: 'Contacts', icon: UserGroupIcon },
  campaignsNavAdmin,
  { href: '/media', label: 'Media', icon: PhotoIcon },
  toolsNavItem,
];

// Sub-account nav for admin/developer users viewing a sub-account
const subaccountAdminNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: Squares2X2Icon },
  { href: '/contacts', label: 'Contacts', icon: UserGroupIcon },
  campaignsNavSubaccountAdmin,
  { href: '/media', label: 'Media', icon: PhotoIcon },
  toolsNavItem,
];

// Sub-account nav for client users
const subaccountClientNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: Squares2X2Icon },
  { href: '/contacts', label: 'Contacts', icon: UserGroupIcon },
  campaignsNavClient,
];

export function Sidebar() {
  const pathname = usePathname();
  const { userRole, isAdmin, isAccount, accountKey, accounts } = useAccount();
  const { theme, toggleTheme } = useTheme();

  const isClientRole = userRole === 'client';
  const slug = accountKey ? accountKeyToSlug(accountKey, accounts) : null;
  const inSubaccountRoute = isSubaccountRoute(pathname);

  let navItems: NavItem[];
  let prefix = '';

  if (isAdmin && !inSubaccountRoute) {
    navItems = adminNavItems;
  } else if (slug) {
    prefix = `/subaccount/${slug}`;
    navItems = isClientRole ? subaccountClientNavItems : subaccountAdminNavItems;
  } else {
    navItems = isClientRole ? subaccountClientNavItems : adminNavItems;
  }

  // Resolve nav item hrefs with the prefix (skip for absolute items)
  const resolvedNavItems: NavItem[] = navItems.map((item) => ({
    ...item,
    href: prefix && !item.absolute ? `${prefix}${item.href}` : item.href,
    children: item.children?.map((child) => ({
      ...child,
      href: prefix && !child.absolute ? `${prefix}${child.href}` : child.href,
    })),
  }));

  const normalizedPath = inSubaccountRoute ? stripSubaccountPrefix(pathname) : pathname;

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
    <aside className="glass-panel fixed left-3 top-3 bottom-3 w-60 rounded-2xl text-[var(--sidebar-foreground)] flex flex-col z-50 overflow-visible">
      {/* Logo + Account Switcher */}
      <div className="p-5 pb-4 border-b border-[var(--sidebar-border)]">
        <div className="mb-3">
          <AppLogo className="h-8 w-auto max-w-[150px] object-contain" />
        </div>
        <AccountSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {resolvedNavItems.map((item) => {
          if (item.children && item.children.length > 0) {
            return (
              <NavGroup
                key={item.label}
                item={item}
                prefix={prefix}
                normalizedPath={normalizedPath}
              />
            );
          }
          const itemPage = item.href.replace(prefix, '');
          const isActive =
            itemPage === '/dashboard'
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

function NavGroup({
  item,
  prefix,
  normalizedPath,
}: {
  item: NavItem;
  prefix: string;
  normalizedPath: string;
}) {
  // A group is active if the URL matches any of its children's paths — children
  // can live at unrelated URL roots (Templates at /templates, Flows at /flows,
  // etc.) even though they're grouped under a parent like "Campaigns".
  const sectionActive = (item.children ?? []).some((child) => {
    const childPath = child.absolute
      ? child.href
      : child.href.replace(prefix, '');
    return normalizedPath === childPath || normalizedPath.startsWith(`${childPath}/`);
  });
  const [open, setOpen] = useState<boolean>(sectionActive);

  // Auto-expand when navigating into a child route
  useEffect(() => {
    if (sectionActive) setOpen(true);
  }, [sectionActive]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
          sectionActive
            ? 'text-[var(--sidebar-foreground)] bg-[var(--sidebar-muted)]'
            : 'text-[var(--sidebar-muted-foreground)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-muted)]'
        }`}
      >
        <item.icon className="w-5 h-5" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDownIcon
          className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div className="collapsible-wrapper" data-open={open ? 'true' : 'false'}>
        <div className="collapsible-inner">
          <div className="pt-0.5 pl-3 space-y-0.5">
            {item.children!.map((child) => {
              const childPath = child.absolute
                ? child.href
                : child.href.replace(prefix, '');
              const childActive =
                normalizedPath === childPath ||
                normalizedPath.startsWith(`${childPath}/`);
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    childActive
                      ? 'bg-[var(--primary)] text-white shadow-[0_2px_8px_rgba(59,130,246,0.3)]'
                      : 'text-[var(--sidebar-muted-foreground)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-muted)]'
                  }`}
                >
                  <child.icon className="w-4 h-4" />
                  {child.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
