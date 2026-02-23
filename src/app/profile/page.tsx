'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { toast } from '@/lib/toast';
import { useAccount } from '@/contexts/account-context';
import { useUnsavedChanges } from '@/contexts/unsaved-changes-context';
import { UserAvatar } from '@/components/user-avatar';
import { safeJson } from '@/lib/safe-json';
import {
  EnvelopeIcon,
  ShieldCheckIcon,
  KeyIcon,
  ArrowUpTrayIcon,
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
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
  const { markClean } = useUnsavedChanges();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
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
  const inputClass = 'w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] focus:outline-none focus:border-[var(--primary)]';
  const labelClass = 'block text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5';
  const canViewRoleBadges =
    user.role === 'developer' || user.role === 'super_admin' || user.role === 'admin';
  const trimmedNewPassword = newPassword.trim();
  const trimmedConfirmPassword = confirmPassword.trim();
  const passwordChangeStarted = trimmedNewPassword.length > 0 || trimmedConfirmPassword.length > 0;
  const passwordConfirmationMissing = trimmedNewPassword.length > 0 && trimmedConfirmPassword.length === 0;
  const passwordMissingNew = trimmedConfirmPassword.length > 0 && trimmedNewPassword.length === 0;
  const passwordMismatch =
    trimmedNewPassword.length > 0
    && trimmedConfirmPassword.length > 0
    && newPassword !== confirmPassword;
  const passwordInvalid = passwordConfirmationMissing || passwordMissingNew || passwordMismatch;
  const hasProfileChanges =
    name.trim() !== (user.name || '').trim() ||
    title.trim() !== (user.title || '').trim() ||
    email.trim() !== (user.email || '').trim() ||
    passwordChangeStarted;

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
    if (passwordMissingNew) {
      toast.error('Enter a new password before confirming it');
      return;
    }
    if (passwordConfirmationMissing) {
      toast.error('Please confirm your new password');
      return;
    }
    if (passwordMismatch) {
      toast.error('Passwords do not match');
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
          password: trimmedNewPassword ? newPassword : '',
          confirmPassword: trimmedNewPassword ? confirmPassword : '',
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
      setConfirmPassword('');
      await update({
        name: data.name,
        title: data.title ?? null,
        email: data.email,
      });
      markClean();
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
    <div className="max-w-4xl animate-fade-in-up">
      <div className="page-sticky-header mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Profile</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Your account details and access level
          </p>
        </div>
        <button
          type="button"
          onClick={handleProfileSave}
          disabled={savingProfile || !hasProfileChanges || passwordInvalid}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex-shrink-0"
        >
          {savingProfile ? 'Saving...' : 'Save Profile'}
        </button>
      </div>

      <section className="pb-6 border-b border-[var(--border)]">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <div className="relative w-24 h-24 flex-shrink-0">
            <UserAvatar
              name={name || user.name}
              email={email || user.email}
              avatarUrl={avatarUrl}
              size={96}
              className="w-24 h-24 rounded-full object-cover"
            />
            {uploadingAvatar && (
              <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-2xl font-semibold text-[var(--foreground)] truncate">
                {name || user.name || 'Unnamed user'}
              </p>
              {canViewRoleBadges && (
                <span className={`text-[10px] font-medium uppercase tracking-wider rounded px-2 py-1 flex-shrink-0 ${roleColors[user.role] || ''}`}>
                  {user.role}
                </span>
              )}
            </div>
            {(title || user.title) && (
              <p className="text-sm text-[var(--muted-foreground)] truncate mt-0.5">
                {title || user.title}
              </p>
            )}
            <p className="text-sm text-[var(--muted-foreground)] truncate mt-0.5">
              {email || user.email}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
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
          <span className="text-[10px] text-[var(--muted-foreground)]">PNG, JPG, WebP up to 5MB</span>
        </div>
      </section>

      <section className="py-6 border-b border-[var(--border)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className={labelClass}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="e.g. Marketing Manager"
            />
          </div>

          <div>
            <label className={labelClass}>Role</label>
            <div className="h-[38px] px-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 flex items-center gap-2">
              <ShieldCheckIcon className="w-4 h-4 text-[var(--muted-foreground)]" />
              <p className="text-sm text-[var(--foreground)] capitalize">{user.role}</p>
            </div>
          </div>

          <div>
            <label className={labelClass}>New Password</label>
            <div className="relative">
              <input
                type={showPasswords ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={`${inputClass} pr-10`}
                placeholder="Leave blank to keep your current password"
              />
              <button
                type="button"
                onClick={() => setShowPasswords((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                title={showPasswords ? 'Hide password' : 'Show password'}
                aria-label={showPasswords ? 'Hide password' : 'Show password'}
              >
                {showPasswords ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className={labelClass}>Confirm Password</label>
            <div className="relative">
              <input
                type={showPasswords ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`${inputClass} pr-10`}
                placeholder="Re-enter new password"
              />
              <button
                type="button"
                onClick={() => setShowPasswords((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                title={showPasswords ? 'Hide password' : 'Show password'}
                aria-label={showPasswords ? 'Hide password' : 'Show password'}
              >
                {showPasswords ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
            {passwordMissingNew && (
              <p className="mt-1 text-[11px] text-red-400">Enter a new password first.</p>
            )}
            {passwordConfirmationMissing && !passwordMissingNew && (
              <p className="mt-1 text-[11px] text-red-400">Please confirm your new password.</p>
            )}
            {passwordMismatch && (
              <p className="mt-1 text-[11px] text-red-400">Passwords do not match.</p>
            )}
          </div>

          <div className="md:col-span-2 lg:col-span-1">
            <label className={labelClass}>User ID</label>
            <div className="min-h-[38px] px-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 flex items-center gap-2">
              <KeyIcon className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" />
              <p className="text-sm text-[var(--foreground)] font-mono break-all">{user.id}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="pt-6">
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
      </section>
    </div>
  );
}
