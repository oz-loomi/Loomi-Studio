'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  CodeBracketIcon,
  AdjustmentsHorizontalIcon,
  SwatchIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { toast } from '@/lib/toast';
import { useUnsavedChanges } from '@/contexts/unsaved-changes-context';
import { componentSchemas, type PropSchema } from '@/lib/component-schemas';
import { AdminOnly } from '@/components/route-guard';
import { CodeEditor } from '@/components/code-editor';

const OEM_LIST = [
  'audi', 'buick', 'chevrolet', 'chrysler', 'dodge', 'ford',
  'genesis', 'gmc', 'honda', 'hyundai', 'jeep', 'kia', 'mazda',
];

type PanelMode = 'code' | 'playground';

const FORCED_MOBILE_STYLE_ID = 'loomi-forced-mobile-styles';
const FORCED_MOBILE_NORMALIZE_STYLE_ID = 'loomi-forced-mobile-normalize';

function syncPreviewMobileStyles(doc: Document, isMobile: boolean) {
  const existing = doc.getElementById(FORCED_MOBILE_STYLE_ID) as HTMLStyleElement | null;
  if (!isMobile) {
    existing?.remove();
    return;
  }

  const forcedRules: string[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }

    for (const rule of Array.from(rules)) {
      if (rule.type !== CSSRule.MEDIA_RULE) continue;
      const mediaRule = rule as CSSMediaRule;
      if (!/max-width\s*:\s*600px/i.test(mediaRule.conditionText)) continue;
      for (const nestedRule of Array.from(mediaRule.cssRules)) {
        forcedRules.push(nestedRule.cssText);
      }
    }
  }

  if (forcedRules.length === 0) {
    existing?.remove();
    return;
  }

  const styleEl = existing || doc.createElement('style');
  styleEl.id = FORCED_MOBILE_STYLE_ID;
  styleEl.textContent = forcedRules.join('\n');
  if (!existing) doc.head?.appendChild(styleEl);
}

function syncPreviewMobileNormalizeStyle(doc: Document, isMobile: boolean) {
  const existing = doc.getElementById(FORCED_MOBILE_NORMALIZE_STYLE_ID) as HTMLStyleElement | null;
  if (!isMobile) {
    existing?.remove();
    return;
  }

  const css = `
    html, body {
      overflow-x: hidden !important;
      width: 100% !important;
      max-width: 100% !important;
    }
    table.email-container,
    table[width="600"],
    table[width="600px"],
    table[style*="max-width: 600px"],
    table[style*="max-width:600px"] {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
    }
    img[width="600"],
    img[width="600px"] {
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
    }
    .loomi-btn-row > td,
    .loomi-btn-gap,
    .loomi-btn-gap + td {
      display: block !important;
      width: 100% !important;
      padding-right: 0 !important;
    }
    .loomi-btn-secondary-cell,
    .loomi-btn-gap + td {
      padding-top: 10px !important;
    }
    .loomi-btn-primary,
    .loomi-btn-secondary {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      text-align: center !important;
    }
    .loomi-headline,
    .loomi-subheadline {
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
    .email-container,
    .email-container table {
      table-layout: fixed !important;
    }
    td {
      min-width: 0 !important;
    }
    td, p, span, a, h1, h2, h3, h4, h5, h6, div {
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
  `;

  const styleEl = existing || doc.createElement('style');
  styleEl.id = FORCED_MOBILE_NORMALIZE_STYLE_ID;
  styleEl.textContent = css;
  if (!existing) doc.head?.appendChild(styleEl);
}

function normalizePreviewMobileLayout(doc: Document, isMobile: boolean) {
  if (!isMobile) return;

  const root = doc.documentElement as HTMLElement | null;
  if (root) {
    root.style.overflowX = 'hidden';
    root.style.maxWidth = '100%';
  }
  if (doc.body) {
    doc.body.style.overflowX = 'hidden';
    doc.body.style.width = '100%';
    doc.body.style.maxWidth = '100%';
  }

  doc.querySelectorAll('table').forEach((node) => {
    const table = node as HTMLTableElement;
    const widthAttr = (table.getAttribute('width') || '').trim();
    const numericWidth = parseInt(widthAttr, 10);
    const inlineStyle = table.getAttribute('style') || '';
    const looksLikeDesktopContainer =
      (!Number.isNaN(numericWidth) && numericWidth >= 500) ||
      /max-width\s*:\s*600px/i.test(inlineStyle) ||
      table.classList.contains('email-container');
    if (!looksLikeDesktopContainer) return;
    table.setAttribute('width', '100%');
    table.style.width = '100%';
    table.style.maxWidth = '100%';
    table.style.minWidth = '0';
  });

  doc.querySelectorAll('img[width]').forEach((node) => {
    const img = node as HTMLImageElement;
    const numericWidth = parseInt(img.getAttribute('width') || '', 10);
    if (Number.isNaN(numericWidth) || numericWidth < 500) return;
    img.style.maxWidth = '100%';
    img.style.width = '100%';
    img.style.height = 'auto';
  });

  const normalizeHeroButtonRow = (row: HTMLElement) => {
    const cells = Array.from(row.children).filter(
      (child) => child.tagName.toLowerCase() === 'td',
    ) as HTMLTableCellElement[];
    cells.forEach((td, idx) => {
      td.style.display = 'block';
      td.style.width = '100%';
      td.style.paddingRight = '0';
      if (idx > 0) td.style.paddingTop = '10px';
    });
  };
  doc.querySelectorAll('.loomi-btn-row').forEach((node) => {
    normalizeHeroButtonRow(node as HTMLElement);
  });
  doc.querySelectorAll('.loomi-btn-gap').forEach((node) => {
    const td = node as HTMLTableCellElement;
    const row = td.parentElement;
    if (row && row.tagName.toLowerCase() === 'tr') {
      normalizeHeroButtonRow(row as HTMLElement);
    }
  });
  doc.querySelectorAll('.loomi-btn-primary, .loomi-btn-secondary').forEach((node) => {
    const el = node as HTMLElement;
    el.style.display = 'block';
    el.style.width = '100%';
    el.style.maxWidth = '100%';
    el.style.boxSizing = 'border-box';
    el.style.textAlign = 'center';
  });
  doc.querySelectorAll('.loomi-headline, .loomi-subheadline').forEach((node) => {
    const el = node as HTMLElement;
    el.style.overflowWrap = 'anywhere';
    el.style.wordBreak = 'break-word';
  });
}

function PropField({
  prop,
  value,
  onChange,
}: {
  prop: PropSchema;
  value: string;
  onChange: (val: string) => void;
}) {
  const base = "w-full px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--card)] focus:outline-none focus:border-[var(--primary)]";

  if (prop.type === 'textarea') {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={base + ' resize-y'}
        placeholder={prop.default || ''}
      />
    );
  }

  if (prop.type === 'select' && prop.options) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={base}
      >
        <option value="">Default</option>
        {prop.options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }

  if (prop.type === 'color') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-[var(--border)] bg-transparent cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={base + ' flex-1'}
          placeholder={prop.default || '#000000'}
        />
      </div>
    );
  }

  if (prop.type === 'toggle') {
    return (
      <button
        onClick={() => onChange(value === 'true' ? 'false' : 'true')}
        className={`relative w-10 h-5 rounded-full transition-colors ${value === 'true' ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${value === 'true' ? 'left-5' : 'left-0.5'}`} />
      </button>
    );
  }

  return (
    <input
      type={prop.type === 'number' ? 'number' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={base}
      placeholder={prop.default || ''}
    />
  );
}

export default function ComponentEditorPage() {
  const params = useParams();
  const name = params.name as string;
  const { markDirty, markClean } = useUnsavedChanges();

  const [code, setCode] = useState('');
  const [originalCode, setOriginalCode] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');
  const [panelMode, setPanelMode] = useState<PanelMode>('playground');
  const [selectedOem, setSelectedOem] = useState('audi');
  const [propValues, setPropValues] = useState<Record<string, string>>({});

  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const schema = componentSchemas[name];
  const label = schema?.label || name;

  // Load component
  useEffect(() => {
    fetch(`/api/components?name=${name}`)
      .then(r => r.json())
      .then(data => {
        if (data.raw) {
          setCode(data.raw);
          setOriginalCode(data.raw);
        }
      })
      .catch(err => console.error('Error loading component:', err));
  }, [name]);

  // Initialize prop values from schema defaults
  useEffect(() => {
    if (!schema) return;
    const defaults: Record<string, string> = {};
    for (const prop of schema.props) {
      if (prop.key === 'oem') continue;
      if (prop.default) {
        defaults[prop.key] = prop.default;
      } else if (prop.required) {
        defaults[prop.key] = `[${prop.label}]`;
      }
    }
    setPropValues(defaults);
  }, [schema]);

  useEffect(() => { setHasChanges(code !== originalCode); }, [code, originalCode]);

  useEffect(() => {
    if (hasChanges) {
      markDirty();
      return;
    }
    markClean();
  }, [hasChanges, markClean, markDirty]);

  // Build a preview wrapper that uses this component with current prop values
  const buildPreviewTemplate = useCallback(() => {
    const propEntries = Object.entries(propValues)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => `${k}="${v.replace(/"/g, '&quot;')}"`)
      .join('\n    ');

    return `---
title: Section Preview
preheader: Preview
rooftop: ${selectedOem}
---

<x-base>

  <x-core.${name}
    oem="${selectedOem}"
    ${propEntries}
  />

</x-base>
`;
  }, [name, propValues, selectedOem]);

  const compilePreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError('');
    try {
      // Save if code has changed (to ensure component source is up to date)
      if (hasChanges) {
        await fetch('/api/components', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, raw: code }),
        });
        setOriginalCode(code);
      }

      const wrapperHtml = buildPreviewTemplate();
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: wrapperHtml, project: 'core' }),
      });
      const data = await res.json();
      if (data.html) setPreviewHtml(data.html);
      else if (data.error) setPreviewError(data.error);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Preview failed';
      setPreviewError(message);
    }
    setPreviewLoading(false);
  }, [code, hasChanges, name, buildPreviewTemplate]);

  // Initial preview load
  useEffect(() => {
    if (code) {
      const timer = setTimeout(() => compilePreview(), 500);
      return () => clearTimeout(timer);
    }
  }, [code ? 'loaded' : 'waiting']); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => compilePreview(), 1500);
  };

  const handlePropChange = (key: string, value: string) => {
    setPropValues(prev => ({ ...prev, [key]: value }));
    // Auto-preview after prop change
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => compilePreview(), 800);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/components', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, raw: code }),
      });
      if (res.ok) {
        setOriginalCode(code);
        toast.success('Saved!');
      } else {
        toast.error('Error saving');
      }
    } catch {
      toast.error('Error saving');
    }
    setSaving(false);
  };

  const handleResetProps = () => {
    if (!schema) return;
    const defaults: Record<string, string> = {};
    for (const prop of schema.props) {
      if (prop.key === 'oem') continue;
      if (prop.default) {
        defaults[prop.key] = prop.default;
      } else if (prop.required) {
        defaults[prop.key] = `[${prop.label}]`;
      }
    }
    setPropValues(defaults);
    toast.success('Props reset to defaults');
  };

  const handleIframeLoad = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      syncPreviewMobileNormalizeStyle(doc, previewWidth === 'mobile');
      syncPreviewMobileStyles(doc, previewWidth === 'mobile');
      normalizePreviewMobileLayout(doc, previewWidth === 'mobile');
      const height = doc.body?.scrollHeight;
      if (height && height > 100) {
        iframe.style.height = `${height + 20}px`;
      }
    } catch {}
  };

  const lineCount = code.split('\n').length;

  // Group props for display
  const groupedProps: Record<string, PropSchema[]> = {};
  if (schema) {
    for (const prop of schema.props) {
      if (prop.key === 'oem') continue;
      const group = prop.group || 'General';
      if (!groupedProps[group]) groupedProps[group] = [];
      groupedProps[group].push(prop);
    }
  }

  return (
    <AdminOnly><div className="flex flex-col h-[calc(100vh-2rem)]">
      {/* Top toolbar */}
      <div className="flex items-center justify-between pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/components" className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
            <ArrowLeftIcon className="w-4 h-4" />
          </Link>
          <div>
            <h2 className="text-lg font-bold">{label}</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              {name}.html &middot; {lineCount} lines
              {hasChanges && <span className="text-amber-400 ml-2">Unsaved changes</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={compilePreview}
            disabled={previewLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--muted)] hover:bg-[var(--accent)] disabled:opacity-40 transition-colors"
            title="Refresh preview"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 ${previewLoading ? 'animate-spin' : ''}`} />
            Preview
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[var(--primary)] text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            <DocumentArrowDownIcon className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Main split pane */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left panel — Code / Playground */}
        <div className="w-[480px] flex-shrink-0 flex flex-col border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card)]">
          {/* Tabs */}
          <div className="flex items-center border-b border-[var(--border)] bg-[var(--muted)] flex-shrink-0">
            <button
              onClick={() => setPanelMode('playground')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${panelMode === 'playground' ? 'border-[var(--primary)] text-[var(--foreground)]' : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
            >
              <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
              Playground
            </button>
            <button
              onClick={() => setPanelMode('code')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${panelMode === 'code' ? 'border-[var(--primary)] text-[var(--foreground)]' : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
            >
              <CodeBracketIcon className="w-3.5 h-3.5" />
              Source
            </button>
          </div>

          {panelMode === 'code' ? (
            <div className="flex-1 min-h-0">
              <CodeEditor
                value={code}
                onChange={handleCodeChange}
                language="html"
                onSave={handleSave}
              />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              {/* OEM Selector */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
                  <SwatchIcon className="w-3.5 h-3.5" />
                  Brand Theme
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {OEM_LIST.map((oem) => (
                    <button
                      key={oem}
                      onClick={() => {
                        setSelectedOem(oem);
                        if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
                        previewTimerRef.current = setTimeout(() => compilePreview(), 300);
                      }}
                      className={`px-2 py-1.5 text-[10px] font-medium rounded-lg capitalize transition-colors ${
                        selectedOem === oem
                          ? 'bg-[var(--primary)] text-white'
                          : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]'
                      }`}
                    >
                      {oem}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-[var(--border)]" />

              {/* Props */}
              {schema ? (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                      Props
                    </h3>
                    <button
                      onClick={handleResetProps}
                      className="text-[10px] text-[var(--primary)] hover:underline"
                    >
                      Reset defaults
                    </button>
                  </div>

                  {Object.entries(groupedProps).map(([group, props]) => (
                    <div key={group}>
                      {Object.keys(groupedProps).length > 1 && (
                        <h4 className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 mt-3">
                          {group}
                        </h4>
                      )}
                      <div className="space-y-3">
                        {props.map((prop) => {
                          return (
                            <div key={prop.key}>
                              <label className="block text-[10px] text-[var(--muted-foreground)] mb-1">
                                {prop.label}
                                {prop.required && <span className="text-red-400 ml-0.5">*</span>}
                              </label>
                              <PropField
                                prop={prop}
                                value={propValues[prop.key] || ''}
                                onChange={(val) => handlePropChange(prop.key, val)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-[var(--muted-foreground)]">
                    No schema defined for this component.
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    Switch to Source tab to edit the HTML directly.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right panel — Preview */}
        <div className="flex-1 flex flex-col border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card)] min-w-0">
          <div className="flex items-center px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)] flex-shrink-0">
            <span className="text-xs text-[var(--muted-foreground)] font-medium flex-1">
              Section Preview
              {previewLoading && <span className="text-amber-400 ml-2">Compiling...</span>}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--muted-foreground)] mr-2 capitalize">{selectedOem}</span>
              <button
                onClick={() => setPreviewWidth('desktop')}
                className={`p-1.5 rounded ${previewWidth === 'desktop' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
                title="Desktop"
              >
                <ComputerDesktopIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPreviewWidth('mobile')}
                className={`p-1.5 rounded ${previewWidth === 'mobile' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
                title="Mobile (375px)"
              >
                <DevicePhoneMobileIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-zinc-700 flex justify-center">
            {previewError ? (
              <div className="max-w-md mx-auto p-6 text-center mt-8">
                <p className="text-red-400 text-sm font-medium mb-2">Preview Error</p>
                <p className="text-xs text-zinc-400 font-mono whitespace-pre-wrap">{previewError}</p>
              </div>
            ) : previewHtml ? (
              <div
                className="transition-all duration-200 ease-in-out"
                style={{
                  width: previewWidth === 'mobile' ? '375px' : '100%',
                  maxWidth: previewWidth === 'mobile' ? '375px' : '100%',
                }}
              >
                <iframe
                  ref={iframeRef}
                  key={`${previewHtml.length}-${previewWidth}`}
                  srcDoc={previewHtml}
                  className="w-full border-0 block mx-auto"
                  style={{
                    minHeight: '100vh',
                  }}
                  title="Section preview"
                  sandbox="allow-same-origin"
                  onLoad={handleIframeLoad}
                />
              </div>
            ) : (
              <div className="p-8 text-center text-zinc-500 text-sm mt-8">
                <ArrowPathIcon className="w-8 h-8 mx-auto mb-3 animate-spin" />
                <p>Loading preview...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div></AdminOnly>
  );
}
