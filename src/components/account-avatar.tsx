'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@/contexts/theme-context';
import { generateLoomiAvatarDataUri } from '@/lib/avatar';

interface AccountAvatarProps {
  name?: string | null;
  accountKey?: string | null;
  storefrontImage?: string | null;
  size?: number;
  className?: string;
  alt?: string;
}

export function AccountAvatar({
  name,
  accountKey,
  storefrontImage,
  size = 48,
  className = '',
  alt,
}: AccountAvatarProps) {
  const { theme } = useTheme();
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [storefrontImage]);

  const fallbackSrc = useMemo(
    () => generateLoomiAvatarDataUri(name, accountKey, Math.max(size, 96), theme),
    [name, accountKey, size, theme],
  );

  const src = storefrontImage && !hasImageError ? storefrontImage : fallbackSrc;

  return (
    <span
      className={`inline-flex overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt={alt || (name ? `${name} account avatar` : 'Account avatar')}
        width={size}
        height={size}
        className="w-full h-full object-cover"
        onError={() => setHasImageError(true)}
      />
    </span>
  );
}
