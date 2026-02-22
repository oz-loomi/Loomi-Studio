'use client';

import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AdminOnly } from '@/components/route-guard';
import { useAccount } from '@/contexts/account-context';
import { UserAvatar } from '@/components/user-avatar';
import { safeJson } from '@/lib/safe-json';
import { toast } from '@/lib/toast';
import { ArrowLeftIcon, ArrowUpTrayIcon, TrashIcon } from '@heroicons/react/24/outline';

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

interface User {
  id: string;
  name: string;
  title: string | null;
  email: string;
  avatarUrl: string | null;
  role: string;
  accountKeys: string[];
  createdAt: string;
}

const roleColors: Record<string, string> = {
  developer: 'text-purple-400 bg-purple-500/10',
  admin: 'text-blue-400 bg-blue-500/10',
  client: 'text-green-400 bg-green-500/10',
};

export default function UserDetailPage() {
  return (
    <AdminOnly>
      <UserDetailContent />
    </AdminOnly>
  );
}

function UserDetailContent() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, update } = useSession();
  const userId = params.id as string;
  const { accounts, accountsLoaded } = useAccount();
  const usersBasePath = pathname.startsWith('/settings/users') ? '/settings/users' : '/users';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('client');
  const [accountKeys, setAccountKeys] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(r => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then((data: User) => {
        setUser(data);
        setName(data.name);
        setTitle(data.title ?? '');
        setEmail(data.email);
        setAvatarUrl(data.avatarUrl ?? null);
        setRole(data.role);
        setAccountKeys(data.accountKeys || []);
      })
      .catch(() => toast.error('User not found'))
      .finally(() => setLoading(false));
  }, [userId]);

  const toggleAccountKey = (key: string) => {
    setAccountKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        id: userId,
        name,
        title,
        email,
        role,
        accountKeys,
      };
      if (password) body.password = password;

      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const { ok: saveOk, data: updated, error: saveError } = await safeJson<User>(res);
      if (!saveOk || !updated) {
        throw new Error(saveError || 'Failed to update user');
      }
      setUser(updated);
      setName(updated.name);
      setTitle(updated.title ?? '');
      setEmail(updated.email);
      setRole(updated.role);
      setAccountKeys(updated.accountKeys || []);
      setPassword('');
      if (session?.user.id === userId) {
        await update({
          name: updated.name,
          email: updated.email,
          title: updated.title ?? null,
        });
      }
      toast.success('User updated');
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/users?id=${userId}`, { method: 'DELETE' });
      const { ok: delOk, error: delError } = await safeJson(res);
      if (!delOk) {
        throw new Error(delError || 'Failed to delete');
      }
      toast.success('User deleted');
      router.push(usersBasePath);
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    }
  };

  const handleSendInvite = async () => {
    setSendingInvite(true);
    try {
      const res = await fetch('/api/users/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const { ok: invOk, error: invError } = await safeJson(res);
      if (!invOk) {
        throw new Error(invError || 'Failed to send invite');
      }
      toast.success('Invite email sent');
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setSendingInvite(false);
    }
  };

  async function handleAvatarUpload(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Please upload PNG, JPG, or WebP');
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      toast.error('Image must be 5MB or smaller');
      return;
    }

    setAvatarLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/users/${userId}/avatar`, {
        method: 'POST',
        body: formData,
      });
      const { ok, data, error } = await safeJson<{ avatarUrl: string }>(res);
      if (!ok || !data) {
        throw new Error(error || 'Upload failed');
      }

      setAvatarUrl(data.avatarUrl);
      setUser(prev => prev ? { ...prev, avatarUrl: data.avatarUrl } : prev);
      if (session?.user.id === userId) {
        await update({ avatarUrl: data.avatarUrl });
      }
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setAvatarLoading(false);
    }
  }

  async function handleAvatarInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await handleAvatarUpload(file);
  }

  async function handleRemoveAvatar() {
    setAvatarLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}/avatar`, { method: 'DELETE' });
      const { ok, error } = await safeJson(res);
      if (!ok) {
        throw new Error(error || 'Could not remove photo');
      }

      setAvatarUrl(null);
      setUser(prev => prev ? { ...prev, avatarUrl: null } : prev);
      if (session?.user.id === userId) {
        await update({ avatarUrl: null });
      }
      toast.success('Profile photo removed');
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setAvatarLoading(false);
    }
  }

  if (loading) {
    return <div className="text-[var(--muted-foreground)]">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="text-center py-16">
        <p className="text-[var(--muted-foreground)]">User not found</p>
        <Link href={usersBasePath} className="text-sm text-[var(--primary)] mt-2 inline-block hover:underline">
          Back to Users
        </Link>
      </div>
    );
  }

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
        <div className="relative">
          <UserAvatar
            name={name || user.name}
            email={email || user.email}
            avatarUrl={avatarUrl}
            size={56}
            className="w-14 h-14 rounded-full object-cover"
          />
          {avatarLoading && (
            <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold truncate">{name || user.name}</h2>
          {(title || user.title) && (
            <p className="text-sm text-[var(--muted-foreground)] truncate">{title || user.title}</p>
          )}
          <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <span>{email || user.email}</span>
            <span className={`text-[10px] font-medium uppercase tracking-wider rounded px-1.5 py-0.5 ${roleColors[user.role] || ''}`}>
              {user.role}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSendInvite}
            disabled={sendingInvite}
            className="px-3.5 py-2 border border-[var(--border)] rounded-lg text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50 transition-colors"
          >
            {sendingInvite ? 'Sending...' : 'Send Invite'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name || !email}
            className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="max-w-2xl space-y-10">

        {/* General */}
        <section>
          <h3 className={sectionHeadingClass}>General</h3>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Profile Photo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={handleAvatarInputChange}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
                >
                  <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                  {avatarLoading ? 'Updating...' : avatarUrl ? 'Change Photo' : 'Upload Photo'}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={avatarLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                    Remove
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className={labelClass}>Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Marketing Manager"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>
                Password <span className="text-[var(--muted-foreground)] font-normal">(leave blank to keep current)</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Leave blank to keep current"
                className={inputClass}
              />
            </div>
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

        {/* Info */}
        <section>
          <h3 className={sectionHeadingClass}>Info</h3>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>User ID</label>
              <div className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)] font-mono">
                {user.id}
              </div>
            </div>
            <div>
              <label className={labelClass}>Created</label>
              <div className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]">
                {new Date(user.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="border-t border-red-500/20 pt-6">
          <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-3">Danger Zone</h3>
          <div className="flex items-center justify-between p-4 border border-red-500/20 rounded-xl">
            <div>
              <p className="text-sm font-medium">Delete this user</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Permanently remove {name} and revoke their access.
              </p>
            </div>
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-colors flex-shrink-0"
            >
              Delete User
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
