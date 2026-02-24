'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronUpDownIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { useAccount, type AccountData } from '@/contexts/account-context';
import { useUnsavedChanges } from '@/contexts/unsaved-changes-context';
import { AccountAvatar } from '@/components/account-avatar';
import { formatAccountCityState, resolveAccountCity, resolveAccountState } from '@/lib/account-resolvers';

interface AccountSwitcherProps {
  onSwitch?: () => void;
}

function parseCityStateFromLocationName(locationName: string | null | undefined): string | null {
  if (typeof locationName !== 'string') return null;
  const trimmed = locationName.trim();
  if (!trimmed) return null;

  const parts = trimmed
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return null;

  const city = parts[0];
  const stateToken = parts[1].split(/\s+/)[0]?.trim();
  if (!city || !stateToken) return null;

  return `${city}, ${stateToken.toUpperCase()}`;
}

function resolveAccountCityStateLabel(accountData: AccountData): string | null {
  const directCityState = formatAccountCityState(accountData);
  if (directCityState) return directCityState;

  const fromActiveConnection = parseCityStateFromLocationName(accountData.activeConnection?.accountName);
  if (fromActiveConnection) return fromActiveConnection;

  const fromOAuthConnection = accountData.oauthConnections
    ?.map((connection) => parseCityStateFromLocationName(connection.locationName))
    .find((value): value is string => Boolean(value));

  return fromOAuthConnection || null;
}

export function AccountSwitcher({ onSwitch }: AccountSwitcherProps) {
  const { account, setAccount, accounts, accountsLoaded, userRole } = useAccount();
  const { confirmNavigation } = useUnsavedChanges();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const canSwitchToAdmin = userRole === 'developer' || userRole === 'super_admin' || userRole === 'admin';
  const isAdmin = account.mode === 'admin';
  const currentKey = account.mode === 'account' ? account.accountKey : null;
  const currentAccount = currentKey ? accounts[currentKey] : null;

  // Position dropdown when opening
  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 6,
        left: rect.left,
      });
    }
  }, [open]);

  // Close on outside click (checks both trigger and portal dropdown)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedTrigger = triggerRef.current?.contains(target);
      const clickedDropdown = dropdownRef.current?.contains(target);
      if (!clickedTrigger && !clickedDropdown) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search when opened
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setSearch(''); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleSelect = (key: string | '__admin__') => {
    const destinationLabel = key === '__admin__' ? 'Admin Account' : (accounts[key]?.dealer || key);
    confirmNavigation(() => {
      if (key === '__admin__') {
        setAccount({ mode: 'admin' });
      } else {
        setAccount({ mode: 'account', accountKey: key });
      }
      setOpen(false);
      setSearch('');
      onSwitch?.();
    }, destinationLabel);
  };

  const filteredAccounts = Object.entries(accounts).filter(([key, accountData]) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const cityStateLabel = resolveAccountCityStateLabel(accountData)?.toLowerCase() || '';
    return (
      (accountData.dealer || '').toLowerCase().includes(q) ||
      key.toLowerCase().includes(q) ||
      resolveAccountCity(accountData).toLowerCase().includes(q) ||
      resolveAccountState(accountData).toLowerCase().includes(q) ||
      cityStateLabel.includes(q)
    );
  });

  const getAccountAddress = (accountData: AccountData) => resolveAccountCityStateLabel(accountData);

  // Client-role users see a static display with no dropdown.
  if (userRole === 'client') {
    return (
      <div className="w-full flex items-center gap-2.5">
        {currentAccount ? (
          <AccountSwitcherAvatar account={currentAccount} accountKey={currentKey} />
        ) : (
          <div className="w-7 h-7 rounded-md bg-[var(--sidebar-muted)] flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[var(--sidebar-foreground)] truncate">
            {currentAccount?.dealer || currentKey || 'Your Sub-Account'}
          </p>
          {currentAccount && getAccountAddress(currentAccount) && (
            <p className="text-[10px] text-[var(--sidebar-muted-foreground)] truncate leading-tight">
              {getAccountAddress(currentAccount)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Trigger */}
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border border-[var(--sidebar-border)] bg-[var(--sidebar-input)] hover:bg-[var(--sidebar-muted)] transition-colors text-left"
      >
        {isAdmin ? (
          <div className="w-7 h-7 rounded-md bg-[var(--primary)]/15 flex items-center justify-center flex-shrink-0">
            <ShieldCheckIcon className="w-3.5 h-3.5 text-[var(--primary)]" />
          </div>
        ) : currentAccount ? (
          <AccountSwitcherAvatar account={currentAccount} accountKey={currentKey} />
        ) : (
          <div className="w-7 h-7 rounded-md bg-[var(--sidebar-muted)] flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[var(--sidebar-foreground)] truncate">
            {isAdmin ? 'Admin Account' : currentAccount?.dealer || currentKey || 'Select sub-account'}
          </p>
          {!isAdmin && currentAccount && (
            <p className="text-[10px] text-[var(--sidebar-muted-foreground)] truncate leading-tight">
              {getAccountAddress(currentAccount)}
            </p>
          )}
        </div>
        <ChevronUpDownIcon className="w-3.5 h-3.5 text-[var(--sidebar-muted-foreground)] flex-shrink-0" />
      </button>

      {/* Portal dropdown */}
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[200] w-72 rounded-xl glass-dropdown overflow-hidden animate-fade-in-up"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* Search */}
          <div className="p-1.5 border-b border-[var(--border)]">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)]" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search sub-accounts..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--input)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>

          {/* Admin option */}
          {canSwitchToAdmin && !search && (
            <div className="p-1 border-b border-[var(--border)]">
              <button
                onClick={() => handleSelect('__admin__')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                  isAdmin ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--muted)]'
                }`}
              >
                <div className="w-7 h-7 rounded-md bg-[var(--primary)]/15 flex items-center justify-center flex-shrink-0">
                  <ShieldCheckIcon className="w-3.5 h-3.5 text-[var(--primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[var(--foreground)]">Admin Account</p>
                  <p className="text-[10px] text-[var(--muted-foreground)] leading-tight">Manage all sub-accounts & templates</p>
                </div>
                {isAdmin && <CheckIcon className="w-3.5 h-3.5 text-[var(--primary)] flex-shrink-0" />}
              </button>
            </div>
          )}

          {/* Account list */}
          <div className="max-h-[320px] overflow-y-auto p-1">
            {!accountsLoaded ? (
              <p className="text-xs text-[var(--muted-foreground)] text-center py-4">Loading...</p>
            ) : filteredAccounts.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)] text-center py-4">
                {search ? 'No sub-accounts match your search' : 'No sub-accounts available'}
              </p>
            ) : (
              filteredAccounts.map(([key, accountData]) => {
                const selected = currentKey === key;
                return (
                  <button
                    key={key}
                    onClick={() => handleSelect(key)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                      selected ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--muted)]'
                    }`}
                  >
                    <AccountSwitcherAvatar account={accountData} accountKey={key} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[var(--foreground)] truncate">
                        {accountData.dealer || key}
                      </p>
                      {getAccountAddress(accountData) && (
                        <p className="text-[10px] text-[var(--muted-foreground)] truncate leading-tight">
                          {getAccountAddress(accountData)}
                        </p>
                      )}
                    </div>
                    {selected && <CheckIcon className="w-3.5 h-3.5 text-[var(--primary)] flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function AccountSwitcherAvatar({ account, accountKey }: { account: AccountData; accountKey: string | null }) {
  return (
    <AccountAvatar
      name={account.dealer}
      accountKey={accountKey || account.dealer}
      storefrontImage={account.storefrontImage}
      logos={account.logos}
      size={28}
      className="w-7 h-7 rounded-md object-cover flex-shrink-0 border border-[var(--border)]"
    />
  );
}
