'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  LinkIcon,
  EnvelopeIcon,
  UserGroupIcon,
  ArrowRightIcon,
  ExclamationTriangleIcon,
  SignalIcon,
  SignalSlashIcon,
} from '@heroicons/react/24/outline';
import { AccountAvatar } from '@/components/account-avatar';

// ── Types ──

interface AccountHealthProps {
  accounts: Record<string, { dealer: string; category?: string; storefrontImage?: string; logos?: { light?: string; dark?: string; white?: string; black?: string } }>;
  crmStats: Record<string, {
    dealer: string;
    contactCount: number | null;
    connected: boolean;
    error?: string;
  }>;
  emailsByAccount: Record<string, { total: number; active: number; draft: number }>;
  loading?: boolean;
}

// ── Component ──

export function AccountHealthGrid({ accounts, crmStats, emailsByAccount, loading }: AccountHealthProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (!loading && Object.keys(accounts).length > 0) {
      const timer = setTimeout(() => setAnimated(true), 100);
      return () => clearTimeout(timer);
    }
  }, [loading, accounts]);

  const entries = Object.entries(accounts).sort((a, b) => {
    const aConnected = crmStats[a[0]]?.connected ?? false;
    const bConnected = crmStats[b[0]]?.connected ?? false;
    if (aConnected !== bConnected) return aConnected ? -1 : 1;
    const aContacts = crmStats[a[0]]?.contactCount ?? -1;
    const bContacts = crmStats[b[0]]?.contactCount ?? -1;
    if (aContacts !== bContacts) return bContacts - aContacts;
    return a[1].dealer.localeCompare(b[1].dealer);
  });

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="glass-card rounded-xl p-4 animate-pulse">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-[var(--muted)] rounded-lg" />
              <div className="flex-1">
                <div className="w-24 h-4 bg-[var(--muted)] rounded mb-1" />
                <div className="w-16 h-3 bg-[var(--muted)] rounded" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="w-full h-8 bg-[var(--muted)] rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) return null;

  // Compute max contacts for relative bar sizing
  const maxContacts = Math.max(
    ...Object.values(crmStats).map(s => s.contactCount ?? 0),
    1,
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {entries.map(([key, account], i) => {
        const crm = crmStats[key];
        const emails = emailsByAccount[key] || { total: 0, active: 0, draft: 0 };
        const connected = crm?.connected ?? false;
        const contacts = crm?.contactCount ?? null;
        const contactBarPct = contacts !== null ? (contacts / maxContacts) * 100 : 0;

        return (
          <Link
            key={key}
            href={`/accounts/${key}`}
            className={`group glass-card rounded-xl p-4 transition-all duration-200 hover:ring-1 hover:ring-[var(--primary)]/30 animate-fade-in-up`}
            style={{
              animationDelay: `${Math.min(i, 11) * 50}ms`,
              opacity: animated ? 1 : 0,
              transition: 'opacity 0.4s ease',
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-3">
              <AccountAvatar
                name={account.dealer}
                accountKey={key}
                storefrontImage={account.storefrontImage}
                logos={account.logos}
                size={40}
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-[var(--border)]"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold truncate">{account.dealer}</p>
                  <ArrowRightIcon className="w-3 h-3 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
                <div className="flex items-center gap-1.5">
                  {connected ? (
                    <SignalIcon className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <SignalSlashIcon className="w-3 h-3 text-[var(--muted-foreground)] flex-shrink-0" />
                  )}
                  <span className={`text-[10px] ${connected ? 'text-emerald-400' : 'text-[var(--muted-foreground)]'}`}>
                    {connected ? 'Connected' : 'Not connected'}
                  </span>
                  {crm?.error && (
                    <ExclamationTriangleIcon className="w-3 h-3 text-amber-400 flex-shrink-0" title={crm.error} />
                  )}
                </div>
              </div>
            </div>

            {/* Mini stats row */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MiniStat
                icon={UserGroupIcon}
                value={contacts !== null ? contacts.toLocaleString() : '—'}
                label="Contacts"
                color="text-cyan-400"
              />
              <MiniStat
                icon={EnvelopeIcon}
                value={emails.total}
                label="Emails"
                color="text-blue-400"
              />
              <MiniStat
                icon={LinkIcon}
                value={emails.active}
                label="Active"
                color="text-green-400"
              />
            </div>

            {/* Contact bar indicator */}
            {contacts !== null && contacts > 0 && (
              <div className="h-1.5 rounded-full bg-[var(--muted)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: animated ? `${Math.max(contactBarPct, 2)}%` : '0%',
                    background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
                    opacity: 0.75,
                    transitionDelay: `${i * 50}ms`,
                  }}
                />
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// ── Sub-components ──

function MiniStat({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number | string;
  label: string;
  color: string;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center mb-0.5">
        <Icon className={`w-3 h-3 ${color}`} />
      </div>
      <p className="text-sm font-bold tabular-nums">{value}</p>
      <p className="text-[9px] text-[var(--muted-foreground)]">{label}</p>
    </div>
  );
}
