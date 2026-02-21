'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  PlusIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
  ListBulletIcon,
  TrashIcon,
  PencilSquareIcon,
  ArrowPathIcon,
  EnvelopeIcon,
  CodeBracketIcon,
  EllipsisVerticalIcon,
  ArrowUpTrayIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { useAccount } from '@/contexts/account-context';

// ── Types ──

interface EspTemplateRecord {
  id: string;
  accountKey: string;
  provider: string;
  remoteId: string | null;
  name: string;
  subject: string | null;
  previewText: string | null;
  html: string;
  status: string;
  editorType: string | null;
  thumbnailUrl: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProviderInfo {
  id: string;
  displayName: string;
  iconSrc?: string;
}

// ── Helpers ──

const VIEW_KEY = 'loomi-templates-view';

function loadView(): 'card' | 'list' {
  if (typeof window === 'undefined') return 'card';
  return (localStorage.getItem(VIEW_KEY) as 'card' | 'list') || 'card';
}
function saveView(view: 'card' | 'list') {
  localStorage.setItem(VIEW_KEY, view);
}

const statusColors: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#f59e0b20', text: '#f59e0b' },
  active: { bg: '#10b98120', text: '#10b981' },
  archived: { bg: '#6b728020', text: '#6b7280' },
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

// Known providers — used for pills and filter
const PROVIDER_META: Record<string, ProviderInfo> = {
  ghl: {
    id: 'ghl',
    displayName: 'GoHighLevel',
    iconSrc: 'https://storage.googleapis.com/msgsndr/CVpny6EUSHRxlXfqAFb7/media/6992d3c254da0462343bf828.jpg',
  },
  klaviyo: {
    id: 'klaviyo',
    displayName: 'Klaviyo',
    iconSrc: 'https://storage.googleapis.com/msgsndr/CVpny6EUSHRxlXfqAFb7/media/6992d3ac3b3cc9155bdaf06e.png',
  },
};

function providerLabel(provider: string): string {
  return PROVIDER_META[provider]?.displayName || provider;
}

function providerIcon(provider: string): string | undefined {
  return PROVIDER_META[provider]?.iconSrc;
}

// ── Page ──

export default function TemplatesPage() {
  const { isAccount, accountKey, accountData } = useAccount();

  // State
  const [templates, setTemplates] = useState<EspTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');

  // CRUD modals
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<EspTemplateRecord | null>(null);
  const [deleteTemplate, setDeleteTemplate] = useState<EspTemplateRecord | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Create form state
  const [formName, setFormName] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formPreviewText, setFormPreviewText] = useState('');
  const [formHtml, setFormHtml] = useState('');
  const [formSyncToRemote, setFormSyncToRemote] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setViewMode(loadView()); }, []);

  // Close menus on outside click
  useEffect(() => {
    const handler = () => setOpenMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Derive the effective account key
  const effectiveAccountKey = isAccount ? accountKey : accountKey;

  // ── Data Loading ──

  const loadTemplates = useCallback(async () => {
    if (!effectiveAccountKey) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/esp/templates?accountKey=${encodeURIComponent(effectiveAccountKey)}`);
      const data = await res.json();
      if (res.ok) {
        setTemplates(data.templates || []);
      } else {
        console.error('Failed to load templates:', data.error);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
    setLoading(false);
  }, [effectiveAccountKey]);

  useEffect(() => {
    setLoading(true);
    loadTemplates();
  }, [loadTemplates]);

  // ── Sync from ESP ──

  const handleSync = async () => {
    if (!effectiveAccountKey || syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/esp/templates/sync?accountKey=${encodeURIComponent(effectiveAccountKey)}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Synced ${data.sync.total} templates (${data.sync.created} new, ${data.sync.updated} updated)`);
        await loadTemplates();
      } else {
        toast.error(data.error || 'Failed to sync');
      }
    } catch {
      toast.error('Failed to sync templates');
    }
    setSyncing(false);
  };

  // ── Filtering ──

  const filtered = useMemo(() => {
    let result = templates;
    if (providerFilter !== 'all') {
      result = result.filter(t => t.provider === providerFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) ||
        (t.subject && t.subject.toLowerCase().includes(q))
      );
    }
    return result;
  }, [templates, providerFilter, search]);

  const uniqueProviders = useMemo(() => {
    const set = new Set(templates.map(t => t.provider));
    return Array.from(set).sort();
  }, [templates]);

  const toggleView = (mode: 'card' | 'list') => { setViewMode(mode); saveView(mode); };

  // ── Create ──

  const resetForm = () => {
    setFormName('');
    setFormSubject('');
    setFormPreviewText('');
    setFormHtml('');
    setFormSyncToRemote(false);
  };

  const handleCreate = async () => {
    if (!formName.trim() || !effectiveAccountKey || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/esp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountKey: effectiveAccountKey,
          name: formName.trim(),
          subject: formSubject.trim() || undefined,
          previewText: formPreviewText.trim() || undefined,
          html: formHtml,
          syncToRemote: formSyncToRemote,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.synced ? 'Template created and synced to ESP' : 'Template created locally');
        setShowCreate(false);
        resetForm();
        await loadTemplates();
      } else {
        toast.error(data.error || 'Failed to create template');
      }
    } catch {
      toast.error('Failed to create template');
    }
    setSaving(false);
  };

  // ── Edit ──

  const openEdit = (t: EspTemplateRecord) => {
    setEditTemplate(t);
    setFormName(t.name);
    setFormSubject(t.subject || '');
    setFormPreviewText(t.previewText || '');
    setFormHtml(t.html);
    setFormSyncToRemote(false);
  };

  const handleUpdate = async () => {
    if (!editTemplate || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/esp/templates/${editTemplate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          subject: formSubject.trim() || undefined,
          previewText: formPreviewText.trim() || undefined,
          html: formHtml,
          syncToRemote: formSyncToRemote,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.synced ? 'Template updated and synced to ESP' : 'Template updated locally');
        setEditTemplate(null);
        resetForm();
        await loadTemplates();
      } else {
        toast.error(data.error || 'Failed to update template');
      }
    } catch {
      toast.error('Failed to update template');
    }
    setSaving(false);
  };

  // ── Delete ──

  const handleDelete = async (deleteFromRemote: boolean) => {
    if (!deleteTemplate) return;
    try {
      const url = `/api/esp/templates/${deleteTemplate.id}${deleteFromRemote ? '?deleteFromRemote=true' : ''}`;
      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.remoteDeleted ? 'Template deleted from Loomi and ESP' : 'Template deleted locally');
        setDeleteTemplate(null);
        await loadTemplates();
      } else {
        toast.error(data.error || 'Failed to delete');
      }
    } catch {
      toast.error('Failed to delete template');
    }
  };

  // ── Provider Pill ──

  const ProviderPill = ({ provider }: { provider: string }) => {
    const icon = providerIcon(provider);
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--muted)] text-[10px] font-medium text-[var(--muted-foreground)]">
        {icon && (
          <img src={icon} alt={providerLabel(provider)} className="w-3.5 h-3.5 rounded-full object-cover" />
        )}
        {providerLabel(provider)}
      </span>
    );
  };

  // ── Template Card ──

  const TemplateCard = ({ t }: { t: EspTemplateRecord }) => {
    const sc = statusColors[t.status] || statusColors.draft;
    const isMenuOpen = openMenu === t.id;

    return (
      <div className="glass-card rounded-xl group animate-fade-in-up">
        {/* Thumbnail area */}
        <div className="h-32 rounded-t-xl bg-[var(--muted)] flex items-center justify-center overflow-hidden">
          {t.thumbnailUrl ? (
            <img src={t.thumbnailUrl} alt={t.name} className="w-full h-full object-cover" />
          ) : (
            <EnvelopeIcon className="w-10 h-10 text-[var(--muted-foreground)] opacity-30" />
          )}
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <ProviderPill provider={t.provider} />
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setOpenMenu(isMenuOpen ? null : t.id); }}
                className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors opacity-0 group-hover:opacity-100"
              >
                <EllipsisVerticalIcon className="w-4 h-4" />
              </button>
              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-44 glass-dropdown" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => { setOpenMenu(null); openEdit(t); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                  >
                    <PencilSquareIcon className="w-4 h-4" /> Edit
                  </button>
                  <button
                    onClick={() => { setOpenMenu(null); setDeleteTemplate(t); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
          <h3
            className="text-sm font-semibold cursor-pointer hover:text-[var(--primary)] transition-colors truncate"
            onClick={() => openEdit(t)}
          >
            {t.name}
          </h3>
          {t.subject && (
            <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5 truncate">{t.subject}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span
              className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ backgroundColor: sc.bg, color: sc.text }}
            >
              {t.status}
            </span>
            {t.remoteId && (
              <ArrowUpTrayIcon className="w-3 h-3 text-[var(--muted-foreground)]" title="Synced to ESP" />
            )}
            <span className="text-[10px] text-[var(--muted-foreground)] ml-auto">{timeAgo(t.updatedAt)}</span>
          </div>
        </div>
      </div>
    );
  };

  // ── Template Row (list view) ──

  const TemplateRow = ({ t }: { t: EspTemplateRecord }) => {
    const sc = statusColors[t.status] || statusColors.draft;
    const isMenuOpen = openMenu === t.id;

    return (
      <div className="flex items-center gap-4 p-3 glass-card rounded-xl group animate-fade-in-up">
        <div className="w-10 h-10 rounded-lg bg-[var(--muted)] flex items-center justify-center flex-shrink-0 overflow-hidden">
          {t.thumbnailUrl ? (
            <img src={t.thumbnailUrl} alt={t.name} className="w-full h-full object-cover" />
          ) : (
            <EnvelopeIcon className="w-5 h-5 text-[var(--muted-foreground)] opacity-40" />
          )}
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(t)}>
          <h3 className="font-semibold text-sm truncate">{t.name}</h3>
          <p className="text-[10px] text-[var(--muted-foreground)] truncate">
            {t.subject || 'No subject'}
          </p>
        </div>
        <ProviderPill provider={t.provider} />
        <span
          className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: sc.bg, color: sc.text }}
        >
          {t.status}
        </span>
        {t.remoteId && (
          <ArrowUpTrayIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)] flex-shrink-0" title="Synced to ESP" />
        )}
        <span className="text-[10px] text-[var(--muted-foreground)] flex-shrink-0 w-14 text-right">
          {timeAgo(t.updatedAt)}
        </span>
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setOpenMenu(isMenuOpen ? null : t.id); }}
            className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <EllipsisVerticalIcon className="w-4 h-4" />
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-44 glass-dropdown" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => { setOpenMenu(null); openEdit(t); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              >
                <PencilSquareIcon className="w-4 h-4" /> Edit
              </button>
              <button
                onClick={() => { setOpenMenu(null); setDeleteTemplate(t); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <TrashIcon className="w-4 h-4" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Template Form (shared between create and edit) ──

  const TemplateForm = ({ mode }: { mode: 'create' | 'edit' }) => {
    const isEdit = mode === 'edit';
    const hasRemoteId = isEdit && editTemplate?.remoteId;

    return (
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-[var(--muted-foreground)] block mb-1">Template Name *</label>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            className="w-full text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]"
            placeholder="e.g. Welcome Email"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-[var(--muted-foreground)] block mb-1">Subject</label>
            <input
              type="text"
              value={formSubject}
              onChange={(e) => setFormSubject(e.target.value)}
              className="w-full text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]"
              placeholder="Email subject line"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--muted-foreground)] block mb-1">Preview Text</label>
            <input
              type="text"
              value={formPreviewText}
              onChange={(e) => setFormPreviewText(e.target.value)}
              className="w-full text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]"
              placeholder="Preview text"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--muted-foreground)] block mb-1">
            <CodeBracketIcon className="w-3.5 h-3.5 inline mr-1" />
            HTML Content
          </label>
          <textarea
            value={formHtml}
            onChange={(e) => setFormHtml(e.target.value)}
            className="w-full text-xs font-mono bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)] resize-y"
            rows={12}
            placeholder="Paste your HTML email template here..."
          />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formSyncToRemote}
              onChange={(e) => setFormSyncToRemote(e.target.checked)}
              className="rounded border-[var(--border)]"
            />
            <span className="text-sm text-[var(--foreground)]">
              {isEdit
                ? hasRemoteId
                  ? 'Also update on ESP'
                  : 'Also create on ESP'
                : 'Also create on ESP'}
            </span>
          </label>
        </div>
      </div>
    );
  };

  // ── No connection state ──

  const connectedProviders = accountData?.connectedProviders;
  const hasConnection = effectiveAccountKey && connectedProviders && connectedProviders.length > 0;

  return (
    <div>
      {/* Header */}
      <div className="page-sticky-header mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <EnvelopeIcon className="w-7 h-7 text-[var(--primary)]" />
            <div>
              <h2 className="text-2xl font-bold">Templates</h2>
              <p className="text-[var(--muted-foreground)] text-sm mt-0.5">
                {isAccount && accountData
                  ? `Email templates for ${accountData.dealer}`
                  : 'Manage email templates from your connected ESPs'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* No account selected */}
      {!effectiveAccountKey && (
        <div className="text-center py-16 text-[var(--muted-foreground)]">
          <EnvelopeIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select an account to view its email templates.</p>
        </div>
      )}

      {/* No ESP connection */}
      {effectiveAccountKey && !hasConnection && !loading && (
        <div className="text-center py-16 text-[var(--muted-foreground)]">
          <ExclamationTriangleIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium mb-1">No ESP Connected</p>
          <p className="text-xs">Connect GoHighLevel or Klaviyo in your account integrations to manage email templates.</p>
        </div>
      )}

      {/* Main content */}
      {effectiveAccountKey && (hasConnection || loading) && (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Search */}
              <div className="relative flex-1 max-w-xs">
                <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-[var(--foreground)]"
                  placeholder="Search templates..."
                />
              </div>

              {/* Provider filter */}
              {uniqueProviders.length > 1 && (
                <div className="flex items-center gap-1 bg-[var(--muted)] rounded-lg p-0.5">
                  <button
                    onClick={() => setProviderFilter('all')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${providerFilter === 'all' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}
                  >
                    All
                  </button>
                  {uniqueProviders.map(p => (
                    <button
                      key={p}
                      onClick={() => setProviderFilter(p)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${providerFilter === p ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}
                    >
                      {providerIcon(p) && (
                        <img src={providerIcon(p)} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                      )}
                      {providerLabel(p)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex items-center bg-[var(--muted)] rounded-lg p-0.5">
                <button
                  onClick={() => toggleView('card')}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === 'card' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}
                  title="Card view"
                >
                  <Squares2X2Icon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toggleView('list')}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}
                  title="List view"
                >
                  <ListBulletIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Sync */}
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] text-[var(--foreground)] rounded-lg text-sm font-medium hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
              >
                <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync'}
              </button>

              {/* Create */}
              <button
                onClick={() => { resetForm(); setShowCreate(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <PlusIcon className="w-4 h-4" /> New Template
              </button>
            </div>
          </div>

          {/* Summary */}
          <p className="text-xs text-[var(--muted-foreground)] mb-4">
            {loading ? 'Loading...' : `${filtered.length} template${filtered.length !== 1 ? 's' : ''}`}
            {providerFilter !== 'all' && ` from ${providerLabel(providerFilter)}`}
            {search && ` matching "${search}"`}
          </p>

          {/* Loading */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="glass-card rounded-xl animate-pulse">
                  <div className="h-32 rounded-t-xl bg-[var(--muted)]" />
                  <div className="p-4 space-y-2">
                    <div className="h-3 bg-[var(--muted)] rounded w-16" />
                    <div className="h-4 bg-[var(--muted)] rounded w-3/4" />
                    <div className="h-3 bg-[var(--muted)] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-16 text-[var(--muted-foreground)]">
              <EnvelopeIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              {templates.length === 0 ? (
                <>
                  <p className="text-sm font-medium mb-1">No templates yet</p>
                  <p className="text-xs mb-4">Click "Sync" to pull templates from your connected ESP, or create a new one.</p>
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                    Sync from ESP
                  </button>
                </>
              ) : (
                <p className="text-sm">No templates match your filters.</p>
              )}
            </div>
          )}

          {/* Template grid/list */}
          {!loading && filtered.length > 0 && (
            viewMode === 'card' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filtered.map(t => <TemplateCard key={t.id} t={t} />)}
              </div>
            ) : (
              <div className="space-y-1.5">
                {filtered.map(t => <TemplateRow key={t.id} t={t} />)}
              </div>
            )
          )}
        </>
      )}

      {/* ── Create Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in" onClick={() => setShowCreate(false)}>
          <div className="glass-modal w-[640px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h3 className="text-base font-semibold">New Template</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <TemplateForm mode="create" />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)]">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm font-medium text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!formName.trim() || saving}
                className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in" onClick={() => { setEditTemplate(null); resetForm(); }}>
          <div className="glass-modal w-[640px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">Edit Template</h3>
                <ProviderPill provider={editTemplate.provider} />
              </div>
              <button onClick={() => { setEditTemplate(null); resetForm(); }} className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <TemplateForm mode="edit" />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)]">
              <button
                onClick={() => { setEditTemplate(null); resetForm(); }}
                className="px-4 py-2 text-sm font-medium text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={!formName.trim() || saving}
                className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in" onClick={() => setDeleteTemplate(null)}>
          <div className="glass-modal w-[420px]" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <h3 className="text-base font-semibold">Delete Template</h3>
            </div>
            <div className="p-5">
              <p className="text-sm text-[var(--foreground)] mb-1">
                Are you sure you want to delete <strong>{deleteTemplate.name}</strong>?
              </p>
              {deleteTemplate.remoteId && (
                <p className="text-xs text-[var(--muted-foreground)] mt-3">
                  This template is synced with {providerLabel(deleteTemplate.provider)}. You can delete it locally only, or also remove it from the ESP.
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)]">
              <button
                onClick={() => setDeleteTemplate(null)}
                className="px-4 py-2 text-sm font-medium text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(false)}
                className="px-4 py-2 text-sm font-medium text-red-400 border border-red-400/30 rounded-lg hover:bg-red-500/10 transition-colors"
              >
                Delete Locally
              </button>
              {deleteTemplate.remoteId && (
                <button
                  onClick={() => handleDelete(true)}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                >
                  Delete Everywhere
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
