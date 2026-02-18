'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppLogo } from '@/components/app-logo';

interface InvitePreview {
  user: {
    name: string;
    email: string;
    role: string;
  };
  expiresAt: string;
}

export default function OnboardingPage() {
  const searchParams = useSearchParams();
  const token = (searchParams.get('token') || '').trim();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      if (!token) {
        setError('Invite token is missing.');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/onboarding/invite/validate?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invite is invalid or expired');
        if (!cancelled) setInvite(data as InvitePreview);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Invite is invalid or expired');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInvite();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const loginHref = useMemo(() => {
    if (!invite?.user.email) return '/login';
    return `/login?email=${encodeURIComponent(invite.user.email)}`;
  }, [invite?.user.email]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password.trim().length < 10) {
      setError('Password must be at least 10 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/onboarding/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to activate your account');

      setSuccess(true);
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to activate your account');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-modal w-full max-w-md p-8 text-center text-sm text-[var(--muted-foreground)]">
          Validating your invite...
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-modal w-full max-w-md p-8 text-center">
          <h1 className="inline-flex justify-center mb-6">
            <AppLogo className="h-9 w-auto max-w-[200px] object-contain" />
          </h1>
          <h2 className="text-xl font-semibold mb-2">Account Activated</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-6">
            Your password has been set. You can now sign in to Loomi Studio.
          </p>
          <Link
            href={loginHref}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Continue to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-modal w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="inline-flex justify-center mb-3">
            <AppLogo className="h-9 w-auto max-w-[200px] object-contain" />
          </h1>
          <h2 className="text-xl font-semibold">Create Your Password</h2>
          {invite ? (
            <p className="text-xs text-[var(--muted-foreground)] mt-2">
              {invite.user.name} ({invite.user.email})
            </p>
          ) : (
            <p className="text-xs text-[var(--muted-foreground)] mt-2">
              Complete your invite to access Loomi Studio.
            </p>
          )}
        </div>

        {error && (
          <div className="text-sm text-[var(--destructive)] bg-[var(--destructive)]/10 rounded-xl px-4 py-2.5 text-center mb-4">
            {error}
          </div>
        )}

        {!invite ? (
          <div className="text-center">
            <Link href="/login" className="text-sm text-[var(--primary)] hover:underline">
              Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={10}
                className="w-full bg-[var(--input)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="At least 10 characters"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={10}
                className="w-full bg-[var(--input)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="Re-enter password"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] rounded-xl px-4 py-2.5 text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[var(--background)] disabled:opacity-50 mt-2"
            >
              {submitting ? 'Activating...' : 'Activate Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
