'use client';

import { useState, useMemo } from 'react';
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { useAccount } from '@/contexts/account-context';
import { AccountAvatar } from '@/components/account-avatar';
import { toast } from '@/lib/toast';

interface CloneToAccountsModalProps {
  open: boolean;
  onClose: () => void;
  templateDesign: string;
  templateName: string;
}

export function CloneToAccountsModal({
  open,
  onClose,
  templateDesign,
  templateName,
}: CloneToAccountsModalProps) {
  const { accounts, userRole } = useAccount();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [cloning, setCloning] = useState(false);

  const allAccountKeys = useMemo(() => {
    return Object.keys(accounts).filter((k) => !k.startsWith('_'));
  }, [accounts]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allAccountKeys;
    const q = search.toLowerCase();
    return allAccountKeys.filter((k) => {
      const acct = accounts[k];
      return (
        k.toLowerCase().includes(q) ||
        acct?.dealer?.toLowerCase().includes(q) ||
        acct?.city?.toLowerCase().includes(q) ||
        acct?.state?.toLowerCase().includes(q)
      );
    });
  }, [allAccountKeys, accounts, search]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(filtered));
  };

  const clearAll = () => {
    setSelected(new Set());
  };

  const handleClone = async () => {
    if (selected.size === 0) return;
    setCloning(true);
    try {
      const res = await fetch('/api/templates/clone-to-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceDesign: templateDesign,
          accountKeys: Array.from(selected),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to clone');
        setCloning(false);
        return;
      }
      const msg =
        data.errors?.length > 0
          ? `Cloned to ${data.created} account${data.created !== 1 ? 's' : ''}, ${data.errors.length} failed`
          : `Cloned to ${data.created} account${data.created !== 1 ? 's' : ''}`;
      if (data.errors?.length > 0) toast.error(msg);
      else toast.success(msg);
      onClose();
      setSelected(new Set());
      setSearch('');
    } catch {
      toast.error('Failed to clone');
    }
    setCloning(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="glass-modal w-[540px] max-w-[calc(100vw-3rem)] flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold">Clone to Accounts</h3>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5 truncate max-w-[360px]">
              {templateName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Search + bulk actions */}
        <div className="px-5 pt-4 pb-2 flex-shrink-0">
          <div className="relative mb-3">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts..."
              autoFocus
              className="w-full text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            />
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
            <span>
              {selected.size} of {allAccountKeys.length} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="hover:text-[var(--foreground)] transition-colors"
              >
                Select all
              </button>
              <span>·</span>
              <button
                onClick={clearAll}
                className="hover:text-[var(--foreground)] transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Account list */}
        <div className="flex-1 overflow-y-auto px-5 py-2 min-h-0">
          <div className="space-y-1">
            {filtered.map((k) => {
              const acct = accounts[k];
              const isSelected = selected.has(k);
              const location = [acct?.city, acct?.state]
                .filter(Boolean)
                .join(', ');

              return (
                <button
                  key={k}
                  onClick={() => toggle(k)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                    isSelected
                      ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                      : 'border-[var(--border)] hover:border-[var(--primary)] bg-[var(--card)] hover:bg-[var(--primary)]/5'
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-[var(--primary)] border-[var(--primary)]'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    {isSelected && (
                      <CheckIcon className="w-3.5 h-3.5 text-white" />
                    )}
                  </div>

                  <AccountAvatar
                    name={acct?.dealer || k}
                    accountKey={k}
                    storefrontImage={acct?.storefrontImage}
                    logos={acct?.logos}
                    size={32}
                    className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-[var(--border)]"
                  />
                  <div className="min-w-0">
                    <span className="block text-sm font-medium truncate">
                      {acct?.dealer || k}
                    </span>
                    {location && (
                      <span className="block text-[11px] text-[var(--muted-foreground)] truncate">
                        {location}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}

            {filtered.length === 0 && (
              <p className="text-sm text-[var(--muted-foreground)] text-center py-8">
                No accounts match your search.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--border)] flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleClone}
            disabled={selected.size === 0 || cloning}
            className="px-4 py-2 text-sm rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cloning
              ? 'Cloning...'
              : `Clone to ${selected.size} Account${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
