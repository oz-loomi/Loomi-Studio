export type AvatarTheme = 'dark' | 'light';

interface TailwindAvatarColor {
  family: string;
  color300: string;
  color500: string;
  color700: string;
}

// Maximally spread palette — ordered so adjacent indices are visually distinct.
// Mixes Tailwind families with custom hues (coral, wine, peach, sage, steel, etc.)
// to avoid the "too many greens / too many purples" problem.
const TAILWIND_AVATAR_COLORS: TailwindAvatarColor[] = [
  // 0  blue
  { family: 'blue', color300: '#93c5fd', color500: '#3b82f6', color700: '#1d4ed8' },
  // 1  coral (custom — between orange and pink)
  { family: 'coral', color300: '#fdb8a5', color500: '#f0725c', color700: '#c4402a' },
  // 2  emerald
  { family: 'emerald', color300: '#6ee7b7', color500: '#10b981', color700: '#047857' },
  // 3  purple
  { family: 'purple', color300: '#d8b4fe', color500: '#a855f7', color700: '#7e22ce' },
  // 4  amber
  { family: 'amber', color300: '#fcd34d', color500: '#f59e0b', color700: '#b45309' },
  // 5  teal
  { family: 'teal', color300: '#5eead4', color500: '#14b8a6', color700: '#0f766e' },
  // 6  rose
  { family: 'rose', color300: '#fda4af', color500: '#f43f5e', color700: '#be123c' },
  // 7  indigo
  { family: 'indigo', color300: '#a5b4fc', color500: '#6366f1', color700: '#4338ca' },
  // 8  lime
  { family: 'lime', color300: '#bef264', color500: '#84cc16', color700: '#4d7c0f' },
  // 9  wine (custom — deep burgundy / maroon)
  { family: 'wine', color300: '#e8a0b4', color500: '#b5365a', color700: '#7f1d3f' },
  // 10 cyan
  { family: 'cyan', color300: '#67e8f9', color500: '#06b6d4', color700: '#0e7490' },
  // 11 orange
  { family: 'orange', color300: '#fdba74', color500: '#f97316', color700: '#c2410c' },
  // 12 violet
  { family: 'violet', color300: '#c4b5fd', color500: '#8b5cf6', color700: '#6d28d9' },
  // 13 sage (custom — muted olive green)
  { family: 'sage', color300: '#b5d4a0', color500: '#6b9e52', color700: '#3e6b2e' },
  // 14 sky
  { family: 'sky', color300: '#7dd3fc', color500: '#0ea5e9', color700: '#0369a1' },
  // 15 fuchsia
  { family: 'fuchsia', color300: '#f0abfc', color500: '#d946ef', color700: '#a21caf' },
  // 16 peach (custom — warm pastel orange)
  { family: 'peach', color300: '#fdd5b1', color500: '#f0944d', color700: '#b35e1a' },
  // 17 green
  { family: 'green', color300: '#86efac', color500: '#22c55e', color700: '#15803d' },
  // 18 steel (custom — cool blue-grey)
  { family: 'steel', color300: '#a8c0d8', color500: '#5882a6', color700: '#325574' },
  // 19 pink
  { family: 'pink', color300: '#f9a8d4', color500: '#ec4899', color700: '#be185d' },
  // 20 gold (custom — richer than amber, less green than yellow)
  { family: 'gold', color300: '#f5d680', color500: '#d4a017', color700: '#8f6c0b' },
  // 21 red
  { family: 'red', color300: '#fca5a5', color500: '#ef4444', color700: '#b91c1c' },
  // 22 mint (custom — light fresh green)
  { family: 'mint', color300: '#88e8cc', color500: '#34c89a', color700: '#1a8a66' },
  // 23 slate (custom — neutral cool grey with a hint of blue)
  { family: 'slate', color300: '#b0bec5', color500: '#607d8b', color700: '#37474f' },
  // 24 tangerine (custom — vivid red-orange)
  { family: 'tangerine', color300: '#ffb088', color500: '#e86830', color700: '#a73e10' },
  // 25 lavender (custom — soft purple-blue)
  { family: 'lavender', color300: '#c7b8ea', color500: '#8e72d1', color700: '#5a3ea3' },
  // 26 yellow
  { family: 'yellow', color300: '#fde047', color500: '#eab308', color700: '#a16207' },
  // 27 cobalt (custom — deep rich blue)
  { family: 'cobalt', color300: '#82a5e0', color500: '#3564b8', color700: '#1e3f7a' },
  // 28 mauve (custom — dusty pink-purple)
  { family: 'mauve', color300: '#d4a5c4', color500: '#a65d8c', color700: '#753d62' },
  // 29 chartreuse (custom — yellow-green)
  { family: 'chartreuse', color300: '#d4f07a', color500: '#9cb820', color700: '#627a0e' },
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
