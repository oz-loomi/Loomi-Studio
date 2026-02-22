'use client';

import { toast as sonnerToast, type ExternalToast } from 'sonner';

/**
 * Copy-to-clipboard button shown inside error toasts.
 * Uses a minimal inline SVG to avoid a Heroicons dependency in this util.
 */
function CopyButton({ text }: { text: string }) {
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      // Briefly flash the icon to indicate success
      const btn = e.currentTarget as HTMLButtonElement;
      btn.classList.add('opacity-100');
      setTimeout(() => btn.classList.remove('opacity-100'), 1200);
    } catch {
      // Fallback for insecure contexts
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy error message"
      className="inline-flex items-center justify-center w-5 h-5 ml-1.5 -mr-0.5 flex-shrink-0 rounded opacity-50 hover:opacity-100 transition-opacity"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-3.5 h-3.5"
      >
        <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
        <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
      </svg>
    </button>
  );
}

/**
 * Error toast message with an inline copy button.
 */
function ErrorMessage({ message }: { message: string }) {
  return (
    <span className="inline-flex items-start gap-0 text-sm leading-snug">
      <span className="flex-1 min-w-0">{message}</span>
      <CopyButton text={message} />
    </span>
  );
}

/**
 * Enhanced toast — drop-in replacement for `import { toast } from 'sonner'`.
 *
 * The only change: `toast.error()` renders a small copy icon next to the
 * message so users can easily copy error details.
 *
 * Usage:
 *   import { toast } from '@/lib/toast';
 *   toast.error('Something went wrong');  // now includes copy icon
 *   toast.success('Saved!');              // unchanged
 */
export const toast = Object.assign(
  // Pass-through the default toast function
  (...args: Parameters<typeof sonnerToast>) => sonnerToast(...args),
  {
    // Enhanced error — wraps message in JSX with copy button
    error(message: string | React.ReactNode, opts?: ExternalToast) {
      if (typeof message === 'string') {
        return sonnerToast.error(<ErrorMessage message={message} />, opts);
      }
      // Non-string messages (JSX) — pass through as-is
      return sonnerToast.error(message, opts);
    },
    // Pass through all other methods unchanged
    success: sonnerToast.success,
    warning: sonnerToast.warning,
    info: sonnerToast.info,
    loading: sonnerToast.loading,
    promise: sonnerToast.promise,
    custom: sonnerToast.custom,
    message: sonnerToast.message,
    dismiss: sonnerToast.dismiss,
  },
);
