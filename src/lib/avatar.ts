export type AvatarTheme = 'dark' | 'light';

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

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
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

  // Muted hues so each user gets a subtle, distinct tint without loud gradients.
  const huePalette = [192, 206, 218, 232, 248, 266, 286, 334];
  const baseHue = huePalette[hash % huePalette.length];
  const darkMode = theme === 'dark';
  const initialsColor = darkMode ? hsl(baseHue, 90, 68) : hsl(baseHue, 62, 40);
  const tintColor = darkMode
    ? `hsla(${baseHue}, 92%, 64%, 0.16)`
    : `hsla(${baseHue}, 58%, 62%, 0.24)`;
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
