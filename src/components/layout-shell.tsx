'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { TopUtilityBar } from '@/components/top-utility-bar';
import { stripSubaccountPrefix } from '@/lib/account-slugs';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const normalizedPath = stripSubaccountPrefix(pathname);
  const mainRef = useRef<HTMLElement>(null);
  const [isMainScrolled, setIsMainScrolled] = useState(false);
  const isFullScreen =
    normalizedPath.startsWith('/preview')
    || normalizedPath.startsWith('/login')
    || normalizedPath.startsWith('/onboarding');

  // Template editor gets full-width layout (no sidebar)
  const isTemplateEditor = normalizedPath === '/templates/editor'
    || /^\/templates\/folder\/[^/]+$/.test(normalizedPath)
    || /^\/components\/[^/]+$/.test(normalizedPath)
    || /^\/components\/folder\/[^/]+$/.test(normalizedPath);

  useEffect(() => {
    if (isFullScreen || isTemplateEditor) {
      setIsMainScrolled(false);
      return;
    }

    const main = mainRef.current;
    if (!main) return;

    const handleScroll = () => {
      setIsMainScrolled(main.scrollTop > 0);
    };

    handleScroll();
    main.addEventListener('scroll', handleScroll, { passive: true });
    return () => main.removeEventListener('scroll', handleScroll);
  }, [pathname, isFullScreen, isTemplateEditor]);

  if (isFullScreen) {
    return <div className="flex-1">{children}</div>;
  }

  if (isTemplateEditor) {
    return (
      <main className="flex-1 p-4">
        {children}
      </main>
    );
  }

  return (
    <>
      <Sidebar />
      <main
        ref={mainRef}
        data-scrolled={isMainScrolled ? 'true' : 'false'}
        className="flex-1 min-w-0 h-screen overflow-y-auto overflow-x-hidden overscroll-contain p-8 pl-[18.5rem]"
      >
        <TopUtilityBar />
        {children}
      </main>
    </>
  );
}
