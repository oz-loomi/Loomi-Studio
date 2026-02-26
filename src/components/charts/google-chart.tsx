'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type GoogleChartType = 'LineChart' | 'ColumnChart' | 'BarChart' | 'PieChart' | 'AreaChart';
type GoogleChartCell = string | number | Date | null;

declare global {
  interface Window {
    google?: {
      charts: {
        load: (version: string, settings: { packages: string[] }) => void;
        setOnLoadCallback: (callback: () => void) => void;
      };
      visualization: {
        arrayToDataTable: (data: GoogleChartCell[][]) => unknown;
        LineChart: new (el: Element) => { draw: (data: unknown, options: Record<string, unknown>) => void };
        ColumnChart: new (el: Element) => { draw: (data: unknown, options: Record<string, unknown>) => void };
        BarChart: new (el: Element) => { draw: (data: unknown, options: Record<string, unknown>) => void };
        PieChart: new (el: Element) => { draw: (data: unknown, options: Record<string, unknown>) => void };
        AreaChart: new (el: Element) => { draw: (data: unknown, options: Record<string, unknown>) => void };
      };
    };
  }
}

const GOOGLE_CHARTS_LOADER_URL = 'https://www.gstatic.com/charts/loader.js';
let googleChartsPromise: Promise<void> | null = null;

function loadGoogleCharts(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.charts && window.google.visualization) return Promise.resolve();
  if (googleChartsPromise) return googleChartsPromise;

  googleChartsPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_CHARTS_LOADER_URL}"]`);

    function initialize() {
      if (!window.google?.charts) {
        reject(new Error('Google Charts failed to initialize.'));
        return;
      }
      window.google.charts.load('current', { packages: ['corechart'] });
      window.google.charts.setOnLoadCallback(() => resolve());
    }

    if (existingScript) {
      if (window.google?.charts && window.google.visualization) {
        resolve();
      } else {
        existingScript.addEventListener('load', initialize, { once: true });
        existingScript.addEventListener('error', () => reject(new Error('Unable to load Google Charts loader script.')), { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_CHARTS_LOADER_URL;
    script.async = true;
    script.onload = initialize;
    script.onerror = () => reject(new Error('Unable to load Google Charts loader script.'));
    document.head.appendChild(script);
  });

  return googleChartsPromise;
}

export function GoogleChart({
  chartType,
  data,
  options,
  height = 260,
  className,
}: {
  chartType: GoogleChartType;
  data: GoogleChartCell[][];
  options?: Record<string, unknown>;
  height?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const chartData = useMemo(() => data, [data]);
  const chartOptions = useMemo(() => options || {}, [options]);
  const chartDataKey = useMemo(() => JSON.stringify(chartData), [chartData]);
  const chartOptionsKey = useMemo(() => JSON.stringify(chartOptions), [chartOptions]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleCharts()
      .then(() => {
        if (!cancelled) {
          setReady(true);
          setLoadError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load chart.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current || !window.google?.visualization) return;
    if (!chartData || chartData.length < 2) return;

    const draw = () => {
      if (!containerRef.current || !window.google?.visualization) return;
      const table = window.google.visualization.arrayToDataTable(chartData);
      const ChartCtor = window.google.visualization[chartType];
      if (!ChartCtor) return;
      const chart = new ChartCtor(containerRef.current);
      chart.draw(table, chartOptions);
    };

    draw();
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ready, chartType, chartDataKey, chartOptionsKey, chartData, chartOptions]);

  if (loadError) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
        {loadError}
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 p-4">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height }}
    />
  );
}
