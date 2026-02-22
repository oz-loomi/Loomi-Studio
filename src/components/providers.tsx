'use client';

import { SessionProvider } from 'next-auth/react';
import { AccountProvider } from '@/contexts/account-context';
import { ThemeProvider, useTheme } from '@/contexts/theme-context';
import { Toaster } from 'sonner';
import { AiBubble } from '@/components/ai-bubble';

function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      visibleToasts={3}
      closeButton
      toastOptions={{
        style: theme === 'dark'
          ? {
              background: 'rgba(24, 24, 27, 0.85)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid #27272a',
              color: '#fafafa',
            }
          : {
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid #e4e4e7',
              color: '#09090b',
            },
      }}
    />
  );
}

/** Dev-only floating theme toggle — always visible */
function DevThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      onClick={toggleTheme}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      className="fixed bottom-4 left-4 z-50 w-8 h-8 rounded-full flex items-center justify-center border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--muted-foreground)] transition-colors shadow-lg text-sm"
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <AccountProvider>
          {children}
          <ThemedToaster />
          <AiBubble />
          <DevThemeToggle />
        </AccountProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
