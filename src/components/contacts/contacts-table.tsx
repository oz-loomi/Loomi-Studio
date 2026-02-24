'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowPathIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

// ── Types ──

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  tags: string[];
  dateAdded: string;
  source: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleVin: string;
  vehicleMileage: string;
  lastServiceDate: string;
  nextServiceDate: string;
  leaseEndDate: string;
  warrantyEndDate: string;
  purchaseDate: string;
  hasReceivedMessage: boolean;
  hasReceivedEmail: boolean;
  hasReceivedSms: boolean;
  lastMessageDate: string;
  _accountKey?: string;
  _dealer?: string;
}

type SortKey = 'fullName' | 'email' | 'dateAdded' | '_dealer' | 'vehicleMake' | 'source';
type SortDir = 'asc' | 'desc';

interface ContactsTableProps {
  contacts: Contact[];
  loading: boolean;
  error: string | null;
  showAccountColumn?: boolean;
  /** For account-scoped views, pass the accountKey for detail navigation. */
  accountKey?: string;
}

// ── Helpers ──

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatRelativeDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const PAGE_SIZE = 50;

// ── Main Component ──

export function ContactsTable({
  contacts,
  loading,
  error,
  showAccountColumn,
  accountKey,
}: ContactsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('fullName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);

  // Sort
  const sorted = [...contacts].sort((a, b) => {
    let aVal = '';
    let bVal = '';
    switch (sortKey) {
      case 'fullName':
        aVal = (a.fullName || `${a.firstName} ${a.lastName}`).toLowerCase();
        bVal = (b.fullName || `${b.firstName} ${b.lastName}`).toLowerCase();
        break;
      case 'email':
        aVal = (a.email || '').toLowerCase();
        bVal = (b.email || '').toLowerCase();
        break;
      case 'dateAdded':
        aVal = a.dateAdded || '';
        bVal = b.dateAdded || '';
        break;
      case '_dealer':
        aVal = (a._dealer || '').toLowerCase();
        bVal = (b._dealer || '').toLowerCase();
        break;
      case 'vehicleMake':
        aVal = `${a.vehicleYear} ${a.vehicleMake} ${a.vehicleModel}`.toLowerCase();
        bVal = `${b.vehicleYear} ${b.vehicleMake} ${b.vehicleModel}`.toLowerCase();
        break;
      case 'source':
        aVal = (a.source || '').toLowerCase();
        bVal = (b.source || '').toLowerCase();
        break;
    }
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // Paginate
  const totalContacts = sorted.length;
  const totalPages = Math.ceil(totalContacts / PAGE_SIZE);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  }

  const isNotConnected = Boolean(error && /(not connected|no .*connection)/i.test(error));

  if (isNotConnected) {
    return (
      <div className="text-center py-16 border border-dashed border-[var(--border)] rounded-xl">
        <ExclamationTriangleIcon className="w-8 h-8 text-[var(--muted-foreground)] mx-auto mb-3" />
        <p className="text-[var(--muted-foreground)] text-sm font-medium">No ESP Connection</p>
        <p className="text-[var(--muted-foreground)] text-xs mt-1">
          Connect this account to an ESP provider to view contacts.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Error */}
      {error && !isNotConnected && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && contacts.length === 0 && (
        <div className="text-center py-16 text-[var(--muted-foreground)]">
          <ArrowPathIcon className="w-5 h-5 animate-spin mx-auto mb-2" />
          <p className="text-sm">Loading contacts...</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && contacts.length === 0 && (
        <div className="text-center py-16 border border-dashed border-[var(--border)] rounded-xl">
          <p className="text-[var(--muted-foreground)] text-sm">No contacts found.</p>
        </div>
      )}

      {/* Table */}
      {paged.length > 0 && (
        <div className="overflow-x-auto glass-table rounded-xl">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-[var(--muted)] border-b border-[var(--border)]">
                <SortHeader label="Name" sortKey="fullName" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Email" sortKey="email" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Phone</th>
                <SortHeader label="Vehicle" sortKey="vehicleMake" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Tags</th>
                <SortHeader label="Source" sortKey="source" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Added" sortKey="dateAdded" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                {showAccountColumn && (
                  <SortHeader label="Sub-Account" sortKey="_dealer" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                )}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {paged.map(contact => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  showAccountColumn={showAccountColumn}
                  accountKey={accountKey || contact._accountKey || ''}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-[var(--muted-foreground)]">
          <span>
            {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, totalContacts)} of {totalContacts.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded hover:bg-[var(--muted)] disabled:opacity-30 transition-colors"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span className="px-2">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded hover:bg-[var(--muted)] disabled:opacity-30 transition-colors"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sort Header ──

function SortHeader({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = currentKey === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className="text-left px-4 py-3 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider cursor-pointer hover:text-[var(--foreground)] transition-colors select-none"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          dir === 'asc' ? (
            <ChevronUpIcon className="w-3 h-3" />
          ) : (
            <ChevronDownIcon className="w-3 h-3" />
          )
        ) : (
          <ChevronUpDownIcon className="w-3 h-3 opacity-40" />
        )}
      </span>
    </th>
  );
}

// ── Contact Row ──

function ContactRow({
  contact,
  showAccountColumn,
  accountKey,
}: {
  contact: Contact;
  showAccountColumn?: boolean;
  accountKey: string;
}) {
  const router = useRouter();
  const vehicleStr = [contact.vehicleYear, contact.vehicleMake, contact.vehicleModel]
    .filter(Boolean)
    .join(' ');
  const detailAccountKey = contact._accountKey || accountKey;
  const canOpenDetail = Boolean(detailAccountKey);

  // Alert badges
  const alerts: { label: string; color: string }[] = [];
  if (contact.nextServiceDate) {
    const d = daysUntil(contact.nextServiceDate);
    if (d !== null && d < 0) {
      alerts.push({ label: 'Service overdue', color: 'bg-red-500/15 text-red-400' });
    }
  }
  if (contact.leaseEndDate) {
    const d = daysUntil(contact.leaseEndDate);
    if (d !== null && d >= 0 && d <= 90) {
      alerts.push({ label: `Lease: ${d}d`, color: 'bg-amber-500/15 text-amber-400' });
    }
  }
  if (contact.warrantyEndDate) {
    const d = daysUntil(contact.warrantyEndDate);
    if (d !== null && d >= 0 && d <= 90) {
      alerts.push({ label: `Warranty: ${d}d`, color: 'bg-amber-500/15 text-amber-400' });
    }
  }

  return (
    <>
      <tr
        onClick={() => {
          if (!detailAccountKey) return;
          router.push(`/contacts/${encodeURIComponent(contact.id)}?accountKey=${encodeURIComponent(detailAccountKey)}`);
        }}
        className={`border-b border-[var(--border)] transition-colors ${
          canOpenDetail
            ? 'hover:bg-[var(--muted)]/50 cursor-pointer'
            : 'cursor-default'
        }`}
      >
        {/* Name */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold bg-[var(--primary)]/10 text-[var(--primary)] flex-shrink-0">
              {(contact.firstName || contact.fullName || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {contact.fullName || `${contact.firstName} ${contact.lastName}`.trim() || 'Unknown'}
              </p>
              {alerts.length > 0 && (
                <div className="flex gap-1 mt-0.5">
                  {alerts.map((a, i) => (
                    <span key={i} className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${a.color}`}>
                      {a.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </td>
        {/* Email */}
        <td className="px-4 py-3 text-sm text-[var(--muted-foreground)] truncate max-w-[200px]">
          {contact.email || '—'}
        </td>
        {/* Phone */}
        <td className="px-4 py-3 text-sm text-[var(--muted-foreground)] whitespace-nowrap">
          {contact.phone || '—'}
        </td>
        {/* Vehicle */}
        <td className="px-4 py-3 text-sm text-[var(--muted-foreground)] truncate max-w-[180px]">
          {vehicleStr || '—'}
        </td>
        {/* Tags */}
        <td className="px-4 py-3">
          {contact.tags && contact.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 max-w-[160px]">
              {contact.tags.slice(0, 3).map(tag => (
                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] truncate max-w-[100px]">
                  {tag}
                </span>
              ))}
              {contact.tags.length > 3 && (
                <span className="text-[9px] text-[var(--muted-foreground)]">+{contact.tags.length - 3}</span>
              )}
            </div>
          ) : (
            <span className="text-sm text-[var(--muted-foreground)]">—</span>
          )}
        </td>
        {/* Source */}
        <td className="px-4 py-3 text-sm text-[var(--muted-foreground)] truncate max-w-[120px]">
          {contact.source || '—'}
        </td>
        {/* Date Added */}
        <td className="px-4 py-3 text-sm text-[var(--muted-foreground)] whitespace-nowrap">
          {contact.dateAdded ? formatRelativeDate(contact.dateAdded) : '—'}
        </td>
        {/* Account */}
        {showAccountColumn && (
          <td className="px-4 py-3 text-sm font-medium truncate max-w-[150px]">
            {contact._dealer || '—'}
          </td>
        )}
        {/* Expand indicator */}
        <td className="px-3 py-3">
          <ChevronRightIcon className={`w-4 h-4 ${canOpenDetail ? 'text-[var(--muted-foreground)]' : 'text-[var(--muted)]'}`} />
        </td>
      </tr>
    </>
  );
}
