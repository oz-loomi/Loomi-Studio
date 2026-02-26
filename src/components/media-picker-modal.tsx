'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  PhotoIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowUpTrayIcon,
  FolderIcon,
  ChevronRightIcon,
  HomeIcon,
} from '@heroicons/react/24/outline';
import { toast } from '@/lib/toast';

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
  source?: 'esp' | 's3';
}

type SourceFilter = 'all' | 'esp' | 's3';

interface MediaFolder {
  id: string;
  name: string;
  parentId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface FolderBreadcrumb {
  id: string | undefined;
  name: string;
}

export interface MediaPickerModalProps {
  accountKey?: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}

// ── Component ──

export function MediaPickerModal({ accountKey, onSelect, onClose }: MediaPickerModalProps) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>();
  const [folderPath, setFolderPath] = useState<FolderBreadcrumb[]>([{ id: undefined, name: 'Root' }]);
  const [canNavigateFolders, setCanNavigateFolders] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(accountKey ? 'all' : 's3');

  // ── Fetch media ──

  const loadMedia = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else { setLoading(true); setFolders([]); }

    try {
      if (!accountKey) {
        const s3Params = new URLSearchParams({ limit: '50' });
        if (cursor) s3Params.set('cursor', cursor);
        const s3Res = await fetch(`/api/media?${s3Params.toString()}`);
        const s3Data = await s3Res.json().catch(() => ({}));
        if (!s3Res.ok) {
          throw new Error((s3Data as Record<string, string>)?.error || `Error ${s3Res.status}`);
        }
        const s3Files: MediaFile[] = (s3Data.files || []).map((f: MediaFile) => ({
          ...f,
          source: 's3' as const,
        }));
        setFiles((prev) => (cursor ? [...prev, ...s3Files] : s3Files));
        setNextCursor((s3Data as { nextCursor?: string }).nextCursor || undefined);
        setCanNavigateFolders(false);
        if (!cursor) {
          setCurrentFolderId(undefined);
          setFolderPath([{ id: undefined, name: 'Root' }]);
        }
        return;
      }

      const espParams = new URLSearchParams({ accountKey, limit: '50' });
      if (cursor) espParams.set('cursor', cursor);
      if (currentFolderId) espParams.set('parentId', currentFolderId);

      // Fetch ESP + admin S3 in parallel (S3 only at root, only on initial load)
      // S3 fetches admin-level files (no accountKey) — Loomi media library
      const fetchS3 = !currentFolderId && !cursor;
      const [espRes, s3Res] = await Promise.all([
        fetch(`/api/esp/media?${espParams.toString()}`),
        fetchS3
          ? fetch(`/api/media?${new URLSearchParams({ limit: '50' }).toString()}`)
          : Promise.resolve(null),
      ]);

      if (!espRes.ok) {
        const errData = await espRes.json().catch(() => ({}));
        // Still try S3 even if ESP fails
        let s3Files: MediaFile[] = [];
        if (s3Res?.ok) {
          const s3Data = await s3Res.json();
          s3Files = (s3Data.files || []).map((f: MediaFile) => ({ ...f, source: 's3' as const }));
        }
        if (s3Files.length > 0) {
          setFiles(s3Files);
          setNextCursor(undefined);
        } else {
          throw new Error((errData as Record<string, string>)?.error || `Error ${espRes.status}`);
        }
      } else {
        const data = await espRes.json();
        const espFiles: MediaFile[] = (data.files || []).map((f: MediaFile) => ({ ...f, source: 'esp' as const }));

        let s3Files: MediaFile[] = [];
        if (s3Res?.ok) {
          const s3Data = await s3Res.json();
          s3Files = (s3Data.files || []).map((f: MediaFile) => ({ ...f, source: 's3' as const }));
        }

        setFiles((prev) => (cursor ? [...prev, ...espFiles] : [...espFiles, ...s3Files]));
        if (!cursor) setFolders(data.folders || []);
        setNextCursor(data.nextCursor || undefined);
        setCanNavigateFolders(Boolean(data.capabilities?.canNavigateFolders));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load media');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [accountKey, currentFolderId]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  // ── Upload ──

  const handleUpload = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setUploading(true);
    try {
      const uploaded: MediaFile[] = [];
      for (const file of Array.from(fileList)) {
        const formData = new FormData();
        formData.append('file', file);
        const isEspUpload = Boolean(accountKey);
        if (isEspUpload) {
          formData.append('accountKey', accountKey!);
          if (currentFolderId) formData.append('parentId', currentFolderId);
        } else {
          formData.append('category', 'general');
        }
        const res = await fetch(isEspUpload ? '/api/esp/media' : '/api/media', { method: 'POST', body: formData });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as Record<string, string>)?.error || `Upload failed (${res.status})`);
        }
        const data = await res.json();
        if (data.file) {
          uploaded.push({
            ...(data.file as MediaFile),
            source: isEspUpload ? 'esp' : 's3',
          });
        }
      }
      if (uploaded.length) {
        setFiles((prev) => [...uploaded, ...prev]);
        toast.success(`Uploaded ${uploaded.length} file${uploaded.length > 1 ? 's' : ''}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [accountKey, currentFolderId]);

  // ── Drag & drop ──

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  }, [handleUpload]);

  // ── Folder navigation ──

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

  // ── Search ──

  const filtered = useMemo(() => {
    let result = files;
    if (sourceFilter !== 'all') {
      result = result.filter((f) => (f.source || 'esp') === sourceFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(q));
    }
    return result;
  }, [files, search, sourceFilter]);

  const filteredFolders = useMemo(() => {
    if (!search.trim()) return folders;
    const q = search.toLowerCase();
    return folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [folders, search]);

  const sourceOptions: SourceFilter[] = accountKey ? ['all', 'esp', 's3'] : ['s3'];

  useEffect(() => {
    if (!accountKey && sourceFilter !== 's3') {
      setSourceFilter('s3');
    }
  }, [accountKey, sourceFilter]);

  // ── Escape key ──

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // ── Render ──

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="glass-modal w-[680px] max-h-[80vh] flex flex-col rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
          <PhotoIcon className="w-5 h-5 text-[var(--muted-foreground)]" />
          <h3 className="text-base font-semibold flex-shrink-0">Select Image</h3>
          <div className="relative flex-1 max-w-xs">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-1.5 outline-none focus:border-[var(--primary)]"
              placeholder="Search files..."
            />
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* ── Source filter tabs ── */}
        <div className="flex items-center gap-1 px-4 pt-3">
          {sourceOptions.map((src) => {
            const label = src === 'all' ? 'All' : src === 'esp' ? 'ESP' : 'Loomi';
            return (
              <button
                key={src}
                onClick={() => setSourceFilter(src)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  sourceFilter === src
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Upload zone ── */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          className={`mx-4 mt-3 border-2 border-dashed rounded-lg p-3 text-center transition-all cursor-pointer ${
            dragOver
              ? 'border-[var(--primary)] bg-[var(--primary)]/5'
              : 'border-[var(--border)] hover:border-[var(--muted-foreground)]'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => handleUpload(e.target.files)}
            className="hidden"
          />
          {uploading ? (
            <span className="text-sm text-[var(--muted-foreground)]">
              <ArrowUpTrayIcon className="w-4 h-4 inline mr-1 animate-bounce" />
              Uploading...
            </span>
          ) : (
            <span className="text-sm text-[var(--muted-foreground)]">
              <ArrowUpTrayIcon className="w-4 h-4 inline mr-1" />
              Drop files here or click to browse
            </span>
          )}
        </div>

        {/* ── Breadcrumbs ── */}
        {canNavigateFolders && folderPath.length > 1 && (
          <div className="flex items-center gap-1 px-4 pt-3 text-xs flex-wrap">
            {folderPath.map((crumb, idx) => {
              const isLast = idx === folderPath.length - 1;
              return (
                <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
                  {idx > 0 && (
                    <ChevronRightIcon className="w-3 h-3 text-[var(--muted-foreground)]" />
                  )}
                  {isLast ? (
                    <span className="font-medium text-[var(--foreground)] flex items-center gap-1">
                      {idx === 0 ? <HomeIcon className="w-3 h-3" /> : <FolderIcon className="w-3 h-3" />}
                      {crumb.name}
                    </span>
                  ) : (
                    <button
                      onClick={() => navigateToBreadcrumb(idx)}
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
        )}

        {/* ── Media grid ── */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-[100px] bg-[var(--muted)] rounded-lg" />
                  <div className="h-2.5 bg-[var(--muted)] rounded w-3/4 mt-2" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 && filteredFolders.length === 0 ? (
            <div className="text-center py-12 text-[var(--muted-foreground)]">
              <PhotoIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {files.length === 0 && folders.length === 0
                  ? currentFolderId ? 'This folder is empty' : 'No media files yet'
                  : 'No matches'}
              </p>
              {files.length === 0 && folders.length === 0 && !currentFolderId && (
                <p className="text-xs mt-1 opacity-60">Upload an image to get started</p>
              )}
            </div>
          ) : (
            <>
              {/* Folder cards */}
              {filteredFolders.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
                  {filteredFolders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => navigateToFolder(folder)}
                      className="text-left rounded-lg p-3 border border-transparent hover:border-[var(--primary)] hover:ring-1 hover:ring-[var(--primary)]/30 transition-all group bg-[var(--muted)]/30"
                      title={folder.name}
                    >
                      <div className="flex items-center gap-2">
                        <FolderIcon className="w-5 h-5 text-[var(--primary)] flex-shrink-0" />
                        <span className="text-[11px] font-medium truncate group-hover:text-[var(--primary)] transition-colors">
                          {folder.name}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* File cards */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {filtered.map((f) => {
                  const isImage = f.type?.startsWith('image') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.url || '');
                  return (
                    <button
                      key={f.id}
                      onClick={() => onSelect(f.url)}
                      className="text-left rounded-lg overflow-hidden border border-transparent hover:border-[var(--primary)] hover:ring-1 hover:ring-[var(--primary)]/30 transition-all group"
                      title={f.name}
                    >
                      <div className="h-[100px] bg-[var(--muted)] overflow-hidden">
                        {isImage && f.url ? (
                          <img
                            src={f.thumbnailUrl || f.url}
                            alt={f.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <PhotoIcon className="w-6 h-6 text-[var(--muted-foreground)] opacity-30" />
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] truncate px-1.5 py-1 text-[var(--muted-foreground)]">
                        {f.name}
                      </p>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--muted-foreground)]">
            {loading ? 'Loading...' : (
              <>
                {filteredFolders.length > 0 && `${filteredFolders.length} folder${filteredFolders.length !== 1 ? 's' : ''}, `}
                {`${filtered.length} file${filtered.length !== 1 ? 's' : ''}`}
              </>
            )}
          </p>
          {nextCursor && !loading && (
            <button
              onClick={() => loadMedia(nextCursor)}
              disabled={loadingMore}
              className="text-xs font-medium text-[var(--primary)] hover:opacity-80 disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
