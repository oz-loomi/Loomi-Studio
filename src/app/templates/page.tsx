'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  PlusIcon,
  XMarkIcon,
  CheckIcon,
  Squares2X2Icon,
  ListBulletIcon,
  EllipsisVerticalIcon,
  TrashIcon,
  BookOpenIcon,
  FolderIcon,
  FolderPlusIcon,
  FolderArrowDownIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { useAccount } from '@/contexts/account-context';
import {
  parseEmailFoldersPayload,
  foldersMapToArray,
  type FolderAssignments,
} from '@/lib/email-folders-payload';
import {
  parseEmailListPayload,
  type EmailListItem,
} from '@/lib/email-list-payload';

// ── Types ──

interface TemplateEntry {
  id: string;
  design: string;
  name: string;
}

interface AccountData {
  dealer: string;
  logos: { light: string; dark: string };
}

// ── Helpers ──

const statusColors: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#f59e0b20', text: '#f59e0b' },
  active: { bg: '#10b98120', text: '#10b981' },
  archived: { bg: '#6b728020', text: '#6b7280' },
};

const VIEW_KEY = 'loomi-email-view';

function loadView(): 'card' | 'list' {
  if (typeof window === 'undefined') return 'card';
  return (localStorage.getItem(VIEW_KEY) as 'card' | 'list') || 'card';
}
function saveView(view: 'card' | 'list') {
  localStorage.setItem(VIEW_KEY, view);
}

// ── Page ──

export default function TemplatesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAccount, accountKey, accountData } = useAccount();
  const isCampaignDraft = searchParams.get('campaignDraft') === '1';
  const campaignDraftQuery = isCampaignDraft ? '?campaignDraft=1' : '';
  const [emails, setEmails] = useState<EmailListItem[]>([]);
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [accounts, setAccounts] = useState<Record<string, AccountData>>({});
  const [folders, setFolders] = useState<FolderAssignments>({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  // Create email
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesign, setNewDesign] = useState('');
  const [newAccountKey, setNewAccountKey] = useState('');
  const [creating, setCreating] = useState(false);
  // Folders
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  // Menu
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [moveModalEmail, setMoveModalEmail] = useState<string | null>(null);
  // Bulk selection
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setViewMode(loadView()); }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadData = async () => {
    try {
      const emailUrl = isAccount && accountKey ? `/api/emails?accountKey=${accountKey}` : '/api/emails';

      if (isAccount) {
        // Account users only need their own emails — no templates, accounts, or folders
        const emailsRes = await fetch(emailUrl);
        setEmails(parseEmailListPayload(await emailsRes.json()));
      } else {
        const [emailsRes, tplRes, accountsRes, foldersRes] = await Promise.all([
          fetch(emailUrl),
          fetch('/api/templates'),
          fetch('/api/accounts'),
          fetch('/api/email-folders'),
        ]);
        setEmails(parseEmailListPayload(await emailsRes.json()));
        setTemplates(await tplRes.json());
        setAccounts(await accountsRes.json());
        setFolders(parseEmailFoldersPayload(await foldersRes.json()));
      }
    } catch (err) {
      console.error('Failed to load:', err);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [isAccount, accountKey]);

  // Pre-fill account when in account mode
  useEffect(() => {
    if (isAccount && accountKey) setNewAccountKey(accountKey);
  }, [isAccount, accountKey]);

  const saveFolders = async (newFolders: FolderAssignments) => {
    setFolders(newFolders);
    await fetch('/api/email-folders', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folders: foldersMapToArray(newFolders) }),
    });
  };

  const emailMap = useMemo(() => {
    const map: Record<string, EmailListItem> = {};
    for (const e of emails) map[e.id] = e;
    return map;
  }, [emails]);

  const allIds = useMemo(() => emails.map(e => e.id), [emails]);

  const { unfiledEmails } = useMemo(() => {
    const inFolder = new Set<string>();
    for (const list of Object.values(folders)) {
      for (const id of list) { if (allIds.includes(id)) inFolder.add(id); }
    }
    return { unfiledEmails: allIds.filter(id => !inFolder.has(id)) };
  }, [allIds, folders]);

  const accountKeys = useMemo(() => Object.keys(accounts).sort(), [accounts]);

  const toggleView = (mode: 'card' | 'list') => { setViewMode(mode); saveView(mode); };

  const handleCreate = async () => {
    if (!newName.trim() || !newDesign || !newAccountKey || creating) return;
    const selectedTemplate = templates.find((template) => template.design === newDesign);
    if (!selectedTemplate) {
      toast.error('Please select a valid template');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          templateId: selectedTemplate.id,
          accountKey: newAccountKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create'); setCreating(false); return; }
      setNewName(''); setNewDesign(''); setNewAccountKey(''); setShowCreate(false);
      await loadData();
    } catch {
      toast.error('Failed to create email');
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/emails?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Failed to delete'); return; }
      const nf = { ...folders };
      for (const [f, list] of Object.entries(nf)) nf[f] = list.filter(eid => eid !== id);
      await saveFolders(nf);
      setEmails(prev => prev.filter(e => e.id !== id));
    } catch {
      toast.error('Failed to delete email');
    }
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const name = newFolderName.trim();
    if (folders[name]) { toast.error('Folder already exists'); return; }
    saveFolders({ ...folders, [name]: [] });
    setNewFolderName(''); setShowNewFolder(false);
  };

  const handleMoveToFolder = async (id: string, folderName: string) => {
    const nf = { ...folders };
    for (const [f, list] of Object.entries(nf)) nf[f] = list.filter(eid => eid !== id);
    if (folderName !== '__unfiled__') nf[folderName] = [...(nf[folderName] || []), id];
    await saveFolders(nf);
    setMoveModalEmail(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkMove = async (folderName: string) => {
    const nf = { ...folders };
    for (const id of selectedEmails) {
      for (const [f, list] of Object.entries(nf)) nf[f] = list.filter(eid => eid !== id);
      if (folderName !== '__unfiled__') nf[folderName] = [...(nf[folderName] || []), id];
    }
    await saveFolders(nf);
    setSelectedEmails(new Set());
    setShowBulkMoveModal(false);
  };

  const getAccountLabel = (key: string) => accounts[key]?.dealer || key;
  const getTemplateLabel = (email: EmailListItem) => email.templateTitle;
  const buildEditorHref = (design: string, emailId: string) => {
    const next = new URLSearchParams({ email: emailId });
    if (isCampaignDraft) next.set('campaignDraft', '1');
    return `/templates/${design}/template?${next.toString()}`;
  };
  const openEmailEditor = (email: EmailListItem) => {
    if (!email.templateSlug) {
      toast.error('Template is unavailable for this email');
      return;
    }
    router.push(buildEditorHref(email.templateSlug, email.id));
  };

  // ── Three-dot menu ──
  const ThreeDotsMenu = ({ id }: { id: string }) => {
    const isOpen = openMenu === id;
    const email = emailMap[id];
    return (
      <div className="relative" ref={isOpen ? menuRef : undefined}>
        <button
          onClick={(e) => { e.stopPropagation(); setOpenMenu(isOpen ? null : id); }}
          className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
        >
          <EllipsisVerticalIcon className="w-4 h-4" />
        </button>
        {isOpen && (
          <div className="absolute right-0 top-full mt-1 z-50 w-44 glass-dropdown" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setOpenMenu(null); setMoveModalEmail(id); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
              <FolderArrowDownIcon className="w-4 h-4" /> Move to Folder
            </button>
            <button onClick={() => { setOpenMenu(null); if (confirm(`Delete "${email?.name || id}"?`)) handleDelete(id); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
              <TrashIcon className="w-4 h-4" /> Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── Email Card ──
  const EmailCard = ({ id }: { id: string }) => {
    const email = emailMap[id];
    if (!email) return null;
    const isSelected = selectedEmails.has(id);
    const sc = statusColors[email.status] || statusColors.draft;

    return (
      <div
        draggable={!isAccount}
        onDragStart={!isAccount ? (e) => e.dataTransfer.setData('text/plain', id) : undefined}
        className={`glass-card rounded-xl group ${isSelected ? '!border-[var(--primary)] ring-2 ring-[var(--primary)]/20' : ''}`}
      >
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2 relative">
            {!isAccount && (
              <label
                className={`absolute -top-1 -left-1 flex items-center justify-center w-5 h-5 rounded border cursor-pointer transition-all ${isSelected ? 'bg-[var(--primary)] border-[var(--primary)]' : 'bg-[var(--muted)] border-[var(--border)] opacity-0 group-hover:opacity-100'}`}
                onClick={(e) => e.stopPropagation()}
              >
                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(id)} className="sr-only" />
                {isSelected && <CheckIcon className="w-3.5 h-3.5 text-white" />}
              </label>
            )}
            {!isAccount && <span className="text-xs text-[var(--muted-foreground)] flex-1 truncate">{getAccountLabel(email.accountKey)}</span>}
            {isAccount && <span className="flex-1" />}
            {!isAccount && <ThreeDotsMenu id={id} />}
          </div>
          <p
            className="text-sm font-semibold cursor-pointer mb-1"
            onClick={() => openEmailEditor(email)}
          >
            {email.name}
          </p>
          <p className="text-[10px] text-[var(--muted-foreground)] mb-2">{getTemplateLabel(email)}</p>
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ backgroundColor: sc.bg, color: sc.text }}
            >
              {email.status}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // ── Email Row ──
  const EmailRow = ({ id }: { id: string }) => {
    const email = emailMap[id];
    if (!email) return null;
    const isSelected = selectedEmails.has(id);
    const sc = statusColors[email.status] || statusColors.draft;

    return (
      <div
        draggable={!isAccount}
        onDragStart={!isAccount ? (e) => e.dataTransfer.setData('text/plain', id) : undefined}
        className={`flex items-center gap-4 p-3 glass-card rounded-xl group ${isSelected ? '!border-[var(--primary)] ring-2 ring-[var(--primary)]/20' : ''}`}
      >
        {!isAccount && (
          <label className="flex items-center justify-center w-5 h-5 flex-shrink-0 cursor-pointer">
            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(id)} className="sr-only" />
            <div className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[var(--border)] group-hover:border-[var(--muted-foreground)]'}`}>
              {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
            </div>
          </label>
        )}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => openEmailEditor(email)}
        >
          <h3 className="font-semibold text-sm">{email.name}</h3>
          <p className="text-[10px] text-[var(--muted-foreground)]">{!isAccount && <>{getAccountLabel(email.accountKey)} &middot; </>}{getTemplateLabel(email)}</p>
        </div>
        <span
          className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: sc.bg, color: sc.text }}
        >
          {email.status}
        </span>
        {!isAccount && <ThreeDotsMenu id={id} />}
      </div>
    );
  };

  const renderEmails = (ids: string[]) => {
    if (ids.length === 0) return null;
    return viewMode === 'card' ? (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {ids.map(id => <EmailCard key={id} id={id} />)}
      </div>
    ) : (
      <div className="space-y-1.5">
        {ids.map(id => <EmailRow key={id} id={id} />)}
      </div>
    );
  };

  const folderNames = Object.keys(folders);

  return (
    <div>
      {/* Header */}
      <div className="page-sticky-header mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <BookOpenIcon className="w-7 h-7 text-[var(--primary)]" />
            <div>
              <h2 className="text-2xl font-bold">Templates</h2>
              <p className="text-[var(--muted-foreground)] text-sm mt-0.5">
                {isAccount && accountData
                  ? `Templates for ${accountData.dealer}`
                  : 'Manage email templates and designs'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Route-based tab bar (hidden for account users — they only see Account Templates) */}
      {!isAccount && (
        <div className="flex items-center gap-1 mb-6 border-b border-[var(--border)]">
          <Link
            href={`/templates${campaignDraftQuery}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              pathname === '/templates'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            Account Templates
          </Link>
          <Link
            href={`/templates/library${campaignDraftQuery}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              pathname === '/templates/library'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            Template Library
          </Link>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--muted-foreground)]">
          {emails.length} email{emails.length !== 1 ? 's' : ''}
          {isAccount && accountData ? ` for ${accountData.dealer}` : ` across ${accountKeys.length} accounts`}
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[var(--muted)] rounded-lg p-0.5">
            <button onClick={() => toggleView('card')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'card' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`} title="Card view">
              <Squares2X2Icon className="w-4 h-4" />
            </button>
            <button onClick={() => toggleView('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`} title="List view">
              <ListBulletIcon className="w-4 h-4" />
            </button>
          </div>
          {!isAccount && (
            <>
              <button onClick={() => setShowNewFolder(true)} className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] text-[var(--foreground)] rounded-lg text-sm font-medium hover:bg-[var(--muted)] transition-colors">
                <FolderPlusIcon className="w-4 h-4" /> New Folder
              </button>
              <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                <PlusIcon className="w-4 h-4" /> New Email
              </button>
            </>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && <div className="text-[var(--muted-foreground)]">Loading emails...</div>}

      {!loading && (
        <>
          {/* Create email (admin/developer only) */}
          {!isAccount && showCreate && (
            <div className="mb-4 p-4 glass-card rounded-xl !border-[var(--primary)]/30">
              <label className="text-sm font-medium block mb-2">New Email</label>
              <div className="flex flex-col gap-2">
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]" placeholder="Email name (e.g. Jan Service Reminder)" autoFocus />
                <div className="flex items-center gap-2">
                  {!isAccount && (
                    <select
                      value={newAccountKey}
                      onChange={(e) => setNewAccountKey(e.target.value)}
                      className="text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]"
                    >
                      <option value="">Select account...</option>
                      {accountKeys.map(k => <option key={k} value={k}>{accounts[k].dealer} ({k})</option>)}
                    </select>
                  )}
                  <select
                    value={newDesign}
                    onChange={(e) => setNewDesign(e.target.value)}
                    className="flex-1 text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]"
                  >
                    <option value="">Select template...</option>
                    {templates.map(t => (
                      <option key={t.design} value={t.design}>
                        {t.name || t.design}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleCreate} disabled={!newName.trim() || !newDesign || !newAccountKey || creating} className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">{creating ? 'Creating...' : 'Create Email'}</button>
                  <button onClick={() => { setShowCreate(false); setNewName(''); setNewDesign(''); setNewAccountKey(''); }} className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"><XMarkIcon className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          )}

          {/* Create folder (admin/developer only) */}
          {!isAccount && showNewFolder && (
            <div className="mb-4 p-4 glass-card rounded-xl">
              <label className="text-sm font-medium block mb-2">Folder Name</label>
              <div className="flex items-center gap-2">
                <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} className="flex-1 text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]" placeholder="e.g. January Campaigns, Q1 Service..." autoFocus />
                <button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="px-4 py-2 bg-[var(--foreground)] text-[var(--background)] rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">Create</button>
                <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"><XMarkIcon className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {/* Folders (admin/developer only) */}
          {!isAccount && folderNames.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Folders</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3" style={{ maxWidth: '900px' }}>
                {folderNames.map((fn) => {
                  const count = (folders[fn] || []).filter(id => emailMap[id]).length;
                  const isDragOver = dragOverFolder === fn;

                  return (
                    <div
                      key={fn}
                      className={`glass-card rounded-xl cursor-pointer ${isDragOver ? '!border-[var(--primary)] ring-2 ring-[var(--primary)]/20' : ''}`}
                      onClick={() => router.push(`/templates/folder/${encodeURIComponent(fn)}`)}
                      onDragOver={(e) => { e.preventDefault(); setDragOverFolder(fn); }}
                      onDragLeave={() => setDragOverFolder(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData('text/plain');
                        if (id) handleMoveToFolder(id, fn);
                        setDragOverFolder(null);
                      }}
                    >
                      <div className="h-8 rounded-t-xl bg-[var(--muted)]" style={{ opacity: count > 0 ? 0.6 : 0.2 }} />
                      <div className="px-3 py-2.5 flex items-center gap-2">
                        <FolderIcon className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" />
                        <span className="text-sm font-semibold truncate flex-1">{fn}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">{count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Email list — account users see all emails flat; admins see unfiled section */}
          {isAccount ? (
            emails.length > 0 ? (
              <div>{renderEmails(allIds)}</div>
            ) : (
              <div className="text-center py-12 text-[var(--muted-foreground)]">
                <p className="text-sm">No templates assigned to your account yet.</p>
              </div>
            )
          ) : (
            <>
              {unfiledEmails.length > 0 && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOverFolder('__unfiled__'); }}
                  onDragLeave={() => setDragOverFolder(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData('text/plain');
                    if (id) handleMoveToFolder(id, '__unfiled__');
                    setDragOverFolder(null);
                  }}
                >
                  {folderNames.length > 0 && (
                    <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Unfiled</h3>
                  )}
                  {renderEmails(unfiledEmails)}
                </div>
              )}

              {emails.length === 0 && folderNames.length === 0 && (
                <div className="text-center py-12 text-[var(--muted-foreground)]">
                  <p className="text-sm">No emails yet. Create your first email to get started.</p>
                  <p className="text-xs mt-1">Emails are account-specific instances of your templates.</p>
                </div>
              )}
            </>
          )}

          {/* Move to Folder Modal (admin/developer only) */}
          {!isAccount && moveModalEmail && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in" onClick={() => setMoveModalEmail(null)}>
              <div className="glass-modal w-[360px] max-h-[400px]" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                  <h3 className="text-sm font-semibold">Move email to folder</h3>
                  <button onClick={() => setMoveModalEmail(null)} className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"><XMarkIcon className="w-4 h-4" /></button>
                </div>
                <div className="overflow-y-auto max-h-[300px] p-2">
                  <button
                    onClick={() => handleMoveToFolder(moveModalEmail, '__unfiled__')}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)]"
                  >
                    <XMarkIcon className="w-4 h-4" /> Remove from folder
                  </button>
                  {folderNames.map((fn) => {
                    const isInThisFolder = (folders[fn] || []).includes(moveModalEmail);
                    return (
                      <button
                        key={fn}
                        onClick={() => handleMoveToFolder(moveModalEmail, fn)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-[var(--muted)] transition-colors ${isInThisFolder ? 'text-[var(--primary)] font-medium' : 'text-[var(--foreground)]'}`}
                      >
                        <FolderIcon className="w-4 h-4" />
                        {fn}
                        {isInThisFolder && <span className="text-xs text-[var(--muted-foreground)] ml-auto">(current)</span>}
                      </button>
                    );
                  })}
                  {folderNames.length === 0 && (
                    <p className="text-xs text-[var(--muted-foreground)] text-center py-4">No folders yet. Create a folder first.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Bulk selection action bar (admin/developer only) */}
          {!isAccount && selectedEmails.size > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 glass-action-bar">
              <span className="text-sm font-medium text-[var(--foreground)]">
                {selectedEmails.size} selected
              </span>
              <div className="w-px h-5 bg-[var(--border)]" />
              <button
                onClick={() => {
                  if (selectedEmails.size === unfiledEmails.length && unfiledEmails.every(id => selectedEmails.has(id))) {
                    setSelectedEmails(new Set());
                  } else {
                    setSelectedEmails(new Set(unfiledEmails));
                  }
                }}
                className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                {selectedEmails.size === unfiledEmails.length && unfiledEmails.every(id => selectedEmails.has(id)) ? 'Deselect All' : 'Select All'}
              </button>
              <div className="w-px h-5 bg-[var(--border)]" />
              <button
                onClick={() => setShowBulkMoveModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition-opacity"
              >
                <FolderArrowDownIcon className="w-4 h-4" /> Move to Folder
              </button>
              <button
                onClick={() => setSelectedEmails(new Set())}
                className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Bulk Move to Folder Modal (admin/developer only) */}
          {!isAccount && showBulkMoveModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in" onClick={() => setShowBulkMoveModal(false)}>
              <div className="glass-modal w-[360px] max-h-[400px]" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                  <h3 className="text-sm font-semibold">Move {selectedEmails.size} email{selectedEmails.size > 1 ? 's' : ''} to folder</h3>
                  <button onClick={() => setShowBulkMoveModal(false)} className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"><XMarkIcon className="w-4 h-4" /></button>
                </div>
                <div className="overflow-y-auto max-h-[300px] p-2">
                  <button
                    onClick={() => handleBulkMove('__unfiled__')}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)]"
                  >
                    <XMarkIcon className="w-4 h-4" /> Remove from folder
                  </button>
                  {folderNames.map((fn) => (
                    <button
                      key={fn}
                      onClick={() => handleBulkMove(fn)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-[var(--muted)] transition-colors text-[var(--foreground)]"
                    >
                      <FolderIcon className="w-4 h-4" />
                      {fn}
                      <span className="text-xs text-[var(--muted-foreground)] ml-auto">{(folders[fn] || []).filter(id => emailMap[id]).length}</span>
                    </button>
                  ))}
                  {folderNames.length === 0 && (
                    <p className="text-xs text-[var(--muted-foreground)] text-center py-4">No folders yet. Create a folder first.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
