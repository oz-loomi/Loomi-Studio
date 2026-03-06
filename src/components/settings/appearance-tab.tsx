'use client';

import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/theme-context';

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  const options: { value: 'dark' | 'light'; label: string; icon: typeof SunIcon; description: string }[] = [
    { value: 'dark', label: 'Dark', icon: MoonIcon, description: 'Dark background with light text' },
    { value: 'light', label: 'Light', icon: SunIcon, description: 'Light background with dark text' },
  ];
  const sectionCardClass = 'glass-section-card rounded-xl p-6';

  return (
    <div className="max-w-4xl">
      <section className={sectionCardClass}>
        <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Theme</h3>
        <p className="text-sm text-[var(--muted-foreground)] mb-6">
          Choose how Loomi Studio looks to you.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {options.map(opt => {
            const isActive = theme === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                  isActive
                    ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                    : 'border-[var(--border)] hover:border-[var(--muted-foreground)]'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isActive ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                }`}>
                  <opt.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className={`text-sm font-medium ${isActive ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}`}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">{opt.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
