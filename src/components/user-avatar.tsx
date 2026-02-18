'use client';

import { useEffect, useMemo, useState } from 'react';
import { generateLoomiAvatarDataUri } from '@/lib/avatar';
import { useTheme } from '@/contexts/theme-context';

interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

export function UserAvatar({
  name,
  email,
  avatarUrl,
  size = 48,
  className = '',
}: UserAvatarProps) {
  const { theme } = useTheme();
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [avatarUrl]);

  const fallbackSrc = useMemo(
    () => generateLoomiAvatarDataUri(name, email, Math.max(size, 96), theme),
    [name, email, size, theme],
  );

  const src = avatarUrl && !hasImageError ? avatarUrl : fallbackSrc;

  return (
    <span
      className={`inline-flex overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt={name ? `${name} avatar` : 'User avatar'}
        width={size}
        height={size}
        className="w-full h-full object-cover"
        onError={() => setHasImageError(true)}
      />
    </span>
  );
}
