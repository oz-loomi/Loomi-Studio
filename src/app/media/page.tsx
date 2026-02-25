'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  PhotoIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  EllipsisVerticalIcon,
  TrashIcon,
  PencilSquareIcon,
  ArrowUpTrayIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  HomeIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  EyeIcon,
  ArrowsPointingOutIcon,
  CheckIcon,
  FolderArrowDownIcon,
} from '@heroicons/react/24/outline';
import { toast } from '@/lib/toast';
import { safeJson } from '@/lib/safe-json';
import { useAccount } from '@/contexts/account-context';
import { AccountAvatar } from '@/components/account-avatar';

// ── Types ──

interface MediaFile {
  id: string;
  name: string;
  url: string;
  type: string;
  size?: number;
  thumbnailUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface MediaFolder {
  id: string;
  name: string;
  parentId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface FolderBreadcrumb {
  id: string | undefined; // undefined = root
  name: string;
}

interface MediaCapabilities {
  canUpload: boolean;
  canDelete: boolean;
  canRename: boolean;
  canMove: boolean;
  canCreateFolders: boolean;
  canNavigateFolders: boolean;
}

interface AccountMediaPreview {
  files: MediaFile[];
  totalCount?: number;
  provider: string | null;
  capabilities: MediaCapabilities | null;
  loading: boolean;
  error?: string;
}

interface ProviderInfo {
  id: string;
  displayName: string;
  iconSrc?: string;
}

// ── Helpers ──

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

function timeAgo(dateStr: string | null | undefined): string {
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

function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Page ──

export default function MediaPage() {
  const { isAdmin, isAccount, accountKey, accountData, accounts } = useAccount();

  // ── Single-account detail state ──
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<MediaCapabilities | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');

  // Folder navigation
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  const [folderPath, setFolderPath] = useState<FolderBreadcrumb[]>([{ id: undefined, name: 'Root' }]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modals
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [renameFile, setRenameFile] = useState<MediaFile | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [deleteFile, setDeleteFile] = useState<MediaFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewFile, setPreviewFile] = useState<MediaFile | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  // Move modal
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveItems, setMoveItems] = useState<{ id: string; type: 'file' | 'folder' }[]>([]);
  const [moveFolders, setMoveFolders] = useState<MediaFolder[]>([]);
  const [moveFolderPath, setMoveFolderPath] = useState<FolderBreadcrumb[]>([{ id: undefined, name: 'Root' }]);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moving, setMoving] = useState(false);

  // Folder context menu + delete
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
  const [deleteFolderItem, setDeleteFolderItem] = useState<MediaFolder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  // Admin account filter
  const [accountFilter, setAccountFilter] = useState<string>('all');

  // ── Admin overview state ──
  const [overviewData, setOverviewData] = useState<Record<string, AccountMediaPreview>>({});
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const [overviewSearch, setOverviewSearch] = useState('');

  // Derive the effective account key
  const effectiveAccountKey = isAccount
    ? accountKey
    : accountFilter !== 'all'
      ? accountFilter
      : null;

  // Show overview when admin has no specific account selected
  const showOverview = isAdmin && !effectiveAccountKey;

  // All account keys (sorted)
  const allAccountKeys = useMemo(() => {
    return Object.keys(accounts).sort((a, b) => {
      const nameA = accounts[a]?.dealer || a;
      const nameB = accounts[b]?.dealer || b;
      return nameA.localeCompare(nameB);
    });
  }, [accounts]);

  // Account keys that have ESP connections
  const connectedAccountKeys = useMemo(() => {
    return allAccountKeys.filter(k => {
      const acct = accounts[k];
      return acct?.connectedProviders && acct.connectedProviders.length > 0;
    });
  }, [allAccountKeys, accounts]);

  // Filter overview accounts by search
  const filteredOverviewKeys = useMemo(() => {
    if (!overviewSearch.trim()) return connectedAccountKeys;
    const q = overviewSearch.toLowerCase();
    return connectedAccountKeys.filter(k => {
      const acct = accounts[k];
      const name = (acct?.dealer || k).toLowerCase();
      const city = (acct?.city || '').toLowerCase();
      const state = (acct?.state || '').toLowerCase();
      return name.includes(q) || city.includes(q) || state.includes(q);
    });
  }, [connectedAccountKeys, accounts, overviewSearch]);

  // Close menus on outside click
  useEffect(() => {
    const handler = () => { setOpenMenu(null); setFolderMenuId(null); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Admin Overview Loading ──

  const loadOverview = useCallback(async () => {
    if (!isAdmin || connectedAccountKeys.length === 0) return;

    // Initialize loading state for all connected accounts
    const initialState: Record<string, AccountMediaPreview> = {};
    for (const key of connectedAccountKeys) {
      initialState[key] = {
        files: [],
        provider: null,
        capabilities: null,
        loading: true,
      };
    }
    setOverviewData(initialState);

    // Fetch total file counts for all connected accounts in parallel
    const results = await Promise.allSettled(
      connectedAccountKeys.map(async (key) => {
        const params = new URLSearchParams({
          accountKey: key,
          countOnly: 'true',
        });
        const res = await fetch(`/api/esp/media?${params.toString()}`);
        const data = await res.json();

        if (res.ok) {
          return {
            accountKey: key,
            totalCount: (data.total as number) || 0,
            provider: data.provider || null,
            capabilities: data.capabilities || null,
          };
        } else {
          return {
            accountKey: key,
            totalCount: 0,
            provider: null,
            capabilities: null,
            error: data.error || 'Failed to load',
          };
        }
      })
    );

    // Update state with results
    setOverviewData(prev => {
      const updated = { ...prev };
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { accountKey: key, totalCount, provider: rowProvider, capabilities: rowCaps, error } = result.value as {
            accountKey: string;
            totalCount: number;
            provider: string | null;
            capabilities: MediaCapabilities | null;
            error?: string;
          };
          updated[key] = {
            files: [],
            totalCount,
            provider: rowProvider,
            capabilities: rowCaps,
            loading: false,
            error,
          };
        } else {
          // Promise rejected — find the account key from the index
          const idx = results.indexOf(result);
          const key = connectedAccountKeys[idx];
          if (key) {
            updated[key] = {
              files: [],
              provider: null,
              capabilities: null,
              loading: false,
              error: 'Failed to load media',
            };
          }
        }
      }
      return updated;
    });

    setOverviewLoaded(true);
  }, [isAdmin, connectedAccountKeys]);

  useEffect(() => {
    if (showOverview && !overviewLoaded && connectedAccountKeys.length > 0) {
      loadOverview();
    }
  }, [showOverview, overviewLoaded, connectedAccountKeys, loadOverview]);

  // ── Single-Account Data Loading ──

  const loadMedia = useCallback(async (cursor?: string) => {
    if (!effectiveAccountKey) return;

    if (cursor) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setFiles([]);
      setFolders([]);
    }

    try {
      const params = new URLSearchParams({
        accountKey: effectiveAccountKey,
      });
      if (cursor) params.set('cursor', cursor);
      if (currentFolderId) params.set('parentId', currentFolderId);
      params.set('limit', '50');

      const res = await fetch(`/api/esp/media?${params.toString()}`);
      const data = await res.json();

      if (res.ok) {
        if (cursor) {
          setFiles(prev => [...prev, ...(data.files || [])]);
        } else {
          setFiles(data.files || []);
          setFolders(data.folders || []);
        }
        setNextCursor(data.nextCursor || undefined);
        setProvider(data.provider || null);
        setCapabilities(data.capabilities || null);
      } else {
        toast.error(data.error || 'Failed to load media');
      }
    } catch {
      toast.error('Failed to load media');
    }

    setLoading(false);
    setLoadingMore(false);
  }, [effectiveAccountKey, currentFolderId]);

  useEffect(() => {
    if (effectiveAccountKey) {
      loadMedia();
    } else {
      setFiles([]);
      setFolders([]);
      setProvider(null);
      setCapabilities(null);
      setNextCursor(undefined);
      setCurrentFolderId(undefined);
      setFolderPath([{ id: undefined, name: 'Root' }]);
    }
  }, [effectiveAccountKey, loadMedia]);

  // ── Upload ──

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !effectiveAccountKey) return;

    setUploading(true);
    const uploadedFiles: MediaFile[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const formData = new FormData();
      formData.append('accountKey', effectiveAccountKey);
      formData.append('file', file);
      if (currentFolderId) formData.append('parentId', currentFolderId);

      try {
        const res = await fetch('/api/esp/media', {
          method: 'POST',
          body: formData,
        });
        const { ok, data, error } = await safeJson<{ file: MediaFile }>(res);

        if (ok && data?.file) {
          uploadedFiles.push(data.file);
        } else {
          toast.error(`Failed to upload ${file.name}: ${error || 'Unknown error'}`);
        }
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    if (uploadedFiles.length > 0) {
      setFiles(prev => [...uploadedFiles, ...prev]);
      toast.success(`Uploaded ${uploadedFiles.length} file${uploadedFiles.length > 1 ? 's' : ''}`);
    }

    setUploading(false);
    setShowUploadModal(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  // ── Rename ──

  const handleRename = async () => {
    if (!renameFile || !renameValue.trim() || !effectiveAccountKey) return;
    setRenaming(true);

    try {
      const res = await fetch(`/api/esp/media/${encodeURIComponent(renameFile.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountKey: effectiveAccountKey,
          name: renameValue.trim(),
        }),
      });
      const data = await res.json();

      if (res.ok && data.file) {
        setFiles(prev =>
          prev.map(f => (f.id === renameFile.id ? { ...f, ...data.file } : f))
        );
        toast.success('File renamed');
        setRenameFile(null);
      } else {
        toast.error(data.error || 'Failed to rename');
      }
    } catch {
      toast.error('Failed to rename file');
    }

    setRenaming(false);
  };

  // ── Delete ──

  const handleDelete = async () => {
    if (!deleteFile || !effectiveAccountKey) return;
    setDeleting(true);

    try {
      const res = await fetch(
        `/api/esp/media/${encodeURIComponent(deleteFile.id)}?accountKey=${encodeURIComponent(effectiveAccountKey)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();

      if (res.ok) {
        setFiles(prev => prev.filter(f => f.id !== deleteFile.id));
        toast.success('File deleted');
        setDeleteFile(null);
      } else {
        toast.error(data.error || 'Failed to delete');
      }
    } catch {
      toast.error('Failed to delete file');
    }

    setDeleting(false);
  };

  // ── Copy URL ──

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('URL copied to clipboard');
    } catch {
      toast.error('Failed to copy URL');
    }
  };

  // ── Bulk Selection ──

  const toggleSelectFile = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllFiles = () => {
    setSelectedIds(new Set(filtered.map(f => f.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  // ── Move ──

  const loadMoveFolders = async (parentId?: string) => {
    if (!effectiveAccountKey) return;
    setMoveLoading(true);
    try {
      const params = new URLSearchParams({ accountKey: effectiveAccountKey });
      if (parentId) params.set('parentId', parentId);
      params.set('limit', '200');
      const res = await fetch(`/api/esp/media?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setMoveFolders(data.folders || []);
      }
    } catch {
      toast.error('Failed to load folders');
    }
    setMoveLoading(false);
  };

  const openMoveModal = (items: { id: string; type: 'file' | 'folder' }[]) => {
    setMoveItems(items);
    setMoveFolderPath([{ id: undefined, name: 'Root' }]);
    setShowMoveModal(true);
    loadMoveFolders();
  };

  const handleMoveConfirm = async () => {
    if (!effectiveAccountKey || moveItems.length === 0) return;
    setMoving(true);

    const targetFolderId = moveFolderPath[moveFolderPath.length - 1].id;
    let successCount = 0;

    for (const item of moveItems) {
      try {
        const res = await fetch(`/api/esp/media/${encodeURIComponent(item.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountKey: effectiveAccountKey,
            targetFolderId: targetFolderId || null,
          }),
        });
        if (res.ok) successCount++;
        else {
          const data = await res.json();
          toast.error(data.error || `Failed to move item`);
        }
      } catch {
        toast.error('Failed to move item');
      }
    }

    if (successCount > 0) {
      toast.success(`Moved ${successCount} item${successCount > 1 ? 's' : ''}`);
      loadMedia(); // Refresh current view
    }

    setMoving(false);
    setShowMoveModal(false);
    setMoveItems([]);
    clearSelection();
  };

  const handleBulkMove = () => {
    const items = Array.from(selectedIds).map(id => ({ id, type: 'file' as const }));
    openMoveModal(items);
  };

  // ── Bulk Delete ──

  const handleBulkDelete = async () => {
    if (!effectiveAccountKey || selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(`Delete ${count} selected file${count > 1 ? 's' : ''}? This cannot be undone.`)) return;

    setDeleting(true);
    let successCount = 0;

    for (const id of selectedIds) {
      try {
        const res = await fetch(
          `/api/esp/media/${encodeURIComponent(id)}?accountKey=${encodeURIComponent(effectiveAccountKey)}`,
          { method: 'DELETE' },
        );
        if (res.ok) successCount++;
      } catch { /* skip */ }
    }

    if (successCount > 0) {
      setFiles(prev => prev.filter(f => !selectedIds.has(f.id)));
      toast.success(`Deleted ${successCount} file${successCount > 1 ? 's' : ''}`);
    }

    setDeleting(false);
    clearSelection();
  };

  // ── Delete Folder ──

  const handleDeleteFolder = async () => {
    if (!deleteFolderItem || !effectiveAccountKey) return;
    setDeletingFolder(true);

    try {
      const res = await fetch(
        `/api/esp/media/${encodeURIComponent(deleteFolderItem.id)}?accountKey=${encodeURIComponent(effectiveAccountKey)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();

      if (res.ok) {
        setFolders(prev => prev.filter(f => f.id !== deleteFolderItem.id));
        toast.success(`Folder "${deleteFolderItem.name}" deleted`);
        setDeleteFolderItem(null);
      } else {
        toast.error(data.error || 'Failed to delete folder');
      }
    } catch {
      toast.error('Failed to delete folder');
    }

    setDeletingFolder(false);
  };

  // ── Folder Navigation ──

  const navigateToFolder = useCallback((folder: MediaFolder) => {
    setCurrentFolderId(folder.id);
    setFolderPath(prev => [...prev, { id: folder.id, name: folder.name }]);
    setSearch('');
  }, []);

  const navigateToBreadcrumb = useCallback((index: number) => {
    const crumb = folderPath[index];
    setCurrentFolderId(crumb.id);
    setFolderPath(prev => prev.slice(0, index + 1));
    setSearch('');
  }, [folderPath]);

  // ── Create Folder ──

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !effectiveAccountKey) return;
    setCreatingFolder(true);

    try {
      const res = await fetch('/api/esp/media/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountKey: effectiveAccountKey,
          name: newFolderName.trim(),
          parentId: currentFolderId,
        }),
      });
      const data = await res.json();

      if (res.ok && data.folder) {
        setFolders(prev => [data.folder, ...prev]);
        toast.success(`Folder "${newFolderName.trim()}" created`);
        setNewFolderName('');
        setShowNewFolderInput(false);
      } else {
        toast.error(data.error || 'Failed to create folder');
      }
    } catch {
      toast.error('Failed to create folder');
    }

    setCreatingFolder(false);
  };

  // ── Filtering ──

  const filtered = useMemo(() => {
    if (!search.trim()) return files;
    const q = search.toLowerCase();
    return files.filter(f => f.name.toLowerCase().includes(q));
  }, [files, search]);

  const filteredFolders = useMemo(() => {
    if (!search.trim()) return folders;
    const q = search.toLowerCase();
    return folders.filter(f => f.name.toLowerCase().includes(q));
  }, [folders, search]);

  // ── Connection state ──
  const connectedProviders = accountData?.connectedProviders;
  const hasConnection = effectiveAccountKey && connectedProviders && connectedProviders.length > 0;

  // ── Sub-components ──

  const ProviderPill = ({ prov }: { prov: string }) => {
    const icon = providerIcon(prov);
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--muted)] text-[10px] font-medium text-[var(--muted-foreground)]">
        {icon && (
          <img src={icon} alt={providerLabel(prov)} className="w-3.5 h-3.5 rounded-full object-cover" />
        )}
        {providerLabel(prov)}
      </span>
    );
  };

  const MediaCard = ({ f, cardProvider, cardCapabilities }: {
    f: MediaFile;
    cardProvider?: string | null;
    cardCapabilities?: MediaCapabilities | null;
  }) => {
    const isMenuOpen = openMenu === f.id;
    const isImage = f.type?.startsWith('image') || f.url?.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);
    const activeProvider = cardProvider ?? provider;
    const activeCaps = cardCapabilities ?? capabilities;
    const isSelected = selectedIds.has(f.id);

    return (
      <div className={`glass-card rounded-xl group animate-fade-in-up overflow-hidden ${isSelected ? 'ring-2 ring-[var(--primary)]' : ''}`}>
        {/* Thumbnail */}
        <div
          className="h-[140px] bg-[var(--muted)] relative overflow-hidden cursor-pointer"
          onClick={() => selectMode ? toggleSelectFile(f.id) : setPreviewFile(f)}
        >
          {isImage && f.url ? (
            <img
              src={f.thumbnailUrl || f.url}
              alt={f.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <PhotoIcon className="w-10 h-10 text-[var(--muted-foreground)] opacity-30" />
            </div>
          )}
          {/* Select checkbox */}
          {selectMode && (
            <div className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-[var(--primary)] border-[var(--primary)]'
                : 'bg-black/40 border-white/60 hover:border-white'
            }`}>
              {isSelected && <CheckIcon className="w-3.5 h-3.5 text-white" />}
            </div>
          )}
          {/* Hover overlay */}
          {!selectMode && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <EyeIcon className="w-6 h-6 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-lg" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            {activeProvider && <ProviderPill prov={activeProvider} />}
            {!selectMode && (
              <div className="relative flex-shrink-0">
                <button
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setOpenMenu(prev => prev === f.id ? null : f.id);
                  }}
                  className="p-1 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors opacity-0 group-hover:opacity-100"
                >
                  <EllipsisVerticalIcon className="w-4 h-4" />
                </button>
                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-44 glass-dropdown" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => { setOpenMenu(null); copyUrl(f.url); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                    >
                      <ClipboardDocumentIcon className="w-4 h-4" /> Copy URL
                    </button>
                    {activeCaps?.canMove && (
                      <button
                        onClick={() => { setOpenMenu(null); openMoveModal([{ id: f.id, type: 'file' }]); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                      >
                        <FolderArrowDownIcon className="w-4 h-4" /> Move
                      </button>
                    )}
                    {activeCaps?.canRename && (
                      <button
                        onClick={() => { setOpenMenu(null); setRenameValue(f.name); setRenameFile(f); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                      >
                        <PencilSquareIcon className="w-4 h-4" /> Rename
                      </button>
                    )}
                    {activeCaps?.canDelete && (
                      <button
                        onClick={() => { setOpenMenu(null); setDeleteFile(f); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <TrashIcon className="w-4 h-4" /> Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <h3 className="text-xs font-semibold truncate" title={f.name}>
            {f.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            {f.size != null && (
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {formatFileSize(f.size)}
              </span>
            )}
            <span className="text-[10px] text-[var(--muted-foreground)] ml-auto">
              {timeAgo(f.createdAt)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // ── Overview Account Card Component ──

  const AccountCard = ({ acctKey }: { acctKey: string }) => {
    const acct = accounts[acctKey];
    const row = overviewData[acctKey];
    const acctName = acct?.dealer || acctKey;
    const location = [acct?.city, acct?.state].filter(Boolean).join(', ');
    const providerList = acct?.connectedProviders || [];

    return (
      <button
        onClick={() => { setAccountFilter(acctKey); setSearch(''); }}
        className="glass-card rounded-xl p-5 text-left group hover:ring-1 hover:ring-[var(--primary)]/30 transition-all animate-fade-in-up"
      >
        <div className="flex items-start gap-3">
          <AccountAvatar
            name={acctName}
            accountKey={acctKey}
            storefrontImage={acct?.storefrontImage}
            logos={acct?.logos}
            size={40}
            className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-[var(--border)]"
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold truncate group-hover:text-[var(--primary)] transition-colors">
              {acctName}
            </h3>
            {location && (
              <p className="text-[11px] text-[var(--muted-foreground)] truncate mt-0.5">{location}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              {providerList.map((prov: string) => (
                <ProviderPill key={prov} prov={prov} />
              ))}
            </div>
          </div>
          <ChevronRightIcon className="w-4 h-4 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity mt-1 flex-shrink-0" />
        </div>
        {/* File count summary */}
        {row && !row.loading && !row.error && (
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)]">
              <PhotoIcon className="w-3.5 h-3.5" />
              <span>
                {(row.totalCount ?? 0) === 0
                  ? 'No files'
                  : `${row.totalCount} file${row.totalCount !== 1 ? 's' : ''}`}
              </span>
            </div>
          </div>
        )}
        {row?.loading && (
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <div className="h-3 bg-[var(--muted)] rounded w-16 animate-pulse" />
          </div>
        )}
        {row && !row.loading && row.error && (
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <div className="flex items-center gap-1.5 text-[10px] text-red-400">
              <ExclamationTriangleIcon className="w-3.5 h-3.5" />
              <span>Unable to load</span>
            </div>
          </div>
        )}
      </button>
    );
  };

  // ── Render ──

  return (
    <div>
      {/* Header */}
      <div className="page-sticky-header mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <PhotoIcon className="w-7 h-7 text-[var(--primary)]" />
            <div>
              <h2 className="text-2xl font-bold">Media Library</h2>
              {/* Breadcrumb for admin navigation */}
              {isAdmin ? (
                <div className="flex items-center gap-1.5 text-sm mt-0.5">
                  {effectiveAccountKey ? (
                    <>
                      <button
                        onClick={() => { setAccountFilter('all'); setSearch(''); setOverviewSearch(''); setCurrentFolderId(undefined); setFolderPath([{ id: undefined, name: 'Root' }]); }}
                        className="text-[var(--primary)] hover:text-[var(--primary)]/80 transition-colors"
                      >
                        All Accounts
                      </button>
                      <ChevronRightIcon className="w-3 h-3 text-[var(--muted-foreground)]" />
                      <span className="text-[var(--muted-foreground)]">
                        {accounts[effectiveAccountKey]?.dealer || effectiveAccountKey}
                      </span>
                    </>
                  ) : (
                    <span className="text-[var(--muted-foreground)]">All Accounts</span>
                  )}
                </div>
              ) : (
                <p className="text-[var(--muted-foreground)] text-sm mt-0.5">
                  {isAccount && accountData
                    ? `Media files for ${accountData.dealer}`
                    : 'Manage your media files'}
                </p>
              )}
            </div>
          </div>

          {/* Action buttons in header */}
          {effectiveAccountKey && (hasConnection || isAdmin) && (
            <div className="flex items-center gap-2">
              {capabilities?.canUpload && (
                <button
                  onClick={() => setShowUploadModal(true)}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                  {uploading ? 'Uploading...' : 'Add Media'}
                </button>
              )}
              {capabilities?.canCreateFolders && (
                <button
                  onClick={() => setShowNewFolderInput(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors"
                >
                  <FolderPlusIcon className="w-3.5 h-3.5" />
                  New Folder
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Admin Overview Mode ── */}
      {showOverview && (
        <>
          {connectedAccountKeys.length === 0 && (
            <div className="text-center py-16 text-[var(--muted-foreground)]">
              <PhotoIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium mb-1">No connected accounts</p>
              <p className="text-xs">Connect an integration in account settings to manage media files.</p>
            </div>
          )}

          {connectedAccountKeys.length > 0 && (
            <>
              {/* Overview search bar */}
              <div className="flex items-center justify-between mb-4 gap-3">
                <div className="relative flex-1 max-w-xs">
                  <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                  <input
                    type="text"
                    value={overviewSearch}
                    onChange={(e) => setOverviewSearch(e.target.value)}
                    className="w-full text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-[var(--foreground)]"
                    placeholder="Search accounts..."
                  />
                </div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {filteredOverviewKeys.length} account{filteredOverviewKeys.length !== 1 ? 's' : ''}
                  {overviewSearch && ` matching "${overviewSearch}"`}
                </p>
              </div>

              {filteredOverviewKeys.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredOverviewKeys.map(key => (
                    <AccountCard key={key} acctKey={key} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-[var(--muted-foreground)]">
                  <MagnifyingGlassIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No accounts match &quot;{overviewSearch}&quot;</p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Single-Account Detail Mode ── */}
      {!showOverview && (
        <>
          {/* Hidden file input for uploads */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => handleUpload(e.target.files)}
            className="hidden"
            id="media-upload-input"
          />

          {/* Toolbar */}
          {effectiveAccountKey && (hasConnection || isAdmin) && (
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-xs">
                  <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-[var(--foreground)]"
                    placeholder="Search files..."
                  />
                </div>
                {/* Select mode toggle */}
                {capabilities?.canMove && filtered.length > 0 && (
                  <button
                    onClick={() => { setSelectMode(prev => !prev); setSelectedIds(new Set()); }}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                      selectMode
                        ? 'bg-[var(--primary)] text-white'
                        : 'border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
                    }`}
                  >
                    <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                    {selectMode ? 'Cancel' : 'Select'}
                  </button>
                )}
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                {loading ? 'Loading...' : (
                  <>
                    {filteredFolders.length > 0 && `${filteredFolders.length} folder${filteredFolders.length !== 1 ? 's' : ''}, `}
                    {`${filtered.length} file${filtered.length !== 1 ? 's' : ''}`}
                  </>
                )}
                {search && ` matching "${search}"`}
              </p>
            </div>
          )}

          {/* Bulk selection toolbar */}
          {selectMode && (
            <div className="flex items-center justify-between mb-4 px-4 py-2.5 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 animate-fade-in-up">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={selectedIds.size === filtered.length ? clearSelection : selectAllFiles}
                  className="text-xs text-[var(--primary)] hover:text-[var(--primary)]/80 transition-colors"
                >
                  {selectedIds.size === filtered.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                {capabilities?.canMove && selectedIds.size > 0 && (
                  <button
                    onClick={handleBulkMove}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[var(--border)] text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors"
                  >
                    <FolderArrowDownIcon className="w-3.5 h-3.5" /> Move
                  </button>
                )}
                {capabilities?.canDelete && selectedIds.size > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    disabled={deleting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    <TrashIcon className="w-3.5 h-3.5" /> Delete
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Breadcrumb navigation */}
          {effectiveAccountKey && capabilities?.canNavigateFolders && folderPath.length > 1 && (
            <div className="flex items-center gap-1 mb-4 text-sm flex-wrap">
              {folderPath.map((crumb, idx) => {
                const isLast = idx === folderPath.length - 1;
                return (
                  <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
                    {idx > 0 && (
                      <ChevronRightIcon className="w-3 h-3 text-[var(--muted-foreground)]" />
                    )}
                    {isLast ? (
                      <span className="font-medium text-[var(--foreground)] flex items-center gap-1">
                        {idx === 0 ? <HomeIcon className="w-3.5 h-3.5" /> : <FolderIcon className="w-3.5 h-3.5" />}
                        {crumb.name}
                      </span>
                    ) : (
                      <button
                        onClick={() => navigateToBreadcrumb(idx)}
                        className="flex items-center gap-1 text-[var(--primary)] hover:text-[var(--primary)]/80 transition-colors"
                      >
                        {idx === 0 ? <HomeIcon className="w-3.5 h-3.5" /> : <FolderIcon className="w-3.5 h-3.5" />}
                        {crumb.name}
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}

          {/* New folder input */}
          {showNewFolderInput && (
            <div className="flex items-center gap-2 mb-4 animate-fade-in-up">
              <FolderPlusIcon className="w-5 h-5 text-[var(--muted-foreground)]" />
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setShowNewFolderInput(false); setNewFolderName(''); } }}
                className="text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)] w-64"
                placeholder="Folder name..."
                autoFocus
              />
              <button
                onClick={handleCreateFolder}
                disabled={creatingFolder || !newFolderName.trim()}
                className="px-3 py-2 text-sm font-medium text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {creatingFolder ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); }}
                className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Account mode: no connection */}
          {!isAdmin && effectiveAccountKey && !hasConnection && !loading && (
            <div className="text-center py-16 text-[var(--muted-foreground)]">
              <ExclamationTriangleIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium mb-1">No Integration Connected</p>
              <p className="text-xs">Connect an integration in your account settings to manage media files.</p>
            </div>
          )}

          {/* Account mode: no account selected */}
          {!isAdmin && !effectiveAccountKey && (
            <div className="text-center py-16 text-[var(--muted-foreground)]">
              <PhotoIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select an account to view its media files.</p>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                <div key={i} className="glass-card rounded-xl animate-pulse">
                  <div className="h-[140px] rounded-t-xl bg-[var(--muted)]" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-[var(--muted)] rounded w-16" />
                    <div className="h-3 bg-[var(--muted)] rounded w-3/4" />
                    <div className="h-2 bg-[var(--muted)] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && effectiveAccountKey && (hasConnection || isAdmin) && filtered.length === 0 && filteredFolders.length === 0 && (
            <div className="text-center py-16 text-[var(--muted-foreground)]">
              <PhotoIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              {files.length === 0 && folders.length === 0 ? (
                <>
                  <p className="text-sm font-medium mb-1">
                    {currentFolderId ? 'This folder is empty' : 'No media files yet'}
                  </p>
                  <p className="text-xs">Click &quot;Upload Media&quot; to upload files.</p>
                </>
              ) : (
                <p className="text-sm">No files match your search.</p>
              )}
            </div>
          )}

          {/* Folder grid */}
          {!loading && filteredFolders.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 mb-3">
              {filteredFolders.map(folder => (
                <div
                  key={folder.id}
                  className="glass-card rounded-xl p-4 text-left group hover:ring-1 hover:ring-[var(--primary)]/30 transition-all animate-fade-in-up relative"
                >
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigateToFolder(folder)}>
                    <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
                      <FolderIcon className="w-5 h-5 text-[var(--primary)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs font-semibold truncate group-hover:text-[var(--primary)] transition-colors" title={folder.name}>
                        {folder.name}
                      </h3>
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        {timeAgo(folder.createdAt)}
                      </span>
                    </div>
                    <ChevronRightIcon className="w-4 h-4 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {/* Folder context menu button */}
                  {(capabilities?.canMove || capabilities?.canDelete) && (
                    <div className="absolute top-2 right-2">
                      <button
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setFolderMenuId(prev => prev === folder.id ? null : folder.id);
                        }}
                        className="p-1 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <EllipsisVerticalIcon className="w-4 h-4" />
                      </button>
                      {folderMenuId === folder.id && (
                        <div className="absolute right-0 top-full mt-1 z-50 w-40 glass-dropdown" onClick={(e) => e.stopPropagation()}>
                          {capabilities?.canMove && (
                            <button
                              onClick={() => { setFolderMenuId(null); openMoveModal([{ id: folder.id, type: 'folder' }]); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                            >
                              <FolderArrowDownIcon className="w-4 h-4" /> Move
                            </button>
                          )}
                          {capabilities?.canDelete && (
                            <button
                              onClick={() => { setFolderMenuId(null); setDeleteFolderItem(folder); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <TrashIcon className="w-4 h-4" /> Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Media grid */}
          {!loading && filtered.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtered.map(f => (
                <MediaCard key={f.id} f={f} />
              ))}
            </div>
          )}

          {/* Load More */}
          {!loading && nextCursor && (
            <div className="text-center mt-6">
              <button
                onClick={() => loadMedia(nextCursor)}
                disabled={loadingMore}
                className="px-6 py-2.5 text-sm font-medium border border-[var(--border)] text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Rename Modal ── */}
      {renameFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in" onClick={() => setRenameFile(null)}>
          <div className="glass-modal w-[420px]" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <h3 className="text-base font-semibold">Rename File</h3>
            </div>
            <div className="p-5">
              <label className="block text-sm text-[var(--muted-foreground)] mb-2">File name</label>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
                className="w-full text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)]">
              <button
                onClick={() => setRenameFile(null)}
                className="px-4 py-2 text-sm font-medium text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={renaming || !renameValue.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {renaming ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in" onClick={() => setDeleteFile(null)}>
          <div className="glass-modal w-[420px]" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <h3 className="text-base font-semibold">Delete File</h3>
            </div>
            <div className="p-5">
              <p className="text-sm text-[var(--foreground)]">
                Are you sure you want to delete <strong>{deleteFile.name}</strong>?
              </p>
              <p className="text-xs text-[var(--muted-foreground)] mt-2">
                This will permanently remove the file from {provider ? providerLabel(provider) : 'the connected platform'}. This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)]">
              <button
                onClick={() => setDeleteFile(null)}
                className="px-4 py-2 text-sm font-medium text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upload Modal ── */}
      {showUploadModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in"
          onClick={() => !uploading && setShowUploadModal(false)}
          onKeyDown={(e) => { if (e.key === 'Escape' && !uploading) setShowUploadModal(false); }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div
            className="glass-modal w-[520px]"
            onClick={(e) => e.stopPropagation()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h3 className="text-base font-semibold">Upload Media</h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <div
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${
                  dragOver
                    ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                    : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-2 text-[var(--primary)]">
                    <ArrowUpTrayIcon className="w-8 h-8 animate-bounce" />
                    <span className="text-sm font-medium">Uploading...</span>
                  </div>
                ) : (
                  <>
                    <ArrowUpTrayIcon className="w-10 h-10 mx-auto text-[var(--muted-foreground)] mb-3" />
                    <p className="text-sm text-[var(--foreground)] font-medium mb-1">
                      Drop files here or click to browse
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Images will be uploaded to {provider ? providerLabel(provider) : 'your connected platform'}
                      {currentFolderId && folderPath.length > 1 && (
                        <> in <strong>{folderPath[folderPath.length - 1].name}</strong></>
                      )}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Folder Confirmation Modal ── */}
      {deleteFolderItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in" onClick={() => setDeleteFolderItem(null)}>
          <div className="glass-modal w-[420px]" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <h3 className="text-base font-semibold">Delete Folder</h3>
            </div>
            <div className="p-5">
              <p className="text-sm text-[var(--foreground)]">
                Are you sure you want to delete <strong>{deleteFolderItem.name}</strong>?
              </p>
              <p className="text-xs text-[var(--muted-foreground)] mt-2">
                This will permanently remove the folder and all its contents from {provider ? providerLabel(provider) : 'the connected platform'}. This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)]">
              <button
                onClick={() => setDeleteFolderItem(null)}
                className="px-4 py-2 text-sm font-medium text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteFolder}
                disabled={deletingFolder}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deletingFolder ? 'Deleting...' : 'Delete Folder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Move Modal (Folder Picker) ── */}
      {showMoveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in"
          onClick={() => !moving && setShowMoveModal(false)}
          onKeyDown={(e) => { if (e.key === 'Escape' && !moving) setShowMoveModal(false); }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className="glass-modal w-[480px] max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div>
                <h3 className="text-base font-semibold">Move to Folder</h3>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  {moveItems.length} item{moveItems.length > 1 ? 's' : ''} selected
                </p>
              </div>
              <button
                onClick={() => setShowMoveModal(false)}
                className="p-1 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1 px-5 py-2 border-b border-[var(--border)] text-xs flex-wrap">
              {moveFolderPath.map((crumb, idx) => {
                const isLast = idx === moveFolderPath.length - 1;
                return (
                  <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
                    {idx > 0 && <ChevronRightIcon className="w-3 h-3 text-[var(--muted-foreground)]" />}
                    {isLast ? (
                      <span className="font-medium text-[var(--foreground)] flex items-center gap-1">
                        {idx === 0 ? <HomeIcon className="w-3 h-3" /> : <FolderIcon className="w-3 h-3" />}
                        {crumb.name}
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          const newPath = moveFolderPath.slice(0, idx + 1);
                          setMoveFolderPath(newPath);
                          loadMoveFolders(crumb.id);
                        }}
                        className="flex items-center gap-1 text-[var(--primary)] hover:text-[var(--primary)]/80 transition-colors"
                      >
                        {idx === 0 ? <HomeIcon className="w-3 h-3" /> : <FolderIcon className="w-3 h-3" />}
                        {crumb.name}
                      </button>
                    )}
                  </span>
                );
              })}
            </div>

            {/* Folder list */}
            <div className="flex-1 overflow-y-auto p-3 min-h-[200px]">
              {moveLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-pulse text-sm text-[var(--muted-foreground)]">Loading folders...</div>
                </div>
              ) : moveFolders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-[var(--muted-foreground)]">
                  <FolderIcon className="w-8 h-8 opacity-30 mb-2" />
                  <p className="text-xs">No subfolders here</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {moveFolders
                    .filter(mf => !moveItems.some(mi => mi.id === mf.id))
                    .map(mf => (
                    <button
                      key={mf.id}
                      onClick={() => {
                        const newPath = [...moveFolderPath, { id: mf.id, name: mf.name }];
                        setMoveFolderPath(newPath);
                        loadMoveFolders(mf.id);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-[var(--muted)] transition-colors"
                    >
                      <FolderIcon className="w-5 h-5 text-[var(--primary)] flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{mf.name}</span>
                      <ChevronRightIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)] ml-auto flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[var(--border)]">
              <p className="text-xs text-[var(--muted-foreground)]">
                Move to: <strong>{moveFolderPath[moveFolderPath.length - 1].name}</strong>
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowMoveModal(false)}
                  className="px-4 py-2 text-sm font-medium text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMoveConfirm}
                  disabled={moving}
                  className="px-4 py-2 text-sm font-medium text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {moving ? 'Moving...' : 'Move Here'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Image Preview Modal ── */}
      {previewFile && (() => {
        const previewIsImage = previewFile.type?.startsWith('image') || previewFile.url?.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);
        const currentIndex = filtered.findIndex(f => f.id === previewFile.id);
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex < filtered.length - 1;

        const goPrev = () => { if (hasPrev) setPreviewFile(filtered[currentIndex - 1]); };
        const goNext = () => { if (hasNext) setPreviewFile(filtered[currentIndex + 1]); };

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-overlay-in"
            onClick={() => setPreviewFile(null)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setPreviewFile(null);
              if (e.key === 'ArrowLeft') goPrev();
              if (e.key === 'ArrowRight') goNext();
            }}
            tabIndex={-1}
            ref={(el) => el?.focus()}
          >
            <div className="glass-modal w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-3 min-w-0">
                  <PhotoIcon className="w-5 h-5 text-[var(--muted-foreground)] flex-shrink-0" />
                  <h3 className="text-sm font-semibold truncate" title={previewFile.name}>
                    {previewFile.name}
                  </h3>
                  {currentIndex >= 0 && (
                    <span className="text-[10px] text-[var(--muted-foreground)] flex-shrink-0">
                      {currentIndex + 1} / {filtered.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors flex-shrink-0"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Image */}
              <div className="flex-1 overflow-hidden flex items-center justify-center bg-black/20 relative min-h-0">
                {previewIsImage && previewFile.url ? (
                  <img
                    src={previewFile.url}
                    alt={previewFile.name}
                    className="max-w-full max-h-[70vh] object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-[var(--muted-foreground)]">
                    <PhotoIcon className="w-16 h-16 opacity-30 mb-3" />
                    <p className="text-sm">Preview not available</p>
                  </div>
                )}

                {/* Prev/Next navigation */}
                {hasPrev && (
                  <button
                    onClick={(e) => { e.stopPropagation(); goPrev(); }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
                  >
                    <ArrowLeftIcon className="w-5 h-5" />
                  </button>
                )}
                {hasNext && (
                  <button
                    onClick={(e) => { e.stopPropagation(); goNext(); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
                  >
                    <ArrowRightIcon className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--border)]">
                <div className="flex items-center gap-3 text-[10px] text-[var(--muted-foreground)]">
                  {provider && <ProviderPill prov={provider} />}
                  {previewFile.size != null && <span>{formatFileSize(previewFile.size)}</span>}
                  {previewFile.createdAt && <span>{timeAgo(previewFile.createdAt)}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyUrl(previewFile.url)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[var(--border)] text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors"
                  >
                    <ClipboardDocumentIcon className="w-3.5 h-3.5" /> Copy URL
                  </button>
                  {capabilities?.canDelete && (
                    <button
                      onClick={() => { setPreviewFile(null); setDeleteFile(previewFile); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors"
                    >
                      <TrashIcon className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
