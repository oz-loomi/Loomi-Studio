'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminOnly } from '@/components/route-guard';
import { useAccount } from '@/contexts/account-context';
import { toast } from 'sonner';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function NewUserPage() {
  return (
    <AdminOnly>
      <NewUserContent />
    </AdminOnly>
  );
}

function NewUserContent() {
  const router = useRouter();
  const pathname = usePathname();
  const { accounts, accountsLoaded } = useAccount();
  const usersBasePath = pathname.startsWith('/settings/users') ? '/settings/users' : '/users';

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sendInvite, setSendInvite] = useState(true);
  const [role, setRole] = useState('client');
  const [accountKeys, setAccountKeys] = useState<string[]>([]);

  const toggleAccountKey = (key: string) => {
    setAccountKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleCreate = async () => {
    if (!sendInvite && !password) {
      toast.error('Password is required');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name,
        title,
        email,
        role,
        accountKeys,
        sendInvite,
      };
      if (!sendInvite) body.password = password;

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create user');
      }
      const user = await res.json();
      if (sendInvite) {
        if (user?.invite?.sent) {
          toast.success('User created and invite email sent');
        } else {
          toast.error(user?.invite?.error || 'User created, but invite email could not be sent');
        }
      } else {
        toast.success('User created');
      }
      router.push(`${usersBasePath}/${user.id}`);
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--card)] focus:outline-none focus:border-[var(--primary)]';
  const labelClass = 'block text-xs font-medium text-[var(--muted-foreground)] mb-1.5';
  const sectionHeadingClass = 'text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-4';

  return (
    <div>
      {/* Header */}
      <div className="page-sticky-header flex items-center gap-3 mb-8">
        <Link
          href={usersBasePath}
          className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold">New User</h2>
          <p className="text-xs text-[var(--muted-foreground)]">Create a new team member account</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={saving || !name || !email || (!sendInvite && !password)}
          className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? 'Creating...' : sendInvite ? 'Create & Send Invite' : 'Create User'}
        </button>
      </div>

      <div className="max-w-2xl space-y-10">

        {/* General */}
        <section>
          <h3 className={sectionHeadingClass}>General</h3>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} autoFocus />
            </div>
            <div>
              <label className={labelClass}>Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className={inputClass}
                placeholder="e.g. Marketing Manager"
              />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3.5">
              <label className={`${labelClass} mb-2`}>Onboarding</label>
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-[var(--border)] bg-[var(--input)]"
                />
                <span className="text-[var(--foreground)]">
                  Send invite email so the user creates their own password
                  <span className="block text-xs text-[var(--muted-foreground)] mt-0.5">
                    Recommended for team onboarding.
                  </span>
                </span>
              </label>
            </div>
            {!sendInvite && (
              <div>
                <label className={labelClass}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className={inputClass}
                />
              </div>
            )}
          </div>
        </section>

        {/* Role & Access */}
        <section>
          <h3 className={sectionHeadingClass}>Role & Access</h3>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Role</label>
              <select value={role} onChange={e => setRole(e.target.value)} className={inputClass}>
                <option value="developer">Developer</option>
                <option value="admin">Admin</option>
                <option value="client">Client</option>
              </select>
            </div>

            {(role === 'admin' || role === 'client') && (
              <div>
                <label className={labelClass}>Assigned Accounts</label>
                <p className="text-xs text-[var(--muted-foreground)] mb-2">
                  {role === 'admin' ? 'Admin can switch between these accounts' : 'Client will be locked to these'}
                </p>
                {accountsLoaded ? (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(accounts).map(([key, account]) => {
                      const selected = accountKeys.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleAccountKey(key)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                            selected
                              ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                              : 'bg-[var(--input)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--primary)]'
                          }`}
                        >
                          {account.dealer || key}
                        </button>
                      );
                    })}
                    {Object.keys(accounts).length === 0 && (
                      <p className="text-xs text-[var(--muted-foreground)]">No accounts available</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--muted-foreground)]">Loading accounts...</p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
