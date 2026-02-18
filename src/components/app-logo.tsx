'use client';

import { useTheme } from '@/contexts/theme-context';

const APP_LOGO_LIGHT_URL =
  'https://storage.googleapis.com/msgsndr/CVpny6EUSHRxlXfqAFb7/media/6995362fd614c941e221bb2e.png';
const APP_LOGO_DARK_URL =
  'https://storage.googleapis.com/msgsndr/CVpny6EUSHRxlXfqAFb7/media/6995362fbf62aa8d0c6c62be.png';

export function AppLogo({
  className = 'h-8 w-auto',
  alt = 'Loomi Studio',
}: {
  className?: string;
  alt?: string;
}) {
  const { theme } = useTheme();
  const src = theme === 'light' ? APP_LOGO_LIGHT_URL : APP_LOGO_DARK_URL;

  return <img src={src} alt={alt} className={className} />;
}

