'use client';

import { SessionProvider } from 'next-auth/react';
import { AccountProvider } from '@/contexts/account-context';
import { ThemeProvider, useTheme } from '@/contexts/theme-context';
import { UnsavedChangesProvider } from '@/contexts/unsaved-changes-context';
import { Toaster } from 'sonner';
import { AiBubble } from '@/components/ai-bubble';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';

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

/** Dev-only floating theme toggle — sits above the Next.js dev indicator */
function DevThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      onClick={toggleTheme}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      className="fixed bottom-[64px] left-5 z-[2147483646] w-9 h-9 rounded-full flex items-center justify-center bg-black/80 text-white/90 hover:bg-black/90 hover:text-white transition-colors text-sm cursor-pointer"
      style={{ backdropFilter: 'blur(8px)' }}
    >
      {isDark ? <SunIcon className="w-4.5 h-4.5" /> : <MoonIcon className="w-4.5 h-4.5" />}
    </button>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <AccountProvider>
          <UnsavedChangesProvider>
            {children}
            <ThemedToaster />
            <AiBubble />
            <DevThemeToggle />
          </UnsavedChangesProvider>
        </AccountProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
