import Link from 'next/link';
import {
  EnvelopeIcon,
  HomeIcon,
} from '@heroicons/react/24/outline';

export default function NotFound() {
  return (
    <section className="relative flex min-h-[calc(100vh-9rem)] items-center justify-center py-10 sm:py-14">
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-72 w-[min(92vw,52rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.28)_0%,rgba(99,102,241,0.14)_30%,rgba(56,100,220,0.08)_52%,transparent_74%)] blur-3xl" />

      <div className="glass-panel animate-fade-in-up relative w-full max-w-3xl overflow-hidden rounded-3xl p-7 sm:p-10">
        <div className="animate-fade-in-up animate-stagger-2 inline-flex items-center gap-2 rounded-full border border-[var(--primary)]/40 bg-[var(--primary)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
          <span>404</span>
          <span className="h-1 w-1 rounded-full bg-[var(--primary)]/70" />
          <span>Page Missing</span>
        </div>

        <h1 className="animate-fade-in-up animate-stagger-3 mt-5 text-3xl font-semibold leading-tight tracking-tight text-[var(--foreground)] sm:text-4xl">
          This route fell out of the Loomi flow.
        </h1>

        <p className="animate-fade-in-up animate-stagger-4 mt-4 max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-base">
          The page you requested either moved or never existed. Jump back to
          your dashboard or head to templates to keep building.
        </p>

        <div className="animate-fade-in-up animate-stagger-5 mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-[var(--primary-foreground)] shadow-[0_8px_30px_rgba(99,102,241,0.35)] transition hover:brightness-110"
          >
            <HomeIcon className="h-4 w-4" />
            Go to Dashboard
          </Link>

          <Link
            href="/templates"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--muted)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--primary)]/50 hover:bg-[var(--accent)]"
          >
            <EnvelopeIcon className="h-4 w-4" />
            Open Templates
          </Link>
        </div>

        <p className="animate-fade-in-up animate-stagger-6 mt-6 text-xs text-[var(--muted-foreground)]">
          Tip: use the help icon in the top-right if you need guidance.
        </p>
      </div>
    </section>
  );
}
