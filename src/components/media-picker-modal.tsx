'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  PhotoIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';

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

export interface MediaPickerModalProps {
  accountKey: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}

// ── Component ──

export function MediaPickerModal({ accountKey, onSelect, onClose }: MediaPickerModalProps) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch media ──

  const loadMedia = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({ accountKey, limit: '50' });
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/esp/media?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, string>)?.error || `Error ${res.status}`);
      }
      const data = await res.json();
      const newFiles: MediaFile[] = data.files || [];
      setFiles((prev) => (cursor ? [...prev, ...newFiles] : newFiles));
      setNextCursor(data.nextCursor || undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load media');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [accountKey]);

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
        formData.append('accountKey', accountKey);
        const res = await fetch('/api/esp/media', { method: 'POST', body: formData });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as Record<string, string>)?.error || `Upload failed (${res.status})`);
        }
        const data = await res.json();
        if (data.file) uploaded.push(data.file as MediaFile);
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
  }, [accountKey]);

  // ── Drag & drop ──

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  }, [handleUpload]);

  // ── Search ──

  const filtered = useMemo(() => {
    if (!search.trim()) return files;
    const q = search.toLowerCase();
    return files.filter((f) => f.name.toLowerCase().includes(q));
  }, [files, search]);

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
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-[var(--muted-foreground)]">
              <PhotoIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{files.length === 0 ? 'No media files yet' : 'No matches'}</p>
              {files.length === 0 && (
                <p className="text-xs mt-1 opacity-60">Upload an image to get started</p>
              )}
            </div>
          ) : (
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
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--muted-foreground)]">
            {loading ? 'Loading...' : `${filtered.length} file${filtered.length !== 1 ? 's' : ''}`}
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
