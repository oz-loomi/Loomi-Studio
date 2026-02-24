'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@/contexts/theme-context';
import { generateLoomiAvatarDataUri } from '@/lib/avatar';

interface AccountAvatarProps {
  name?: string | null;
  accountKey?: string | null;
  storefrontImage?: string | null;
  logos?: { light?: string; dark?: string; white?: string; black?: string } | null;
  size?: number;
  className?: string;
  alt?: string;
}

export function AccountAvatar({
  name,
  accountKey,
  storefrontImage,
  logos,
  size = 48,
  className = '',
  alt,
}: AccountAvatarProps) {
  const { theme } = useTheme();
  const [hasImageError, setHasImageError] = useState(false);

  // Pick theme-appropriate logo: light mode → dark logo, dark mode → light logo
  const themeLogoSrc = theme === 'light' ? logos?.dark : logos?.light;

  useEffect(() => {
    setHasImageError(false);
  }, [themeLogoSrc, storefrontImage]);

  const fallbackSrc = useMemo(
    () => generateLoomiAvatarDataUri(name, accountKey, Math.max(size, 96), theme),
    [name, accountKey, size, theme],
  );

  // Priority: theme-appropriate logo > storefront image > generated fallback
  const primarySrc = themeLogoSrc || storefrontImage;
  const src = primarySrc && !hasImageError ? primarySrc : fallbackSrc;
  const isLogo = Boolean(themeLogoSrc) && !hasImageError;

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt={alt || (name ? `${name} account avatar` : 'Account avatar')}
        width={size}
        height={size}
        className={`w-full h-full ${isLogo ? 'object-contain p-[15%]' : 'object-cover'}`}
        onError={() => setHasImageError(true)}
      />
    </span>
  );
}
