'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  XMarkIcon,
  CheckIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  EllipsisVerticalIcon,
  Squares2X2Icon,
  ListBulletIcon,
  FolderIcon,
  FolderPlusIcon,
  FolderArrowDownIcon,
} from '@heroicons/react/24/outline';
import { AdminOnly } from '@/components/route-guard';

interface ComponentEntry {
  name: string;
  label: string;
  propCount: number;
}

interface FolderData {
  [folderName: string]: string[];
}

const VIEW_KEY = 'loomi-component-view';

function loadView(): 'card' | 'list' {
  if (typeof window === 'undefined') return 'card';
  return (localStorage.getItem(VIEW_KEY) as 'card' | 'list') || 'card';
}

export default function ComponentFolderPage() {
  const params = useParams();
  const router = useRouter();
  const folderName = decodeURIComponent(params.name as string);
  const [components, setComponents] = useState<ComponentEntry[]>([]);
  const [folders, setFolders] = useState<FolderData>({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [error, setError] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [moveModalComponent, setMoveModalComponent] = useState<string | null>(null);
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const [showDeleteFolder, setShowDeleteFolder] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  // Create component
  const [showCreate, setShowCreate] = useState(false);
  const [newCompName, setNewCompName] = useState('');
  const [creating, setCreating] = useState(false);
  // Bulk selection
  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set());
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setViewMode(loadView()); }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      const [compRes, foldersRes] = await Promise.all([
        fetch('/api/components'),
        fetch('/api/component-folders'),
      ]);
      setComponents(await compRes.json());
      setFolders(await foldersRes.json());
    } catch (err) {
      console.error('Failed to load:', err);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const saveFolders = async (newFolders: FolderData) => {
    setFolders(newFolders);
    await fetch('/api/component-folders', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newFolders),
    });
  };

  const componentMap = useMemo(() => {
    const map: Record<string, ComponentEntry> = {};
    for (const c of components) map[c.name] = c;
    return map;
  }, [components]);

  const folderComponents = (folders[folderName] || []).filter(c => componentMap[c]);

  const handleMoveToFolder = async (compName: string, targetFolder: string) => {
    const nf = { ...folders };
    for (const [f, list] of Object.entries(nf)) nf[f] = list.filter(c => c !== compName);
    if (targetFolder !== '__unfiled__') nf[targetFolder] = [...(nf[targetFolder] || []), compName];
    await saveFolders(nf);
    setMoveModalComponent(null);
  };

  const handleRenameFolder = async () => {
    if (!folderRenameValue.trim() || folderRenameValue.trim() === folderName) { setIsRenamingFolder(false); return; }
    const newName = folderRenameValue.trim();
    if (folders[newName]) { setError('Folder already exists'); return; }
    const nf = { ...folders };
    nf[newName] = nf[folderName] || [];
    delete nf[folderName];
    await saveFolders(nf);
    router.replace(`/components/folder/${encodeURIComponent(newName)}`);
  };

  const handleDeleteFolder = async () => {
    const nf = { ...folders };
    delete nf[folderName];
    await saveFolders(nf);
    router.push('/components');
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const name = newFolderName.trim();
    if (folders[name]) { setError('Folder already exists'); return; }
    await saveFolders({ ...folders, [name]: [] });
    setNewFolderName(''); setShowNewFolder(false);
  };

  const toggleSelect = (name: string) => {
    setSelectedComponents(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const handleBulkMove = async (targetFolder: string) => {
    const nf = { ...folders };
    for (const compName of selectedComponents) {
      for (const [f, list] of Object.entries(nf)) nf[f] = list.filter(c => c !== compName);
      if (targetFolder !== '__unfiled__') nf[targetFolder] = [...(nf[targetFolder] || []), compName];
    }
    await saveFolders(nf);
    setSelectedComponents(new Set());
    setShowBulkMoveModal(false);
  };

  const handleCreateComponent = async () => {
    if (!newCompName.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCompName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create component'); setCreating(false); return; }
      // Add new component to this folder
      const nf = { ...folders };
      nf[folderName] = [...(nf[folderName] || []), data.name];
      await saveFolders(nf);
      router.push(`/components/${data.name}`);
    } catch {
      setError('Failed to create component');
      setCreating(false);
    }
  };

  const handleDeleteComponent = async (name: string) => {
    try {
      const res = await fetch(`/api/components?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!res.ok) { const data = await res.json(); setError(data.error || 'Failed to delete'); return; }
      // Remove from any folder
      const nf = { ...folders };
      for (const [f, list] of Object.entries(nf)) nf[f] = list.filter(c => c !== name);
      await saveFolders(nf);
      setComponents(prev => prev.filter(c => c.name !== name));
    } catch {
      setError('Failed to delete component');
    }
  };

  // ── Three-dot menu ──
  const ThreeDotsMenu = ({ name }: { name: string }) => {
    const isOpen = openMenu === name;
    return (
      <div className="relative" ref={isOpen ? menuRef : undefined}>
        <button
          onClick={(e) => { e.stopPropagation(); setOpenMenu(isOpen ? null : name); }}
          className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
        >
          <EllipsisVerticalIcon className="w-4 h-4" />
        </button>
        {isOpen && (
          <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setOpenMenu(null); setMoveModalComponent(name); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
              <FolderArrowDownIcon className="w-4 h-4" /> Move to Folder
            </button>
            <button onClick={() => { setOpenMenu(null); if (confirm(`Delete "${componentMap[name]?.label || name}"? This will remove the .html file permanently.`)) handleDeleteComponent(name); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
              <TrashIcon className="w-4 h-4" /> Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── Card ──
  const ComponentCard = ({ name }: { name: string }) => {
    const comp = componentMap[name];
    if (!comp) return null;
    const isSelected = selectedComponents.has(name);

    return (
      <div
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/plain', name)}
        className={`border rounded-xl bg-[var(--card)] hover:border-[var(--primary)] transition-colors group ${isSelected ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20' : 'border-[var(--border)]'}`}
      >
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3 relative">
            <label
              className={`absolute -top-1 -left-1 flex items-center justify-center w-5 h-5 rounded border cursor-pointer transition-all ${isSelected ? 'bg-[var(--primary)] border-[var(--primary)]' : 'bg-[var(--muted)] border-[var(--border)] opacity-0 group-hover:opacity-100'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(name)} className="sr-only" />
              {isSelected && <CheckIcon className="w-3.5 h-3.5 text-white" />}
            </label>
            <div
              className="w-10 h-10 rounded-lg bg-[var(--muted)] flex items-center justify-center text-[var(--muted-foreground)] group-hover:text-[var(--primary)] transition-colors cursor-pointer"
              onClick={() => router.push(`/components/${name}`)}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/components/${name}`)}>
              <p className="text-sm font-semibold">{comp.label}</p>
              <p className="text-[10px] text-[var(--muted-foreground)] font-mono">{name}.html</p>
            </div>
            <ThreeDotsMenu name={name} />
          </div>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push(`/components/${name}`)}>
            <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
              {comp.propCount} props
            </span>
          </div>
        </div>
      </div>
    );
  };

  // ── Row ──
  const ComponentRow = ({ name }: { name: string }) => {
    const comp = componentMap[name];
    if (!comp) return null;
    const isSelected = selectedComponents.has(name);

    return (
      <div
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/plain', name)}
        className={`flex items-center gap-4 p-3 border rounded-xl bg-[var(--card)] hover:border-[var(--primary)] transition-colors group ${isSelected ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20' : 'border-[var(--border)]'}`}
      >
        <label className="flex items-center justify-center w-5 h-5 flex-shrink-0 cursor-pointer">
          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(name)} className="sr-only" />
          <div className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[var(--border)] group-hover:border-[var(--muted-foreground)]'}`}>
            {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
          </div>
        </label>
        <div
          className="w-8 h-8 rounded-lg bg-[var(--muted)] flex items-center justify-center text-[var(--muted-foreground)] group-hover:text-[var(--primary)] transition-colors flex-shrink-0 cursor-pointer"
          onClick={() => router.push(`/components/${name}`)}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/components/${name}`)}>
          <h3 className="font-semibold text-sm">{comp.label}</h3>
          <p className="text-[10px] text-[var(--muted-foreground)]">{name}.html &middot; {comp.propCount} props</p>
        </div>
        <ThreeDotsMenu name={name} />
      </div>
    );
  };

  if (loading) return <div className="text-[var(--muted-foreground)]">Loading...</div>;

  if (!folders[folderName]) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--muted-foreground)]">Folder not found.</p>
        <button onClick={() => router.push('/components')} className="mt-4 text-sm text-[var(--primary)] hover:underline">Back to Components</button>
      </div>
    );
  }

  const folderNames = Object.keys(folders);

  return (
    <AdminOnly><div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/components')} className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
            <ArrowLeftIcon className="w-4 h-4" />
          </button>
          <FolderIcon className="w-5 h-5 text-[var(--muted-foreground)]" />
          {isRenamingFolder ? (
            <div className="flex items-center gap-2">
              <input type="text" value={folderRenameValue} onChange={(e) => setFolderRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleRenameFolder(); if (e.key === 'Escape') setIsRenamingFolder(false); }} className="text-xl font-bold bg-[var(--input)] border border-[var(--border)] rounded-lg px-2 py-0.5 text-[var(--foreground)] w-56" autoFocus />
              <button onClick={handleRenameFolder} className="p-1 text-green-400 hover:bg-green-500/10 rounded"><CheckIcon className="w-4 h-4" /></button>
              <button onClick={() => setIsRenamingFolder(false)} className="p-1 text-[var(--muted-foreground)] rounded"><XMarkIcon className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{folderName}</h2>
              <span className="text-sm text-[var(--muted-foreground)]">({folderComponents.length})</span>
              <button onClick={() => { setIsRenamingFolder(true); setFolderRenameValue(folderName); }} className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]" title="Rename folder">
                <PencilSquareIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showDeleteFolder ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400">Delete folder?</span>
              <button onClick={handleDeleteFolder} className="px-3 py-1.5 text-xs font-medium bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30">Yes</button>
              <button onClick={() => setShowDeleteFolder(false)} className="px-3 py-1.5 text-xs text-[var(--muted-foreground)]">No</button>
            </div>
          ) : (
            <>
              <div className="flex items-center bg-[var(--muted)] rounded-lg p-0.5">
                <button onClick={() => setViewMode('card')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'card' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}>
                  <Squares2X2Icon className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}>
                  <ListBulletIcon className="w-4 h-4" />
                </button>
              </div>
              <button onClick={() => setShowNewFolder(true)} className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] text-[var(--foreground)] rounded-lg text-sm font-medium hover:bg-[var(--muted)] transition-colors">
                <FolderPlusIcon className="w-4 h-4" /> New Folder
              </button>
              <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                <PlusIcon className="w-4 h-4" /> New Component
              </button>
              <button onClick={() => setShowDeleteFolder(true)} className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/10" title="Delete folder">
                <TrashIcon className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="p-0.5 hover:text-red-300"><XMarkIcon className="w-4 h-4" /></button>
        </div>
      )}

      {/* Create component */}
      {showCreate && (
        <div className="mb-4 p-4 border border-[var(--primary)]/30 rounded-xl bg-[var(--card)]">
          <label className="text-sm font-medium block mb-2">Component Name</label>
          <div className="flex items-center gap-2">
            <input type="text" value={newCompName} onChange={(e) => setNewCompName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateComponent()} className="flex-1 text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]" placeholder="e.g. promo-banner, social-links..." autoFocus />
            <button onClick={handleCreateComponent} disabled={!newCompName.trim() || creating} className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">{creating ? 'Creating...' : 'Create'}</button>
            <button onClick={() => { setShowCreate(false); setNewCompName(''); }} className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"><XMarkIcon className="w-4 h-4" /></button>
          </div>
          <p className="text-[10px] text-[var(--muted-foreground)] mt-1.5">Will be saved as a kebab-case .html file and added to this folder.</p>
        </div>
      )}

      {/* Create folder */}
      {showNewFolder && (
        <div className="mb-4 p-4 border border-[var(--border)] rounded-xl bg-[var(--card)]">
          <label className="text-sm font-medium block mb-2">Folder Name</label>
          <div className="flex items-center gap-2">
            <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} className="flex-1 text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]" placeholder="e.g. Layout, Content, Interactive..." autoFocus />
            <button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="px-4 py-2 bg-[var(--foreground)] text-[var(--background)] rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">Create</button>
            <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"><XMarkIcon className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {folderComponents.length > 0 ? (
        viewMode === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {folderComponents.map(name => <ComponentCard key={name} name={name} />)}
          </div>
        ) : (
          <div className="space-y-1.5">
            {folderComponents.map(name => <ComponentRow key={name} name={name} />)}
          </div>
        )
      ) : (
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <p className="text-sm">No components in this folder yet.</p>
          <p className="text-xs mt-1">Use the Move to Folder option from the components page to add components here.</p>
        </div>
      )}

      {/* Move to Folder Modal (single component) */}
      {moveModalComponent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setMoveModalComponent(null)}>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl w-[360px] max-h-[400px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold">Move &quot;{componentMap[moveModalComponent]?.label || moveModalComponent}&quot; to folder</h3>
              <button onClick={() => setMoveModalComponent(null)} className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"><XMarkIcon className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto max-h-[300px] p-2">
              <button
                onClick={() => handleMoveToFolder(moveModalComponent, '__unfiled__')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)]"
              >
                <XMarkIcon className="w-4 h-4" /> Remove from folder
              </button>
              {folderNames.map((fn) => (
                <button
                  key={fn}
                  onClick={() => handleMoveToFolder(moveModalComponent, fn)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-[var(--muted)] transition-colors ${fn === folderName ? 'text-[var(--primary)] font-medium' : 'text-[var(--foreground)]'}`}
                >
                  <FolderIcon className="w-4 h-4" />
                  {fn}
                  {fn === folderName && <span className="text-xs text-[var(--muted-foreground)] ml-auto">(current)</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bulk selection action bar */}
      {selectedComponents.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {selectedComponents.size} selected
          </span>
          <div className="w-px h-5 bg-[var(--border)]" />
          <button
            onClick={() => {
              if (selectedComponents.size === folderComponents.length && folderComponents.every(n => selectedComponents.has(n))) {
                setSelectedComponents(new Set());
              } else {
                setSelectedComponents(new Set(folderComponents));
              }
            }}
            className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            {selectedComponents.size === folderComponents.length && folderComponents.every(n => selectedComponents.has(n)) ? 'Deselect All' : 'Select All'}
          </button>
          <div className="w-px h-5 bg-[var(--border)]" />
          <button
            onClick={() => setShowBulkMoveModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            <FolderArrowDownIcon className="w-4 h-4" /> Move to Folder
          </button>
          <button
            onClick={() => setSelectedComponents(new Set())}
            className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bulk Move to Folder Modal */}
      {showBulkMoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowBulkMoveModal(false)}>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl w-[360px] max-h-[400px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold">Move {selectedComponents.size} component{selectedComponents.size > 1 ? 's' : ''} to folder</h3>
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
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-[var(--muted)] transition-colors ${fn === folderName ? 'text-[var(--primary)] font-medium' : 'text-[var(--foreground)]'}`}
                >
                  <FolderIcon className="w-4 h-4" />
                  {fn}
                  {fn === folderName && <span className="text-xs text-[var(--muted-foreground)] ml-auto">(current)</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div></AdminOnly>
  );
}
