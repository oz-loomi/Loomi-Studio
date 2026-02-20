'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  MagnifyingGlassIcon,
  CheckIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { UserAvatar } from '@/components/user-avatar';

export interface UserPickerUser {
  id: string;
  name: string;
  title?: string | null;
  email: string;
  avatarUrl?: string | null;
}

interface UserPickerProps {
  value: string | null;
  onChange: (userId: string | null) => void;
  users: UserPickerUser[];
  placeholder?: string;
  compact?: boolean;
}

export function UserPicker({
  value,
  onChange,
  users,
  placeholder = 'Assign rep...',
  compact = false,
}: UserPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedUser = value ? users.find((u) => u.id === value) ?? null : null;

  // Position dropdown when opening
  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownHeight = 340;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const placeAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
      setPos({
        top: placeAbove ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
        left: Math.min(rect.left, window.innerWidth - 272),
      });
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
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

  const handleSelect = (userId: string | null) => {
    onChange(userId);
    setOpen(false);
    setSearch('');
  };

  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.title || '').toLowerCase().includes(q)
    );
  });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={`flex items-center gap-2 rounded-lg border border-[var(--border)] transition-colors text-left hover:bg-[var(--muted)]/50 ${
          compact ? 'px-2 py-1' : 'px-3 py-2'
        } ${open ? 'ring-1 ring-[var(--primary)]' : ''}`}
      >
        {selectedUser ? (
          <>
            <UserAvatar
              name={selectedUser.name}
              email={selectedUser.email}
              avatarUrl={selectedUser.avatarUrl}
              size={compact ? 20 : 24}
              className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} rounded-full object-cover flex-shrink-0`}
            />
            <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium truncate max-w-[120px]`}>
              {selectedUser.name}
            </span>
          </>
        ) : (
          <>
            <UserIcon className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-[var(--muted-foreground)]`} />
            <span className={`${compact ? 'text-xs' : 'text-sm'} text-[var(--muted-foreground)]`}>
              {placeholder}
            </span>
          </>
        )}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[200] w-64 rounded-xl glass-dropdown overflow-hidden animate-fade-in-up"
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
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--input)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>

          {/* None / unassign option */}
          {!search && (
            <div className="p-1 border-b border-[var(--border)]">
              <button
                onClick={() => handleSelect(null)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                  !value ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--muted)]'
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-[var(--muted)] flex items-center justify-center flex-shrink-0">
                  <XMarkIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                </div>
                <span className="text-xs text-[var(--muted-foreground)]">No rep assigned</span>
                {!value && <CheckIcon className="w-3.5 h-3.5 text-[var(--primary)] flex-shrink-0 ml-auto" />}
              </button>
            </div>
          )}

          {/* User list */}
          <div className="max-h-[260px] overflow-y-auto p-1">
            {filteredUsers.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)] text-center py-4">
                {search ? 'No users match your search' : 'No users available'}
              </p>
            ) : (
              filteredUsers.map((user) => {
                const selected = value === user.id;
                return (
                  <button
                    key={user.id}
                    onClick={() => handleSelect(user.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                      selected ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--muted)]'
                    }`}
                  >
                    <UserAvatar
                      name={user.name}
                      email={user.email}
                      avatarUrl={user.avatarUrl}
                      size={28}
                      className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[var(--foreground)] truncate">
                        {user.name}
                      </p>
                      {user.title && (
                        <p className="text-[10px] text-[var(--muted-foreground)] truncate leading-tight">
                          {user.title}
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
        document.body,
      )}
    </>
  );
}
