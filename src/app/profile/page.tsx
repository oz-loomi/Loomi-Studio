'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { toast } from '@/lib/toast';
import { useAccount } from '@/contexts/account-context';
import { UserAvatar } from '@/components/user-avatar';
import { safeJson } from '@/lib/safe-json';
import {
  EnvelopeIcon,
  ShieldCheckIcon,
  KeyIcon,
  ArrowUpTrayIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

const roleColors: Record<string, string> = {
  developer: 'text-purple-400 bg-purple-500/10',
  admin: 'text-blue-400 bg-blue-500/10',
  client: 'text-green-400 bg-green-500/10',
};

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export default function ProfilePage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const { accounts, accountsLoaded } = useAccount();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (!session?.user) return;
    setAvatarUrl(session.user.avatarUrl ?? null);
    setName(session.user.name || '');
    setTitle(session.user.title || '');
    setEmail(session.user.email || '');
  }, [session?.user?.avatarUrl, session?.user?.name, session?.user?.title, session?.user?.email]);

  if (status === 'loading') {
    return <div className="text-[var(--muted-foreground)]">Loading profile...</div>;
  }

  if (!session?.user) {
    return null;
  }

  const user = session.user;
  const inputClass = 'w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--card)] focus:outline-none focus:border-[var(--primary)]';
  const hasProfileChanges =
    name.trim() !== (user.name || '').trim() ||
    title.trim() !== (user.title || '').trim() ||
    email.trim() !== (user.email || '').trim() ||
    newPassword.trim().length > 0;

  async function handleProfileSave() {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      toast.error('Name is required');
      return;
    }
    if (!trimmedEmail) {
      toast.error('Email is required');
      return;
    }

    setSavingProfile(true);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          title,
          email: trimmedEmail,
          password: newPassword,
        }),
      });
      const { ok, data, error } = await safeJson<{ name: string; title?: string; email: string }>(res);

      if (!ok || !data) {
        throw new Error(error || 'Could not update profile');
      }

      setName(data.name);
      setTitle(data.title ?? '');
      setEmail(data.email);
      setNewPassword('');
      await update({
        name: data.name,
        title: data.title ?? null,
        email: data.email,
      });
      toast.success('Profile updated');
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : 'Could not update profile'));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAvatarUpload(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Please upload PNG, JPG, or WebP');
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      toast.error('Image must be 5MB or smaller');
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/users/me/avatar', {
        method: 'POST',
        body: formData,
      });

      const { ok, data, error } = await safeJson<{ avatarUrl: string }>(res);
      if (!ok || !data) {
        throw new Error(error || 'Upload failed');
      }

      setAvatarUrl(data.avatarUrl);
      await update({ avatarUrl: data.avatarUrl });
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : 'Upload failed'));
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleAvatarInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await handleAvatarUpload(file);
  }

  async function handleRemoveAvatar() {
    setUploadingAvatar(true);
    try {
      const res = await fetch('/api/users/me/avatar', { method: 'DELETE' });
      const { ok, error } = await safeJson(res);
      if (!ok) {
        throw new Error(error || 'Could not remove photo');
      }

      setAvatarUrl(null);
      await update({ avatarUrl: null });
      toast.success('Profile photo removed');
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : 'Could not remove photo'));
    } finally {
      setUploadingAvatar(false);
    }
  }

  return (
    <div className="max-w-3xl animate-fade-in-up">
      <div className="page-sticky-header mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Profile</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Your account details and access level
        </p>
      </div>

      <div className="glass-card rounded-2xl p-6 border border-[var(--border)] space-y-6">
        <div className="flex items-start gap-4">
          <div className="relative w-[4.5rem] h-[4.5rem] flex-shrink-0">
            <UserAvatar
              name={name || user.name}
              email={email || user.email}
              avatarUrl={avatarUrl}
              size={72}
              className="w-[4.5rem] h-[4.5rem] rounded-full object-cover"
            />
            {uploadingAvatar && (
              <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-semibold text-[var(--foreground)] truncate">{name || user.name || 'Unnamed user'}</p>
            {(title || user.title) && <p className="text-sm text-[var(--muted-foreground)] truncate">{title || user.title}</p>}
            <p className="text-sm text-[var(--muted-foreground)] truncate">{email || user.email}</p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={handleAvatarInputChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
              >
                <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                {uploadingAvatar ? 'Uploading...' : 'Upload Photo'}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={uploadingAvatar}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
              <button
                type="button"
                onClick={handleProfileSave}
                disabled={savingProfile || !hasProfileChanges}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
              <span className="text-[10px] text-[var(--muted-foreground)]">PNG, JPG, WebP up to 5MB</span>
            </div>
          </div>
          <span className={`text-[10px] font-medium uppercase tracking-wider rounded px-2 py-1 ${roleColors[user.role] || ''}`}>
            {user.role}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-3">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Name</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Your full name"
            />
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-3">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Email</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@example.com"
            />
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-3">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Title</p>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="e.g. Marketing Manager"
            />
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-3">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Role</p>
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="w-4 h-4 text-[var(--muted-foreground)]" />
              <p className="text-sm text-[var(--foreground)] capitalize">{user.role}</p>
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-3 md:col-span-2">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-1">New Password</p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
              placeholder="Leave blank to keep your current password"
            />
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-3">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-1">User ID</p>
            <div className="flex items-center gap-2">
              <KeyIcon className="w-4 h-4 text-[var(--muted-foreground)]" />
              <p className="text-sm text-[var(--foreground)] font-mono break-all">{user.id}</p>
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)] mb-2">Assigned Accounts</p>
          {user.accountKeys.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              {user.role === 'developer' || user.role === 'admin' ? 'Full access to all accounts.' : 'No assigned accounts.'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {user.accountKeys.map(key => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]"
                >
                  <EnvelopeIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                  {accountsLoaded ? (accounts[key]?.dealer || key) : key}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
