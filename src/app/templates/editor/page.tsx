'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeftIcon,
  DevicePhoneMobileIcon,
  ComputerDesktopIcon,
  CheckIcon,
  ArrowPathIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LinkIcon,
  ArrowUpTrayIcon,
  EyeIcon,
  EyeSlashIcon,
  DocumentDuplicateIcon,
  BookOpenIcon,
  SparklesIcon,
  PaperAirplaneIcon,
  CalendarIcon,
  ClockIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { useAccount } from '@/contexts/account-context';
import {
  componentSchemas,
  getAvailableComponents,
  type RepeatableGroup,
} from '@/lib/component-schemas';
import { parseTemplate, type ParsedTemplate, type ParsedComponent } from '@/lib/template-parser';
import { serializeTemplate } from '@/lib/template-serializer';
import { ComponentIcon } from '@/components/icon-map';
import { CodeEditor } from '@/components/code-editor';

// ── Types ──

interface EspTemplateRecord {
  id: string;
  accountKey: string;
  provider: string;
  remoteId: string | null;
  publishedTo: string | null;
  name: string;
  subject: string | null;
  previewText: string | null;
  html: string;
  source: string | null;
  status: string;
  editorType: string | null;
  thumbnailUrl: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type EditorMode = 'visual' | 'code';

// ── Provider meta ──

const PROVIDER_META: Record<string, { displayName: string; iconSrc?: string }> = {
  ghl: {
    displayName: 'GoHighLevel',
    iconSrc: 'https://storage.googleapis.com/msgsndr/CVpny6EUSHRxlXfqAFb7/media/6992d3c254da0462343bf828.jpg',
  },
  klaviyo: {
    displayName: 'Klaviyo',
    iconSrc: 'https://storage.googleapis.com/msgsndr/CVpny6EUSHRxlXfqAFb7/media/6992d3ac3b3cc9155bdaf06e.png',
  },
};

// ── CSS unit helpers ──

function stripUnit(val: string): string {
  if (!val) return '';
  return val.replace(/px$/i, '');
}

function ensureUnit(val: string): string {
  if (!val) return '';
  const stripped = val.replace(/px$/i, '').trim();
  if (!stripped) return '';
  if (stripped === '0') return '0px';
  if (/^\d+(\.\d+)?$/.test(stripped)) return `${stripped}px`;
  return stripped;
}

// ── Padding helpers ──

function parsePadding(value: string): { top: string; right: string; bottom: string; left: string } {
  if (!value) return { top: '', right: '', bottom: '', left: '' };
  const parts = value.trim().split(/\s+/);
  if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  if (parts.length === 2) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  if (parts.length === 3) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
}

function serializePadding(sides: { top: string; right: string; bottom: string; left: string }): string {
  const { top, right, bottom, left } = sides;
  if (!top && !right && !bottom && !left) return '';
  const t = ensureUnit(top) || '0px';
  const r = ensureUnit(right) || '0px';
  const b = ensureUnit(bottom) || '0px';
  const l = ensureUnit(left) || '0px';
  if (t === r && r === b && b === l) return t;
  if (t === b && r === l) return `${t} ${r}`;
  if (r === l) return `${t} ${r} ${b}`;
  return `${t} ${r} ${b} ${l}`;
}

// ── Starter template for visual mode ──

const STARTER_TEMPLATE = `---
title: Untitled Template
preheader: ""
---

<x-base>

  <x-core.header />

  <x-core.hero headline="Your Headline Here" />

  <x-core.copy body="Add your message here." />

  <x-core.cta primary-button-text="Click Here" primary-button-url="#" />

  <x-core.footer />

</x-base>
`;

const STARTER_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Email Template</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px;text-align:center;">
              <h1 style="margin:0 0 16px;font-size:24px;color:#333333;">Your Headline</h1>
              <p style="margin:0 0 24px;font-size:16px;color:#666666;line-height:1.5;">
                Add your email content here.
              </p>
              <a href="#" style="display:inline-block;padding:12px 32px;background-color:#3b82f6;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">
                Call to Action
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

// ── Spacing field ──

function DraggableUnitInput({
  value, placeholder, onChange, className,
}: {
  value: string; placeholder: string; onChange: (val: string) => void; className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={stripUnit(value)}
        placeholder={stripUnit(placeholder) || '0'}
        onChange={(e) => onChange(e.target.value)}
        className={className || ''}
      />
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-[var(--muted-foreground)] pointer-events-none font-mono">
        px
      </span>
    </div>
  );
}

function SpacingField({ value, onChange, placeholder }: { value: string; onChange: (val: string) => void; placeholder?: string }) {
  const [linked, setLinked] = useState(() => {
    const parsed = parsePadding(value || placeholder || '');
    return parsed.top === parsed.right && parsed.right === parsed.bottom && parsed.bottom === parsed.left;
  });
  const displayValue = value || placeholder || '';
  const sides = parsePadding(displayValue);
  const isUsingDefault = !value;
  const placeholderSides = parsePadding(placeholder || '');

  const handleSideChange = (side: 'top' | 'right' | 'bottom' | 'left', rawVal: string) => {
    if (linked) {
      onChange(serializePadding({ top: rawVal, right: rawVal, bottom: rawVal, left: rawVal }));
    } else {
      const newSides = { ...sides, [side]: ensureUnit(rawVal) };
      onChange(serializePadding(newSides));
    }
  };

  const inputClass = `w-full bg-[var(--input)] border border-[var(--border)] rounded-lg pl-2 pr-5 py-1.5 text-xs text-center font-mono ${isUsingDefault ? 'text-[var(--muted-foreground)]' : ''}`;

  const gridCells: { key: 'top' | 'right' | 'bottom' | 'left'; label: string }[] = [
    { key: 'top', label: 'Top' }, { key: 'right', label: 'Right' },
    { key: 'bottom', label: 'Bottom' }, { key: 'left', label: 'Left' },
  ];

  return (
    <div className="flex items-center gap-2 max-w-[200px]">
      {linked ? (
        <DraggableUnitInput
          value={isUsingDefault ? '' : sides.top}
          placeholder={placeholderSides.top}
          onChange={(val) => handleSideChange('top', val)}
          className={inputClass}
        />
      ) : (
        <div className="grid grid-cols-2 gap-1.5 flex-1 min-w-0">
          {gridCells.map((cell) => (
            <div key={cell.key}>
              <label className="text-[9px] text-[var(--muted-foreground)] uppercase block text-center mb-0.5">{cell.label}</label>
              <DraggableUnitInput
                value={isUsingDefault ? '' : sides[cell.key]}
                placeholder={placeholderSides[cell.key]}
                onChange={(val) => handleSideChange(cell.key, val)}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => {
          if (!linked) {
            const uniform = stripUnit(sides.top) || '0';
            onChange(serializePadding({ top: uniform, right: uniform, bottom: uniform, left: uniform }));
          }
          setLinked(!linked);
        }}
        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors flex-shrink-0 ${linked ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'}`}
        title={linked ? 'Unlink sides' : 'Link all sides'}
      >
        <LinkIcon className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── PropField ──

function PropField({
  prop, value, onChange,
}: {
  prop: { key: string; label: string; type: string; default?: string; placeholder?: string; options?: { label: string; value: string }[] };
  value: string;
  onChange: (val: string) => void;
}) {
  const placeholderText = prop.placeholder || prop.default;

  if (prop.type === 'padding') return <SpacingField value={value} onChange={onChange} placeholder={placeholderText} />;
  if (prop.type === 'color') {
    return (
      <div className="flex items-center bg-[var(--input)] border border-[var(--border)] rounded-lg overflow-hidden">
        <input type="color" value={value || placeholderText || '#000000'} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 cursor-pointer bg-transparent flex-shrink-0 border-none p-0.5" />
        <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} className="flex-1 bg-transparent border-none px-2 py-1.5 text-sm font-mono outline-none" placeholder={placeholderText || '#000000'} />
      </div>
    );
  }
  if (prop.type === 'select') {
    return (
      <select value={value || prop.default || ''} onChange={(e) => onChange(e.target.value)} className="w-full bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm">
        <option value="">Default</option>
        {prop.options?.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    );
  }
  if (prop.type === 'textarea') {
    return <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm resize-none" placeholder={placeholderText} />;
  }
  if (prop.type === 'toggle') {
    const isOn = (value || prop.default) === 'true';
    return (
      <button onClick={() => onChange(isOn ? 'false' : 'true')} className={`relative w-10 h-5 rounded-full transition-colors ${isOn ? 'bg-[var(--primary)]' : 'bg-zinc-600'}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isOn ? 'left-5' : 'left-0.5'}`} />
      </button>
    );
  }
  return (
    <input
      type={prop.type === 'number' ? 'number' : 'text'}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
      placeholder={placeholderText}
    />
  );
}

// ── Component Props Renderer ──

function ComponentPropsRenderer({
  schema, props: compProps, allSchemaProps, onPropChange,
}: {
  schema: { repeatableGroups?: RepeatableGroup[] };
  props: Record<string, string>;
  allSchemaProps: { key: string; label: string; type: string; half?: boolean; repeatableGroup?: string; default?: string; placeholder?: string; options?: { label: string; value: string }[] }[];
  onPropChange: (key: string, val: string) => void;
}) {
  const standardProps = allSchemaProps.filter(p => !p.repeatableGroup);

  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < standardProps.length) {
    const prop = standardProps[i];
    const nextProp = standardProps[i + 1];
    if (prop.half && nextProp?.half) {
      elements.push(
        <div key={`${prop.key}-${nextProp.key}`} className="flex gap-2">
          <div className="flex-1 min-w-0">
            <label className="text-xs text-[var(--muted-foreground)] mb-1 block">{prop.label}</label>
            <PropField prop={prop} value={compProps[prop.key] || ''} onChange={(val) => onPropChange(prop.key, val)} />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-xs text-[var(--muted-foreground)] mb-1 block">{nextProp.label}</label>
            <PropField prop={nextProp} value={compProps[nextProp.key] || ''} onChange={(val) => onPropChange(nextProp.key, val)} />
          </div>
        </div>,
      );
      i += 2;
    } else {
      elements.push(
        <div key={prop.key}>
          <label className="text-xs text-[var(--muted-foreground)] mb-1 block">{prop.label}</label>
          <PropField prop={prop} value={compProps[prop.key] || ''} onChange={(val) => onPropChange(prop.key, val)} />
        </div>,
      );
      i += 1;
    }
  }

  // Repeatable groups
  const groups = schema.repeatableGroups || [];
  for (const group of groups) {
    const groupProps = allSchemaProps.filter(p => p.repeatableGroup === group.key);
    if (groupProps.length > 0) {
      elements.push(
        <div key={`group-${group.key}`} className="border-t border-[var(--border)] pt-3 mt-3">
          <p className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2">{group.label}s</p>
          <div className="space-y-2">
            {groupProps.map(prop => (
              <div key={prop.key}>
                <label className="text-xs text-[var(--muted-foreground)] mb-1 block">{prop.label}</label>
                <PropField prop={prop} value={compProps[prop.key] || ''} onChange={(val) => onPropChange(prop.key, val)} />
              </div>
            ))}
          </div>
        </div>,
      );
    }
  }

  return <div className="space-y-3">{elements}</div>;
}

// ── Preview component snippet ──

function getPreviewSnippet(comp: ParsedComponent): string {
  const p = comp.props;
  return p.headline || p.body || p.name || p['primary-button-text'] || p.eyebrow || p.title || '';
}

// ── Main Editor Page ──

export default function EspTemplateEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accountKey, accountData } = useAccount();

  // URL params
  const templateId = searchParams.get('id');
  const modeParam = searchParams.get('mode') as EditorMode | null;
  const accountKeyParam = searchParams.get('accountKey');
  const libraryTemplateSlug = searchParams.get('libraryTemplate');
  const effectiveAccountKey = accountKeyParam || accountKey;

  // Template state
  const [template, setTemplate] = useState<EspTemplateRecord | null>(null);
  const [loading, setLoading] = useState(!!templateId);
  const [editorMode, setEditorMode] = useState<EditorMode>(modeParam || 'visual');
  const [templateName, setTemplateName] = useState('Untitled Template');
  const [templateSubject, setTemplateSubject] = useState('');

  // Visual mode state
  const [source, setSource] = useState(STARTER_TEMPLATE);
  const [parsed, setParsed] = useState<ParsedTemplate | null>(null);
  const [expandedComponents, setExpandedComponents] = useState<Set<number>>(new Set());
  const [hiddenComponents, setHiddenComponents] = useState<Set<number>>(new Set());
  const [showComponentPicker, setShowComponentPicker] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Code mode state
  const [htmlCode, setHtmlCode] = useState(STARTER_HTML);

  // Preview
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save/publish
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const publishRef = useRef<HTMLDivElement>(null);

  // Save to Library
  const [showSaveToLibrary, setShowSaveToLibrary] = useState(false);
  const [libraryName, setLibraryName] = useState('');
  const [savingToLibrary, setSavingToLibrary] = useState(false);

  // History (undo/redo)
  const historyRef = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const lastPushedRef = useRef<string>('');
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Preview dropdown
  const [showPreviewDropdown, setShowPreviewDropdown] = useState(false);
  const previewDropdownRef = useRef<HTMLDivElement>(null);

  const connectedProviders: string[] = accountData?.connectedProviders || [];

  // ── Load existing template ──

  useEffect(() => {
    if (!templateId) {
      // New template — set mode from URL
      if (modeParam === 'code') {
        setEditorMode('code');
        setHtmlCode(STARTER_HTML);
      } else {
        setEditorMode('visual');
        // If libraryTemplate is specified, load from library
        if (libraryTemplateSlug) {
          (async () => {
            try {
              const res = await fetch(`/api/templates?design=${encodeURIComponent(libraryTemplateSlug)}&format=raw`);
              if (res.ok) {
                const data = await res.json();
                if (data.raw) {
                  setSource(data.raw);
                  // Extract title from the slug for the template name
                  const formatted = libraryTemplateSlug
                    .replace(/-/g, ' ')
                    .replace(/\b\w/g, (c: string) => c.toUpperCase());
                  setTemplateName(formatted);
                }
              }
            } catch { /* Fall back to starter */ }
          })();
        } else {
          setSource(STARTER_TEMPLATE);
        }
      }
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/esp/templates/${templateId}`);
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        const t = data.template as EspTemplateRecord;
        setTemplate(t);
        setTemplateName(t.name);
        setTemplateSubject(t.subject || '');

        if (t.source) {
          // Visual mode
          setEditorMode('visual');
          setSource(t.source);
        } else {
          // Code mode
          setEditorMode('code');
          setHtmlCode(t.html);
        }
      } catch {
        toast.error('Failed to load template');
        router.push('/templates');
      }
      setLoading(false);
    })();
  }, [templateId, modeParam, libraryTemplateSlug, router]);

  // ── Parse source when it changes (visual mode) ──

  useEffect(() => {
    if (editorMode !== 'visual') return;
    try {
      const p = parseTemplate(source);
      setParsed(p);
      // Update name from frontmatter if available
      if (p.frontmatter.title && !templateId) {
        setTemplateName(p.frontmatter.title);
      }
    } catch {
      // Parsing failed — keep previous parsed state
    }
  }, [source, editorMode, templateId]);

  // ── Compile preview (visual mode: Maizzle, code mode: direct) ──

  const compilePreview = useCallback(async (htmlContent: string, isVisual: boolean) => {
    setPreviewLoading(true);
    try {
      if (isVisual) {
        // Compile through Maizzle
        const res = await fetch('/api/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html: htmlContent }),
        });
        if (!res.ok) throw new Error('Compilation failed');
        const data = await res.json();
        setPreviewHtml(data.html || '');
      } else {
        // Direct HTML preview
        setPreviewHtml(htmlContent);
      }
    } catch {
      setPreviewHtml('<div style="padding:32px;color:#ef4444;font-family:sans-serif;">Preview compilation failed</div>');
    }
    setPreviewLoading(false);
  }, []);

  // Debounced preview compilation
  useEffect(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      if (editorMode === 'visual') {
        compilePreview(source, true);
      } else {
        compilePreview(htmlCode, false);
      }
    }, editorMode === 'visual' ? 500 : 300);
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
  }, [source, htmlCode, editorMode, compilePreview]);

  // Track changes
  useEffect(() => { setHasChanges(true); }, [source, htmlCode, templateName, templateSubject]);

  // Close publish dropdown on outside click
  useEffect(() => {
    if (!showPublish) return;
    function handleClick(e: MouseEvent) {
      if (publishRef.current && !publishRef.current.contains(e.target as Node)) {
        setShowPublish(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPublish]);

  // Close preview dropdown on outside click
  useEffect(() => {
    if (!showPreviewDropdown) return;
    function handleClick(e: MouseEvent) {
      if (previewDropdownRef.current && !previewDropdownRef.current.contains(e.target as Node)) {
        setShowPreviewDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPreviewDropdown]);

  // ── History: push snapshots on change (debounced) ──

  useEffect(() => {
    const current = editorMode === 'visual' ? source : htmlCode;
    if (current === lastPushedRef.current) return;
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => {
      if (lastPushedRef.current) {
        historyRef.current.past.push(lastPushedRef.current);
        // Cap history at 50 entries
        if (historyRef.current.past.length > 50) historyRef.current.past.shift();
        historyRef.current.future = [];
      }
      lastPushedRef.current = current;
    }, 800);
    return () => { if (historyTimerRef.current) clearTimeout(historyTimerRef.current); };
  }, [source, htmlCode, editorMode]);

  const handleUndo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (past.length === 0) return;
    const prev = past.pop()!;
    const current = editorMode === 'visual' ? source : htmlCode;
    future.push(current);
    lastPushedRef.current = prev;
    if (editorMode === 'visual') setSource(prev);
    else setHtmlCode(prev);
  }, [editorMode, source, htmlCode]);

  const handleRedo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (future.length === 0) return;
    const next = future.pop()!;
    const current = editorMode === 'visual' ? source : htmlCode;
    past.push(current);
    lastPushedRef.current = next;
    if (editorMode === 'visual') setSource(next);
    else setHtmlCode(next);
  }, [editorMode, source, htmlCode]);

  // ── Auto-save (3s after last change, only if template exists) ──

  useEffect(() => {
    if (!hasChanges || !template?.id) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      // Trigger auto-save
      setSaveStatus('saving');
      (async () => {
        let compiledHtml = htmlCode;
        if (editorMode === 'visual') {
          try {
            const res = await fetch('/api/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ html: source }),
            });
            if (res.ok) {
              const data = await res.json();
              compiledHtml = data.html || '';
            }
          } catch { /* fallback */ }
        }
        try {
          const res = await fetch(`/api/esp/templates/${template.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountKey: effectiveAccountKey,
              name: templateName.trim() || 'Untitled Template',
              subject: templateSubject.trim() || undefined,
              html: compiledHtml,
              source: editorMode === 'visual' ? source : null,
              editorType: editorMode,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            setTemplate(data.template);
            setHasChanges(false);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
          } else {
            setSaveStatus('idle');
          }
        } catch {
          setSaveStatus('idle');
        }
      })();
    }, 3000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, htmlCode, templateName, templateSubject, hasChanges, template?.id]);

  // ── Copy HTML to clipboard ──

  const handleCopyHtml = useCallback(async () => {
    const content = editorMode === 'visual' ? previewHtml : htmlCode;
    if (!content) { toast.error('Nothing to copy'); return; }
    try {
      await navigator.clipboard.writeText(content);
      toast.success('HTML copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  }, [editorMode, previewHtml, htmlCode]);

  // ── Visual mode: component management ──

  const syncVisualToSource = useCallback((updatedParsed: ParsedTemplate) => {
    const newSource = serializeTemplate(updatedParsed);
    setSource(newSource);
    setParsed(updatedParsed);
  }, []);

  const handleComponentPropChange = useCallback((componentIndex: number, propKey: string, value: string) => {
    if (!parsed) return;
    const updated = { ...parsed, components: [...parsed.components] };
    updated.components[componentIndex] = {
      ...updated.components[componentIndex],
      props: { ...updated.components[componentIndex].props, [propKey]: value },
    };
    syncVisualToSource(updated);
  }, [parsed, syncVisualToSource]);

  const handleAddComponent = useCallback((componentType: string) => {
    if (!parsed) return;
    const schema = componentSchemas[componentType];
    const newProps: Record<string, string> = {};
    if (schema) {
      for (const prop of schema.props) {
        if (prop.default) newProps[prop.key] = prop.default;
        else if (prop.required) newProps[prop.key] = `[${prop.label}]`;
      }
    }
    const newComponent: ParsedComponent = { type: componentType, props: newProps };
    const updated = { ...parsed, components: [...parsed.components, newComponent] };
    setExpandedComponents(prev => new Set([...prev, updated.components.length - 1]));
    setShowComponentPicker(false);
    syncVisualToSource(updated);
  }, [parsed, syncVisualToSource]);

  const handleDeleteComponent = useCallback((index: number) => {
    if (!parsed) return;
    const updated = { ...parsed, components: parsed.components.filter((_, i) => i !== index) };
    setExpandedComponents(prev => {
      const next = new Set<number>();
      prev.forEach(i => { if (i < index) next.add(i); else if (i > index) next.add(i - 1); });
      return next;
    });
    setHiddenComponents(prev => {
      const next = new Set<number>();
      prev.forEach(i => { if (i < index) next.add(i); else if (i > index) next.add(i - 1); });
      return next;
    });
    syncVisualToSource(updated);
  }, [parsed, syncVisualToSource]);

  const handleDuplicateComponent = useCallback((index: number) => {
    if (!parsed) return;
    const clone = { ...parsed.components[index], props: { ...parsed.components[index].props } };
    const newComponents = [...parsed.components];
    newComponents.splice(index + 1, 0, clone);
    const updated = { ...parsed, components: newComponents };
    setExpandedComponents(prev => {
      const next = new Set<number>();
      prev.forEach(i => { if (i <= index) next.add(i); else next.add(i + 1); });
      next.add(index + 1);
      return next;
    });
    syncVisualToSource(updated);
  }, [parsed, syncVisualToSource]);

  const handleReorderComponent = useCallback((from: number, to: number) => {
    if (!parsed || from === to) return;
    const newComponents = [...parsed.components];
    const [moved] = newComponents.splice(from, 1);
    newComponents.splice(to, 0, moved);
    const updated = { ...parsed, components: newComponents };
    syncVisualToSource(updated);
  }, [parsed, syncVisualToSource]);

  // ── Save ──

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    let compiledHtml = htmlCode;
    if (editorMode === 'visual') {
      // Compile to get final HTML
      try {
        const res = await fetch('/api/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html: source }),
        });
        if (res.ok) {
          const data = await res.json();
          compiledHtml = data.html || '';
        }
      } catch { /* Use source as fallback */ }
    }

    const body = {
      accountKey: effectiveAccountKey,
      name: templateName.trim() || 'Untitled Template',
      subject: templateSubject.trim() || undefined,
      html: compiledHtml,
      source: editorMode === 'visual' ? source : null,
      editorType: editorMode,
    };

    try {
      if (template?.id) {
        // Update existing
        const res = await fetch(`/api/esp/templates/${template.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (res.ok) {
          setTemplate(data.template);
          setHasChanges(false);
          toast.success('Template saved');
        } else {
          toast.error(data.error || 'Failed to save');
        }
      } else {
        // Create new
        const res = await fetch('/api/esp/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (res.ok) {
          setTemplate(data.template);
          setHasChanges(false);
          toast.success('Template created');
          // Update URL to include the new template ID
          const url = new URL(window.location.href);
          url.searchParams.set('id', data.template.id);
          url.searchParams.delete('mode');
          url.searchParams.delete('accountKey');
          window.history.replaceState({}, '', url.toString());
        } else {
          toast.error(data.error || 'Failed to create');
        }
      }
    } catch {
      toast.error('Failed to save template');
    }
    setSaving(false);
  }, [saving, editorMode, source, htmlCode, template, effectiveAccountKey, templateName, templateSubject]);

  // ── Publish ──

  const handlePublish = useCallback(async () => {
    if (publishing || selectedProviders.size === 0) return;

    // Save first if needed
    if (!template?.id || hasChanges) {
      await handleSave();
    }

    // Need the template ID
    const tplId = template?.id;
    if (!tplId) {
      toast.error('Save the template first');
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch(`/api/esp/templates/${tplId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: Array.from(selectedProviders) }),
      });
      const data = await res.json();
      if (res.ok) {
        const results = data.results || [];
        const successes = results.filter((r: { success: boolean }) => r.success);
        const failures = results.filter((r: { success: boolean }) => !r.success);
        if (successes.length > 0) {
          toast.success(`Published to ${successes.map((r: { provider: string }) => PROVIDER_META[r.provider]?.displayName || r.provider).join(', ')}`);
        }
        for (const f of failures) {
          toast.error(`Failed to publish to ${PROVIDER_META[f.provider]?.displayName || f.provider}: ${f.error}`);
        }
        if (data.template) setTemplate(data.template);
        setShowPublish(false);
      } else {
        toast.error(data.error || 'Publish failed');
      }
    } catch {
      toast.error('Publish failed');
    }
    setPublishing(false);
  }, [publishing, selectedProviders, template, hasChanges, handleSave]);

  // ── Save to Library ──

  const handleSaveToLibrary = useCallback(async () => {
    if (savingToLibrary || !libraryName.trim()) return;
    setSavingToLibrary(true);

    try {
      // 1. Create library entry
      const createRes = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design: libraryName.trim() }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        toast.error(createData.error || 'Failed to create library template');
        setSavingToLibrary(false);
        return;
      }

      const slug = createData.design;

      // 2. Save content to the library template
      const content = editorMode === 'visual' ? source : htmlCode;
      const updateRes = await fetch('/api/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design: slug, raw: content }),
      });

      if (!updateRes.ok) {
        toast.error('Created library entry but failed to save content');
        setSavingToLibrary(false);
        return;
      }

      toast.success('Saved to Template Library');
      setShowSaveToLibrary(false);
      setLibraryName('');
    } catch {
      toast.error('Failed to save to library');
    }
    setSavingToLibrary(false);
  }, [savingToLibrary, libraryName, editorMode, source, htmlCode]);

  // ── Available components (filtered for picker) ──

  const availableComponents = useMemo(() => getAvailableComponents(), []);

  // ── Loading state ──

  if (loading) {
    return (
      <div className="fixed inset-0 ml-60 flex items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[var(--muted-foreground)]">Loading template...</span>
        </div>
      </div>
    );
  }

  // ── Render ──

  return (
    <div className="fixed inset-0 ml-60 flex flex-col bg-[var(--background)] z-40">
      {/* ── Main Header ── */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-[var(--border)] bg-[var(--card)] flex-shrink-0">
        {/* Back */}
        <button
          onClick={() => router.push('/templates')}
          className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          title="Back to templates"
        >
          <ArrowLeftIcon className="w-4 h-4" />
        </button>

        {/* Template name */}
        <input
          type="text"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          className="text-sm font-semibold bg-transparent border-none outline-none text-[var(--foreground)] min-w-[200px] max-w-[400px] px-2 py-1 rounded hover:bg-[var(--muted)] focus:bg-[var(--muted)] transition-colors"
          placeholder="Template name"
        />

        {/* Mode badge */}
        <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${
          editorMode === 'visual'
            ? 'bg-purple-500/10 text-purple-400'
            : 'bg-blue-500/10 text-blue-400'
        }`}>
          {editorMode === 'visual' ? 'Drag & Drop' : 'HTML'}
        </span>

        <div className="flex-1" />

        {/* Ask Loomi */}
        <button
          onClick={() => toast.info('Ask Loomi coming soon')}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
        >
          <SparklesIcon className="w-4 h-4" />
          Ask Loomi
        </button>

        {/* Send Test */}
        <button
          onClick={() => toast.info('Send Test coming soon')}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
        >
          <PaperAirplaneIcon className="w-4 h-4" />
          Send Test
        </button>

        {/* Schedule */}
        <button
          onClick={() => toast.info('Schedule coming soon')}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
        >
          <CalendarIcon className="w-4 h-4" />
          Schedule
        </button>

        {/* History (clock icon only) */}
        <button
          onClick={() => toast.info('Version history coming soon')}
          className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          title="Version History"
        >
          <ClockIcon className="w-4 h-4" />
        </button>
      </div>

      {/* ── Editor Body ── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left Panel ── */}
        <div className="w-[420px] border-r border-[var(--border)] flex flex-col bg-[var(--card)] flex-shrink-0 overflow-hidden">
          {editorMode === 'visual' && parsed ? (
            <>
              {/* Subject line */}
              <div className="px-4 py-3 border-b border-[var(--border)]">
                <label className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider block mb-1">Subject Line</label>
                <input
                  type="text"
                  value={templateSubject}
                  onChange={(e) => setTemplateSubject(e.target.value)}
                  className="w-full text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[var(--foreground)]"
                  placeholder="Email subject line"
                />
              </div>

              {/* Component list */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
                {parsed.components.map((comp, idx) => {
                  const schema = componentSchemas[comp.type];
                  const isExpanded = expandedComponents.has(idx);
                  const isHidden = hiddenComponents.has(idx);
                  const snippet = getPreviewSnippet(comp);
                  const isDragOver = dragOverIndex === idx;

                  return (
                    <div
                      key={`${comp.type}-${idx}`}
                      className={`rounded-xl border transition-all ${
                        isDragOver
                          ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                          : 'border-[var(--border)] bg-[var(--background)]'
                      } ${isHidden ? 'opacity-50' : ''}`}
                      draggable
                      onDragStart={() => setDragIndex(idx)}
                      onDragOver={(e) => { e.preventDefault(); setDragOverIndex(idx); }}
                      onDragLeave={() => setDragOverIndex(null)}
                      onDrop={() => {
                        if (dragIndex !== null && dragIndex !== idx) {
                          handleReorderComponent(dragIndex, idx);
                        }
                        setDragIndex(null);
                        setDragOverIndex(null);
                      }}
                      onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                    >
                      {/* Component header */}
                      <div
                        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer group"
                        onClick={() => {
                          setExpandedComponents(prev => {
                            const next = new Set(prev);
                            if (next.has(idx)) next.delete(idx);
                            else next.add(idx);
                            return next;
                          });
                        }}
                      >
                        {/* Drag handle */}
                        <div className="cursor-grab text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor"><circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/><circle cx="2" cy="12" r="1.2"/><circle cx="6" cy="12" r="1.2"/></svg>
                        </div>

                        {/* Icon + label */}
                        {schema && <ComponentIcon name={schema.icon} className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold block truncate">{schema?.label || comp.type}</span>
                          {snippet && !isExpanded && (
                            <span className="text-[10px] text-[var(--muted-foreground)] block truncate">{snippet}</span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); setHiddenComponents(prev => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; }); }}
                            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                            title={isHidden ? 'Show' : 'Hide'}
                          >
                            {isHidden ? <EyeSlashIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDuplicateComponent(idx); }}
                            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                            title="Duplicate"
                          >
                            <DocumentDuplicateIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteComponent(idx); }}
                            className="p-1 rounded text-[var(--muted-foreground)] hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Chevron */}
                        {isExpanded
                          ? <ChevronUpIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)] flex-shrink-0" />
                          : <ChevronDownIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)] flex-shrink-0" />
                        }
                      </div>

                      {/* Expanded props */}
                      {isExpanded && schema && (
                        <div className="px-3 pb-3 border-t border-[var(--border)] pt-3">
                          <ComponentPropsRenderer
                            schema={schema}
                            props={comp.props}
                            allSchemaProps={schema.props}
                            onPropChange={(key, val) => handleComponentPropChange(idx, key, val)}
                          />
                        </div>
                      )}

                      {/* Expanded but no schema — raw prop editing */}
                      {isExpanded && !schema && (
                        <div className="px-3 pb-3 border-t border-[var(--border)] pt-3 space-y-2">
                          {Object.entries(comp.props).map(([key, val]) => (
                            <div key={key}>
                              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">{key}</label>
                              <input
                                type="text"
                                value={val}
                                onChange={(e) => handleComponentPropChange(idx, key, e.target.value)}
                                className="w-full bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Add section button */}
                <button
                  onClick={() => setShowComponentPicker(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 mt-2 border-2 border-dashed border-[var(--border)] rounded-xl text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--primary)] transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add Section
                </button>
              </div>
            </>
          ) : (
            /* Code mode — Monaco editor */
            <div className="flex-1 flex flex-col">
              <div className="px-4 py-3 border-b border-[var(--border)]">
                <label className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider block mb-1">Subject Line</label>
                <input
                  type="text"
                  value={templateSubject}
                  onChange={(e) => setTemplateSubject(e.target.value)}
                  className="w-full text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[var(--foreground)]"
                  placeholder="Email subject line"
                />
              </div>
              <div className="flex-1 min-h-0">
                <CodeEditor
                  value={htmlCode}
                  onChange={(val) => setHtmlCode(val)}
                  onSave={handleSave}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Right Panel — Preview ── */}
        <div className="flex-1 flex flex-col bg-zinc-800 min-w-0">
          {/* Preview toolbar */}
          <div className="flex items-center gap-2 px-4 h-10 border-b border-zinc-700 flex-shrink-0">
            {/* Preview dropdown (left) */}
            <div ref={previewDropdownRef} className="relative">
              <button
                onClick={() => setShowPreviewDropdown(!showPreviewDropdown)}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Preview
                <ChevronDownIcon className={`w-3 h-3 transition-transform ${showPreviewDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showPreviewDropdown && (
                <div className="absolute left-0 top-full mt-2 z-50 w-56 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl animate-fade-in-up overflow-hidden">
                  <button
                    onClick={() => {
                      setLibraryName(templateName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
                      setShowSaveToLibrary(true);
                      setShowPreviewDropdown(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    <BookOpenIcon className="w-4 h-4 text-zinc-400" />
                    Save to Library
                  </button>
                  {connectedProviders.length > 0 && (
                    <button
                      onClick={() => {
                        setShowPublish(true);
                        setShowPreviewDropdown(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      <ArrowUpTrayIcon className="w-4 h-4 text-zinc-400" />
                      Publish
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1" />

            {/* Desktop/Mobile toggle (center) */}
            <div className="flex items-center gap-1 bg-zinc-700 rounded-lg p-0.5">
              <button
                onClick={() => setPreviewWidth('desktop')}
                className={`p-1 rounded-md transition-colors ${previewWidth === 'desktop' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
                title="Desktop"
              >
                <ComputerDesktopIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPreviewWidth('mobile')}
                className={`p-1 rounded-md transition-colors ${previewWidth === 'mobile' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
                title="Mobile"
              >
                <DevicePhoneMobileIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1" />

            {/* Right actions: Undo/Redo · Copy · Save · Refresh */}
            <div className="flex items-center gap-0.5">
              {/* Undo */}
              <button
                onClick={handleUndo}
                disabled={historyRef.current.past.length === 0}
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Undo"
              >
                <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
              </button>
              {/* Redo */}
              <button
                onClick={handleRedo}
                disabled={historyRef.current.future.length === 0}
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Redo"
              >
                <ArrowUturnRightIcon className="w-3.5 h-3.5" />
              </button>

              {/* Divider */}
              <div className="w-px h-4 bg-zinc-600 mx-1" />

              {/* Copy HTML */}
              <button
                onClick={handleCopyHtml}
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors"
                title="Copy HTML"
              >
                <ClipboardDocumentIcon className="w-3.5 h-3.5" />
              </button>
              {/* Save */}
              <button
                onClick={handleSave}
                disabled={saving}
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
                title="Save"
              >
                {saving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckIcon className="w-3.5 h-3.5" />}
              </button>
              {/* Refresh preview */}
              <button
                onClick={() => {
                  if (editorMode === 'visual') compilePreview(source, true);
                  else compilePreview(htmlCode, false);
                }}
                disabled={previewLoading}
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
                title="Refresh preview"
              >
                <ArrowPathIcon className={`w-3.5 h-3.5 ${previewLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Auto-save indicator */}
            {saveStatus !== 'idle' && (
              <span className={`text-[10px] ml-1 ${saveStatus === 'saving' ? 'text-zinc-500' : 'text-green-500'}`}>
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>

          {/* Preview iframe */}
          <div className="flex-1 overflow-auto flex justify-center p-4">
            <div
              className="bg-white rounded-lg shadow-2xl overflow-hidden transition-all duration-300"
              style={{
                width: previewWidth === 'mobile' ? '375px' : '100%',
                maxWidth: '700px',
                minHeight: '200px',
              }}
            >
              {previewLoading && !previewHtml && (
                <div className="flex items-center justify-center py-32">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {previewHtml && (
                <iframe
                  srcDoc={previewHtml}
                  className="w-full border-0"
                  style={{ minHeight: '600px', height: '100%' }}
                  title="Template preview"
                  sandbox="allow-same-origin"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Component Picker Modal ── */}
      {showComponentPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in" onClick={() => setShowComponentPicker(false)}>
          <div className="glass-modal w-[500px] max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h3 className="text-base font-semibold">Add Section</h3>
              <button onClick={() => setShowComponentPicker(false)} className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2">
              {availableComponents.map((schema) => (
                <button
                  key={schema.name}
                  onClick={() => handleAddComponent(schema.name)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] text-left hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all"
                >
                  <ComponentIcon name={schema.icon} className="w-6 h-6 text-[var(--muted-foreground)] flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-sm font-medium block">{schema.label}</span>
                    <span className="text-[10px] text-[var(--muted-foreground)]">{schema.props.length} props</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Save to Library Modal ── */}
      {showSaveToLibrary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in" onClick={() => setShowSaveToLibrary(false)}>
          <div className="glass-modal w-[420px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h3 className="text-base font-semibold">Save to Template Library</h3>
              <button onClick={() => setShowSaveToLibrary(false)} className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-[var(--muted-foreground)] mb-1.5 block">Template Name</label>
                <input
                  type="text"
                  value={libraryName}
                  onChange={(e) => setLibraryName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveToLibrary()}
                  className="w-full text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]"
                  placeholder="e.g. spring-sale"
                  autoFocus
                />
                <p className="text-[10px] text-[var(--muted-foreground)] mt-1">
                  This will save the current template to the shared library.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowSaveToLibrary(false)}
                  className="px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveToLibrary}
                  disabled={savingToLibrary || !libraryName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {savingToLibrary ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <BookOpenIcon className="w-4 h-4" />}
                  {savingToLibrary ? 'Saving...' : 'Save to Library'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Publish Modal ── */}
      {showPublish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in" onClick={() => setShowPublish(false)}>
          <div className="glass-modal w-[360px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div>
                <h3 className="text-base font-semibold">Publish Template</h3>
                <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">Select which integrations to publish this template to.</p>
              </div>
              <button onClick={() => setShowPublish(false)} className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 space-y-1">
              {connectedProviders.map(provider => {
                const meta = PROVIDER_META[provider];
                const isSelected = selectedProviders.has(provider);
                const published = template?.publishedTo ? JSON.parse(template.publishedTo) : {};
                const alreadyPublished = !!published[provider];

                return (
                  <button
                    key={provider}
                    onClick={() => {
                      setSelectedProviders(prev => {
                        const next = new Set(prev);
                        if (next.has(provider)) next.delete(provider);
                        else next.add(provider);
                        return next;
                      });
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      isSelected
                        ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                        : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[var(--border)]'
                    }`}>
                      {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
                    </div>
                    {meta?.iconSrc && (
                      <img src={meta.iconSrc} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                    )}
                    <span className="flex-1 text-left">{meta?.displayName || provider}</span>
                    {alreadyPublished && (
                      <span className="text-[10px] text-green-500 font-medium">Published</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="px-5 pb-4">
              <button
                onClick={handlePublish}
                disabled={publishing || selectedProviders.size === 0}
                className="w-full py-2.5 text-sm font-medium rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {publishing ? 'Publishing...' : `Publish to ${selectedProviders.size} platform${selectedProviders.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
