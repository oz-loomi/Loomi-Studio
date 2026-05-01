import type { SVGProps } from 'react';

/**
 * Meta's infinity-loop wordmark glyph. Vector path traced from the official
 * Meta brand mark (the mobius-like double-loop) — kept on a viewBox of
 * 0 0 287.5 191 so it scales cleanly via the standard `width` / `height`
 * (or Tailwind w-/h-) props.
 *
 * Uses `currentColor` for the fill so callers can control the color via
 * className or style. Pass `gradient` (default `true`) to render the
 * canonical Meta blue → cyan → magenta gradient instead.
 */
export function MetaLogoIcon({
  gradient = true,
  ...props
}: SVGProps<SVGSVGElement> & { gradient?: boolean }) {
  // Stable id so multiple instances on the page don't collide.
  const gradId = 'meta-logo-grad';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 287.5 191"
      fill={gradient ? `url(#${gradId})` : 'currentColor'}
      aria-hidden="true"
      {...props}
    >
      {gradient && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#0064E1" />
            <stop offset="40%" stopColor="#0073EE" />
            <stop offset="60%" stopColor="#1E88FB" />
            <stop offset="80%" stopColor="#7C4DFF" />
            <stop offset="100%" stopColor="#F5298E" />
          </linearGradient>
        </defs>
      )}
      <path d="M31.06 126C31.06 137.16 33.51 145.73 36.71 150.92C40.91 157.72 47.18 160.6 53.57 160.6C61.81 160.6 69.35 158.55 83.88 138.45C95.52 122.34 109.23 99.72 118.46 85.54L134.09 61.54C144.95 44.85 157.52 26.3 171.94 13.71C183.71 3.43 196.41 -2.28 209.18 -2.28C230.62 -2.28 251.04 10.15 266.66 33.41C283.76 58.88 292.06 91 292.06 124.16C292.06 143.86 288.18 158.33 281.58 169.76C275.21 180.81 262.79 191.85 241.89 191.85V160.6C259.78 160.6 264.25 144.16 264.25 125.34C264.25 98.52 257.99 68.76 244.18 47.51C234.37 32.43 221.66 23.21 207.68 23.21C192.55 23.21 180.38 34.62 166.7 54.95C159.43 65.76 151.97 78.94 143.59 93.81L134.4 110.13C115.93 142.91 111.25 150.36 101.99 162.71C85.78 184.32 71.94 191.85 53.57 191.85C31.93 191.85 18.25 182.46 9.79 168.31C2.89 156.78 -0.5 141.65 -0.5 124.41L31.06 126Z" />
      <path d="M24.49 35.62C38.97 13.31 59.86 -2.28 83.82 -2.28C97.7 -2.28 111.5 1.83 125.91 13.65C141.67 26.57 158.46 47.84 179.41 82.91L186.92 95.49C205.05 125.83 215.36 141.44 221.39 148.8C229.15 158.26 234.59 161.08 241.65 161.08C259.54 161.08 264.01 144.64 264.01 125.82L292.06 124.94C292.06 144.64 288.18 159.11 281.58 170.54C275.21 181.59 262.79 192.63 241.89 192.63C228.9 192.63 217.39 189.81 204.66 177.81C194.87 168.59 183.43 152.21 174.62 137.48L148.42 93.69C135.27 71.71 123.21 55.3 116.22 47.86C108.71 39.86 99.05 30.21 83.65 30.21C71.18 30.21 60.59 38.96 51.74 52.34L24.49 35.62Z" />
      <path d="M83.65 30.21C71.18 30.21 60.59 38.96 51.74 52.34C39.22 71.27 31.55 99.46 31.55 126.51C31.55 137.66 33.99 146.23 37.19 151.42L9.79 168.31C2.89 156.78 -0.5 141.65 -0.5 124.41C-0.5 93.16 8.07 60.59 24.49 35.62C38.97 13.31 59.86 -2.28 83.82 -2.28L83.65 30.21Z" />
    </svg>
  );
}
