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
  BuildingStorefrontIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckIcon,
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

interface MediaCapabilities {
  canUpload: boolean;
  canDelete: boolean;
  canRename: boolean;
}

interface AccountMediaPreview {
  files: MediaFile[];
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

const OVERVIEW_LIMIT = 8;

// ── Page ──

export default function MediaPage() {
  const { isAdmin, isAccount, accountKey, accountData, accounts } = useAccount();

  // ── Single-account detail state ──
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<MediaCapabilities | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');

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

  // Admin account filter
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  // ── Admin overview state ──
  const [overviewData, setOverviewData] = useState<Record<string, AccountMediaPreview>>({});
  const [overviewLoaded, setOverviewLoaded] = useState(false);

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

  const selectedAccountData = accountFilter !== 'all' ? accounts[accountFilter] : null;
  const accountFilterLabel = accountFilter === 'all'
    ? 'All Accounts'
    : selectedAccountData?.dealer || accountFilter;

  // Close menus on outside click
  useEffect(() => {
    const handler = () => setOpenMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Close account dropdown on outside click
  useEffect(() => {
    if (!accountDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setAccountDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [accountDropdownOpen]);

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

    // Fetch media for all connected accounts in parallel
    const results = await Promise.allSettled(
      connectedAccountKeys.map(async (key) => {
        const params = new URLSearchParams({
          accountKey: key,
          limit: String(OVERVIEW_LIMIT),
        });
        const res = await fetch(`/api/esp/media?${params.toString()}`);
        const data = await res.json();

        if (res.ok) {
          return {
            accountKey: key,
            files: (data.files || []) as MediaFile[],
            provider: data.provider || null,
            capabilities: data.capabilities || null,
          };
        } else {
          return {
            accountKey: key,
            files: [] as MediaFile[],
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
          const { accountKey: key, files: rowFiles, provider: rowProvider, capabilities: rowCaps, error } = result.value as {
            accountKey: string;
            files: MediaFile[];
            provider: string | null;
            capabilities: MediaCapabilities | null;
            error?: string;
          };
          updated[key] = {
            files: rowFiles,
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
    }

    try {
      const params = new URLSearchParams({
        accountKey: effectiveAccountKey,
      });
      if (cursor) params.set('cursor', cursor);
      params.set('limit', '50');

      const res = await fetch(`/api/esp/media?${params.toString()}`);
      const data = await res.json();

      if (res.ok) {
        if (cursor) {
          setFiles(prev => [...prev, ...(data.files || [])]);
        } else {
          setFiles(data.files || []);
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
  }, [effectiveAccountKey]);

  useEffect(() => {
    if (effectiveAccountKey) {
      loadMedia();
    } else {
      setFiles([]);
      setProvider(null);
      setCapabilities(null);
      setNextCursor(undefined);
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

  // ── Filtering ──

  const filtered = useMemo(() => {
    if (!search.trim()) return files;
    const q = search.toLowerCase();
    return files.filter(f => f.name.toLowerCase().includes(q));
  }, [files, search]);

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

    return (
      <div className="glass-card rounded-xl group animate-fade-in-up overflow-hidden">
        {/* Thumbnail */}
        <div className="h-[140px] bg-[var(--muted)] relative overflow-hidden">
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
        </div>

        {/* Info */}
        <div className="p-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            {activeProvider && <ProviderPill prov={activeProvider} />}
            <div className="relative flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setOpenMenu(isMenuOpen ? null : f.id); }}
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

  // ── Overview Row Component ──

  const AccountMediaRow = ({ acctKey }: { acctKey: string }) => {
    const acct = accounts[acctKey];
    const row = overviewData[acctKey];
    const scrollRef = useRef<HTMLDivElement>(null);
    const acctName = acct?.dealer || acctKey;
    const location = [acct?.city, acct?.state].filter(Boolean).join(', ');

    const handleViewAll = () => {
      setAccountFilter(acctKey);
      setSearch('');
    };

    if (!row) return null;

    return (
      <div className="mb-8 animate-fade-in-up">
        {/* Row header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <AccountAvatar
              name={acctName}
              accountKey={acctKey}
              storefrontImage={acct?.storefrontImage}
              size={32}
              className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-[var(--border)]"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold truncate">{acctName}</h3>
                {row.provider && <ProviderPill prov={row.provider} />}
              </div>
              {location && (
                <p className="text-[10px] text-[var(--muted-foreground)] truncate">{location}</p>
              )}
            </div>
          </div>
          <button
            onClick={handleViewAll}
            className="flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:text-[var(--primary)]/80 transition-colors flex-shrink-0"
          >
            View All <ChevronRightIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Row content */}
        {row.loading && (
          <div className="flex gap-3 overflow-hidden">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="glass-card rounded-xl animate-pulse flex-shrink-0 w-[180px]">
                <div className="h-[110px] rounded-t-xl bg-[var(--muted)]" />
                <div className="p-2.5 space-y-1.5">
                  <div className="h-2.5 bg-[var(--muted)] rounded w-14" />
                  <div className="h-2.5 bg-[var(--muted)] rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!row.loading && row.error && (
          <div className="glass-card rounded-xl p-6 text-center text-[var(--muted-foreground)]">
            <ExclamationTriangleIcon className="w-6 h-6 mx-auto mb-2 opacity-40" />
            <p className="text-xs">{row.error}</p>
          </div>
        )}

        {!row.loading && !row.error && row.files.length === 0 && (
          <div className="glass-card rounded-xl p-6 text-center text-[var(--muted-foreground)]">
            <PhotoIcon className="w-6 h-6 mx-auto mb-2 opacity-30" />
            <p className="text-xs">No media files yet</p>
          </div>
        )}

        {!row.loading && !row.error && row.files.length > 0 && (
          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin"
            style={{ scrollbarWidth: 'thin' }}
          >
            {row.files.map(f => {
              const isImage = f.type?.startsWith('image') || f.url?.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);
              return (
                <div
                  key={f.id}
                  className="glass-card rounded-xl flex-shrink-0 w-[180px] overflow-hidden group cursor-pointer hover:ring-1 hover:ring-[var(--primary)]/30 transition-all"
                  onClick={() => copyUrl(f.url)}
                  title="Click to copy URL"
                >
                  <div className="h-[110px] bg-[var(--muted)] overflow-hidden">
                    {isImage && f.url ? (
                      <img
                        src={f.thumbnailUrl || f.url}
                        alt={f.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <PhotoIcon className="w-8 h-8 text-[var(--muted-foreground)] opacity-30" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-[11px] font-medium truncate" title={f.name}>{f.name}</p>
                    <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{timeAgo(f.createdAt)}</p>
                  </div>
                </div>
              );
            })}

            {/* "View All" card at the end if we hit the limit */}
            {row.files.length >= OVERVIEW_LIMIT && (
              <button
                onClick={handleViewAll}
                className="flex-shrink-0 w-[120px] glass-card rounded-xl flex flex-col items-center justify-center gap-2 text-[var(--primary)] hover:bg-[var(--primary)]/5 transition-colors"
              >
                <ChevronRightIcon className="w-6 h-6" />
                <span className="text-xs font-medium">View All</span>
              </button>
            )}
          </div>
        )}
      </div>
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
              <p className="text-[var(--muted-foreground)] text-sm mt-0.5">
                {isAdmin
                  ? effectiveAccountKey
                    ? `Media files for ${accounts[effectiveAccountKey]?.dealer || effectiveAccountKey}`
                    : 'Media files across all accounts'
                  : isAccount && accountData
                    ? `Media files for ${accountData.dealer}`
                    : 'Manage your media files'}
              </p>
            </div>
          </div>

          {/* Back to overview button when admin drilled into an account */}
          {isAdmin && effectiveAccountKey && (
            <button
              onClick={() => { setAccountFilter('all'); setSearch(''); }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] transition-colors"
            >
              All Accounts
            </button>
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
            <div>
              {connectedAccountKeys.map(key => (
                <AccountMediaRow key={key} acctKey={key} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Single-Account Detail Mode ── */}
      {!showOverview && (
        <>
          {/* Upload drop zone */}
          {effectiveAccountKey && (hasConnection || isAdmin) && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`mb-6 border-2 border-dashed rounded-xl p-6 text-center transition-all ${
                dragOver
                  ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                  : 'border-[var(--border)] hover:border-[var(--primary)]/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => handleUpload(e.target.files)}
                className="hidden"
                id="media-upload-input"
              />
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-[var(--primary)]">
                  <ArrowUpTrayIcon className="w-5 h-5 animate-bounce" />
                  <span className="text-sm font-medium">Uploading...</span>
                </div>
              ) : (
                <label htmlFor="media-upload-input" className="cursor-pointer">
                  <ArrowUpTrayIcon className="w-8 h-8 mx-auto text-[var(--muted-foreground)] mb-2" />
                  <p className="text-sm text-[var(--muted-foreground)]">
                    <span className="font-medium text-[var(--primary)]">Browse</span> or drag & drop files here
                  </p>
                  <p className="text-[10px] text-[var(--muted-foreground)] mt-1">
                    Images will be uploaded to {provider ? providerLabel(provider) : 'your connected platform'}
                  </p>
                </label>
              )}
            </div>
          )}

          {/* Toolbar */}
          {effectiveAccountKey && (hasConnection || isAdmin) && (
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
                    placeholder="Search files..."
                  />
                </div>

                {/* Account filter for admin */}
                {isAdmin && allAccountKeys.length > 0 && (
                  <div ref={accountDropdownRef} className="relative">
                    <button
                      onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
                      className={`inline-flex items-center gap-1.5 h-[38px] px-3 text-sm rounded-lg border transition-colors ${
                        accountDropdownOpen
                          ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5'
                          : accountFilter !== 'all'
                            ? 'border-[var(--primary)]/50 text-[var(--primary)] bg-[var(--primary)]/5'
                            : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      {accountFilter !== 'all' ? (
                        <AccountAvatar
                          name={accountFilterLabel}
                          accountKey={accountFilter}
                          storefrontImage={selectedAccountData?.storefrontImage}
                          size={16}
                          className="w-4 h-4 rounded-[3px] object-cover flex-shrink-0 border border-[var(--border)]"
                        />
                      ) : (
                        <BuildingStorefrontIcon className="w-3.5 h-3.5" />
                      )}
                      <span className="max-w-[140px] truncate">{accountFilterLabel}</span>
                      {accountFilter !== 'all' ? (
                        <XMarkIcon
                          className="w-3 h-3 hover:text-[var(--foreground)]"
                          onClick={(e) => { e.stopPropagation(); setAccountFilter('all'); setAccountDropdownOpen(false); }}
                        />
                      ) : (
                        <ChevronDownIcon className={`w-3 h-3 transition-transform ${accountDropdownOpen ? 'rotate-180' : ''}`} />
                      )}
                    </button>

                    {accountDropdownOpen && (
                      <div className="absolute top-full left-0 mt-2 z-50 glass-dropdown shadow-lg animate-fade-in-up" style={{ minWidth: '260px' }}>
                        <div className="p-1.5">
                          <p className="px-2 py-1 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                            Filter by Account
                          </p>
                          <button
                            onClick={() => { setAccountFilter('all'); setAccountDropdownOpen(false); }}
                            className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-colors ${
                              accountFilter === 'all'
                                ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                                : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                            }`}
                          >
                            All Accounts
                            {accountFilter === 'all' && <CheckIcon className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="border-t border-[var(--border)] max-h-[280px] overflow-y-auto p-1.5">
                          {allAccountKeys.map(k => {
                            const acct = accounts[k];
                            const isSelected = accountFilter === k;
                            const loc = [acct?.city, acct?.state].filter(Boolean).join(', ');
                            return (
                              <button
                                key={k}
                                onClick={() => { setAccountFilter(k); setAccountDropdownOpen(false); }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors ${
                                  isSelected
                                    ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                                    : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                                }`}
                              >
                                <AccountAvatar
                                  name={acct?.dealer || k}
                                  accountKey={k}
                                  storefrontImage={acct?.storefrontImage}
                                  size={20}
                                  className="w-5 h-5 rounded-md object-cover flex-shrink-0 border border-[var(--border)]"
                                />
                                <span className="flex-1 min-w-0 text-left">
                                  <span className="block truncate">{acct?.dealer || k}</span>
                                  {loc && (
                                    <span className="block text-[10px] text-[var(--muted-foreground)] truncate">{loc}</span>
                                  )}
                                </span>
                                {isSelected && <CheckIcon className="w-3.5 h-3.5 flex-shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <p className="text-xs text-[var(--muted-foreground)]">
                {loading ? 'Loading...' : `${filtered.length} file${filtered.length !== 1 ? 's' : ''}`}
                {search && ` matching "${search}"`}
              </p>
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
          {!loading && effectiveAccountKey && (hasConnection || isAdmin) && filtered.length === 0 && (
            <div className="text-center py-16 text-[var(--muted-foreground)]">
              <PhotoIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              {files.length === 0 ? (
                <>
                  <p className="text-sm font-medium mb-1">No media files yet</p>
                  <p className="text-xs">Upload files using the drop zone above.</p>
                </>
              ) : (
                <p className="text-sm">No files match your search.</p>
              )}
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
    </div>
  );
}
