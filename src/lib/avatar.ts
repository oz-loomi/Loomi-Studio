export type AvatarTheme = 'dark' | 'light';

interface TailwindAvatarColor {
  family: string;
  color300: string;
  color500: string;
  color700: string;
}

const TAILWIND_AVATAR_COLORS: TailwindAvatarColor[] = [
  { family: 'red', color300: '#fca5a5', color500: '#ef4444', color700: '#b91c1c' },
  { family: 'orange', color300: '#fdba74', color500: '#f97316', color700: '#c2410c' },
  { family: 'amber', color300: '#fcd34d', color500: '#f59e0b', color700: '#b45309' },
  { family: 'yellow', color300: '#fde047', color500: '#eab308', color700: '#a16207' },
  { family: 'lime', color300: '#bef264', color500: '#84cc16', color700: '#4d7c0f' },
  { family: 'green', color300: '#86efac', color500: '#22c55e', color700: '#15803d' },
  { family: 'emerald', color300: '#6ee7b7', color500: '#10b981', color700: '#047857' },
  { family: 'teal', color300: '#5eead4', color500: '#14b8a6', color700: '#0f766e' },
  { family: 'cyan', color300: '#67e8f9', color500: '#06b6d4', color700: '#0e7490' },
  { family: 'sky', color300: '#7dd3fc', color500: '#0ea5e9', color700: '#0369a1' },
  { family: 'blue', color300: '#93c5fd', color500: '#3b82f6', color700: '#1d4ed8' },
  { family: 'indigo', color300: '#a5b4fc', color500: '#6366f1', color700: '#4338ca' },
  { family: 'violet', color300: '#c4b5fd', color500: '#8b5cf6', color700: '#6d28d9' },
  { family: 'purple', color300: '#d8b4fe', color500: '#a855f7', color700: '#7e22ce' },
  { family: 'fuchsia', color300: '#f0abfc', color500: '#d946ef', color700: '#a21caf' },
  { family: 'pink', color300: '#f9a8d4', color500: '#ec4899', color700: '#be185d' },
  { family: 'rose', color300: '#fda4af', color500: '#f43f5e', color700: '#be123c' },
];

export function getUserInitials(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const raw = (name && name.trim()) || (email ? email.split('@')[0] : '') || 'Loomi';
  const words = raw
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'LS';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '').trim();
  const value = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  const parsed = Number.parseInt(value, 16);
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  return [r, g, b];
}

function rgbaFromHex(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function generateLoomiAvatarDataUri(
  name: string | null | undefined,
  email: string | null | undefined,
  size = 192,
  theme: AvatarTheme = 'dark',
): string {
  const seed = `${name || ''}|${email || ''}|loomi-studio`;
  const hash = hashSeed(seed);
  const initials = getUserInitials(name, email);
  const colorSet = TAILWIND_AVATAR_COLORS[hash % TAILWIND_AVATAR_COLORS.length];

  const darkMode = theme === 'dark';
  const initialsColor = darkMode ? colorSet.color300 : colorSet.color700;
  const tintColor = rgbaFromHex(colorSet.color500, darkMode ? 0.22 : 0.24);
  const baseLayerColor = darkMode ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,0.34)';

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Avatar ${initials}">
  <rect x="0" y="0" width="${size}" height="${size}" fill="${baseLayerColor}" />
  <rect x="0" y="0" width="${size}" height="${size}" fill="${tintColor}" />
  <text
    x="50%"
    y="53%"
    dominant-baseline="middle"
    text-anchor="middle"
    fill="${initialsColor}"
    font-family="Inter, system-ui, sans-serif"
    font-size="${size * 0.31}"
    font-weight="700"
    letter-spacing="${size * 0.01}"
  >${initials}</text>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
