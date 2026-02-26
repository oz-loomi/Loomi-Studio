'use client';

import { useEffect, useState, useRef } from 'react';

// Module-level cache so previews survive re-renders and component unmounts
const previewCache = new Map<string, string>();

// --- Concurrency-limited fetch queue ---
// Limits parallel preview compilations to avoid overwhelming the server
const MAX_CONCURRENT = 3;
let activeCount = 0;
const queue: (() => void)[] = [];

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeCount++;
      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeCount--;
          if (queue.length > 0) {
            const next = queue.shift()!;
            next();
          }
        });
    };

    if (activeCount < MAX_CONCURRENT) {
      run();
    } else {
      queue.push(run);
    }
  });
}

interface TemplatePreviewProps {
  design: string;
  height?: number;
  className?: string;
  onClick?: () => void;
  /** When true, renders a full-size scrollable iframe instead of a scaled thumbnail */
  interactive?: boolean;
}

export function TemplatePreview({ design, height = 280, className = '', onClick, interactive = false }: TemplatePreviewProps) {
  const [html, setHtml] = useState<string | null>(previewCache.get(design) || null);
  const [loading, setLoading] = useState(!previewCache.has(design));
  const [error, setError] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Observe container width for scaling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    resizeObserver.observe(el);
    setContainerWidth(el.clientWidth);
    return () => resizeObserver.disconnect();
  }, []);

  // Lazy load: only compile when visible in viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // If already cached, no need to wait for visibility
    if (previewCache.has(design)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // Start loading 200px before entering viewport
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [design]);

  // Fetch + compile template (only when visible)
  useEffect(() => {
    if (!isVisible) return;

    if (previewCache.has(design)) {
      setHtml(previewCache.get(design)!);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const compile = () => enqueue(async () => {
      // Double-check cache (another instance may have compiled while queued)
      if (previewCache.has(design)) {
        if (!cancelled) {
          setHtml(previewCache.get(design)!);
          setLoading(false);
        }
        return;
      }

      const rawRes = await fetch(`/api/templates?design=${encodeURIComponent(design)}&format=raw`);
      if (!rawRes.ok) throw new Error('Template not found');
      const rawData = await rawRes.json();
      if (!rawData.raw) throw new Error('No raw content');

      const previewRes = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: rawData.raw, project: 'core' }),
      });
      if (!previewRes.ok) throw new Error('Compilation failed');
      const previewData = await previewRes.json();
      if (!previewData.html) throw new Error('No HTML output');

      if (!cancelled) {
        previewCache.set(design, previewData.html);
        setHtml(previewData.html);
        setLoading(false);
      }
    });

    compile().catch(() => {
      if (!cancelled) {
        setError(true);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [design, isVisible]);

  // Scale the 600px-wide email to fit the container
  const iframeWidth = 600;
  const scale = containerWidth > 0 ? containerWidth / iframeWidth : 0.4;

  return (
    <div
      ref={containerRef}
      className={`relative ${interactive ? 'h-full' : 'overflow-hidden'} bg-[var(--muted)] ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={interactive ? undefined : { height }}
      onClick={onClick}
    >
      {loading && (
        <div className={`${interactive ? '' : 'absolute'} inset-0 flex items-center justify-center z-10 ${interactive ? 'h-full' : ''}`}>
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] text-[var(--muted-foreground)]">Loading preview...</span>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className={`${interactive ? '' : 'absolute'} inset-0 flex items-center justify-center ${interactive ? 'h-full' : ''}`}>
          <span className="text-xs text-[var(--muted-foreground)]">Preview unavailable</span>
        </div>
      )}

      {html && !loading && (interactive ? (
        <iframe
          srcDoc={html}
          className="w-full h-full border-0"
          title={`${design} preview`}
          sandbox="allow-same-origin"
        />
      ) : containerWidth > 0 ? (
        <iframe
          srcDoc={`<style>html,body{overflow:hidden !important;margin:0;}</style>${html}`}
          className="border-0 pointer-events-none absolute top-0 left-0"
          scrolling="no"
          style={{
            width: `${iframeWidth}px`,
            height: `${Math.round(height / scale)}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          title={`${design} preview`}
          sandbox="allow-same-origin"
          tabIndex={-1}
        />
      ) : null)}
    </div>
  );
}
