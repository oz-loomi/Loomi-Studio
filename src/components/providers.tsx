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
      toastOptions={{
        style: theme === 'dark'
          ? {
              background: '#18181b',
              border: '1px solid #27272a',
              color: '#fafafa',
            }
          : {
              background: '#ffffff',
              border: '1px solid #e4e4e7',
              color: '#09090b',
            },
      }}
    />
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
        </AccountProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
