'use client';

import { useState, useRef } from 'react';
import { toast as sonnerToast, type ExternalToast } from 'sonner';

/**
 * Copy-to-clipboard button shown inside error toasts.
 * Uses inline SVGs (Square2Stack for copy, Check for success) to avoid
 * a Heroicons dependency in this util.
 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
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
    clearTimeout(timerRef.current);
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy error message"
      className="inline-flex items-center justify-center w-5 h-5 ml-1.5 -mr-0.5 flex-shrink-0 rounded opacity-50 hover:opacity-100 transition-opacity"
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 text-green-500">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 8.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v8.25A2.25 2.25 0 0 0 6 16.5h2.25m8.25-8.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-8.25A2.25 2.25 0 0 1 7.5 18v-1.5m8.25-8.25h-6a2.25 2.25 0 0 0-2.25 2.25v6" />
        </svg>
      )}
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
