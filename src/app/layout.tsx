import './globals.css';
import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import { LayoutShell } from '@/components/layout-shell';

export const metadata: Metadata = {
  title: 'Loomi Studio',
  description: 'Visual email template editor for Loomi',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen">
        <Providers>
          <LayoutShell>
            {children}
          </LayoutShell>
        </Providers>
      </body>
    </html>
  );
}
