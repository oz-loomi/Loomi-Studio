'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  XMarkIcon,
  PlusIcon,
  Squares2X2Icon,
  ListBulletIcon,
  EllipsisVerticalIcon,
  TrashIcon,
  TagIcon,
  FunnelIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';
import { toast } from '@/lib/toast';
import { AdminOnly } from '@/components/route-guard';
import { SectionsIcon } from '@/components/icon-map';

interface ComponentEntry {
  name: string;
  label: string;
  propCount: number;
}

interface TagData {
  tags: string[];
  assignments: Record<string, string[]>;
}

const VIEW_KEY = 'loomi-component-view';

function loadView(): 'card' | 'list' {
  if (typeof window === 'undefined') return 'card';
  return (localStorage.getItem(VIEW_KEY) as 'card' | 'list') || 'card';
}
function saveView(view: 'card' | 'list') {
  localStorage.setItem(VIEW_KEY, view);
}

export default function ComponentsPage() {
  const router = useRouter();
  const [components, setComponents] = useState<ComponentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [tagData, setTagData] = useState<TagData>({ tags: [], assignments: {} });
  const [activeTag, setActiveTag] = useState<string>('all');
  // Three-dot menu
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  // Create section
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  // Manage tags modal
  const [showManageTags, setShowManageTags] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setViewMode(loadView()); }, []);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadData = async () => {
    try {
      const [compRes, tagRes] = await Promise.all([
        fetch('/api/components'),
        fetch('/api/component-tags'),
      ]);
      setComponents(await compRes.json());
      setTagData(await tagRes.json());
    } catch (err) {
      console.error('Failed to load:', err);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const saveTagData = async (newData: TagData) => {
    setTagData(newData);
    await fetch('/api/component-tags', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newData),
    });
  };

  const componentMap = useMemo(() => {
    const map: Record<string, ComponentEntry> = {};
    for (const c of components) map[c.name] = c;
    return map;
  }, [components]);

  const filteredComponents = useMemo(() => {
    if (activeTag === 'all') return components;
    return components.filter(c => (tagData.assignments[c.name] || []).includes(activeTag));
  }, [components, tagData, activeTag]);

  const toggleView = (mode: 'card' | 'list') => { setViewMode(mode); saveView(mode); };

  const handleCreateComponent = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create section'); setCreating(false); return; }
      router.push(`/components/${data.name}`);
    } catch {
      toast.error('Failed to create section');
      setCreating(false);
    }
  };

  const handleDeleteComponent = async (name: string) => {
    try {
      const res = await fetch(`/api/components?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed to delete'); return; }
      // Remove from tag assignments
      const newAssignments = { ...tagData.assignments };
      delete newAssignments[name];
      await saveTagData({ ...tagData, assignments: newAssignments });
      setComponents(prev => prev.filter(c => c.name !== name));
    } catch {
      toast.error('Failed to delete section');
    }
  };

  // ── Three-dot menu ──
  const renderMenu = (name: string) => {
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
          <div className="absolute right-0 top-full mt-1 z-50 w-44 glass-dropdown" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setOpenMenu(null); if (confirm(`Delete "${componentMap[name]?.label || name}"? This will remove the .html file permanently.`)) handleDeleteComponent(name); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
              <TrashIcon className="w-4 h-4" /> Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderSections = () => {
    if (filteredComponents.length === 0) {
      return (
        <div className="text-center py-16 border border-dashed border-[var(--border)] rounded-xl">
          <p className="text-[var(--muted-foreground)]">
            {activeTag === 'all' ? 'No sections found.' : 'No sections match this tag.'}
          </p>
          {activeTag !== 'all' && (
            <button onClick={() => setActiveTag('all')} className="text-[var(--primary)] text-sm mt-2 hover:underline">
              Browse all sections
            </button>
          )}
        </div>
      );
    }

    if (viewMode === 'card') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredComponents.map(comp => {
            const sectionTags = tagData.assignments[comp.name] || [];
            return (
              <div
                key={comp.name}
                className="glass-card rounded-xl group"
              >
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-lg bg-[var(--muted)] flex items-center justify-center text-[var(--muted-foreground)] group-hover:text-[var(--primary)] transition-colors cursor-pointer"
                      onClick={() => router.push(`/components/${comp.name}`)}
                    >
                      <SectionsIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/components/${comp.name}`)}>
                      <p className="text-sm font-semibold">{comp.label}</p>
                      <p className="text-[10px] text-[var(--muted-foreground)] font-mono">{comp.name}.html</p>
                    </div>
                    {renderMenu(comp.name)}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap cursor-pointer" onClick={() => router.push(`/components/${comp.name}`)}>
                    <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
                      {comp.propCount} props
                    </span>
                    {sectionTags.map(tag => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        {filteredComponents.map(comp => {
          const sectionTags = tagData.assignments[comp.name] || [];
          return (
            <div
              key={comp.name}
              className="flex items-center gap-4 p-3 glass-card rounded-xl group"
            >
              <div
                className="w-8 h-8 rounded-lg bg-[var(--muted)] flex items-center justify-center text-[var(--muted-foreground)] group-hover:text-[var(--primary)] transition-colors flex-shrink-0 cursor-pointer"
                onClick={() => router.push(`/components/${comp.name}`)}
              >
                <SectionsIcon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/components/${comp.name}`)}>
                <h3 className="font-semibold text-sm">{comp.label}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-[var(--muted-foreground)]">{comp.name}.html &middot; {comp.propCount} props</span>
                  {sectionTags.map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0 rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              {renderMenu(comp.name)}
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) return <div className="text-[var(--muted-foreground)]">Loading sections...</div>;

  return (
    <AdminOnly><div>
      {/* Header */}
      <div className="page-sticky-header flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <SectionsIcon className="w-7 h-7 text-[var(--primary)]" />
          <div>
            <h2 className="text-2xl font-bold">Sections</h2>
            <p className="text-[var(--muted-foreground)] text-sm mt-0.5">{components.length} reusable email sections</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[var(--muted)] rounded-lg p-0.5">
            <button onClick={() => toggleView('card')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'card' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`} title="Card view">
              <Squares2X2Icon className="w-4 h-4" />
            </button>
            <button onClick={() => toggleView('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`} title="List view">
              <ListBulletIcon className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => setShowManageTags(true)} className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] text-[var(--foreground)] rounded-lg text-sm font-medium hover:bg-[var(--muted)] transition-colors">
            <TagIcon className="w-4 h-4" /> Manage Tags
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
            <PlusIcon className="w-4 h-4" /> New Section
          </button>
        </div>
      </div>

      {/* Tag filter bar */}
      <div className="flex items-center gap-1.5 mb-6 flex-wrap">
        <FunnelIcon className="w-4 h-4 text-[var(--muted-foreground)]" />
        <button
          onClick={() => setActiveTag('all')}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
            activeTag === 'all'
              ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5'
              : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]'
          }`}
        >
          All
        </button>
        {tagData.tags.map(tag => (
          <button
            key={tag}
            onClick={() => setActiveTag(tag)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              activeTag === tag
                ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5'
                : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Section grid/list */}
      {renderSections()}

      {/* Create section modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in" onClick={() => { setShowCreate(false); setNewName(''); }}>
          <div className="glass-modal w-[420px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold">New Section</h3>
              <button onClick={() => { setShowCreate(false); setNewName(''); }} className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"><XMarkIcon className="w-4 h-4" /></button>
            </div>
            <div className="p-5">
              <label className="text-xs font-medium text-[var(--muted-foreground)] block mb-1.5">Section Name</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateComponent()} className="w-full text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]" placeholder="e.g. promo-banner, social-links..." autoFocus />
              <p className="text-[10px] text-[var(--muted-foreground)] mt-1.5">Saved as a kebab-case .html file in core sections.</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30">
              <button onClick={() => { setShowCreate(false); setNewName(''); }} className="px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors">Cancel</button>
              <button onClick={handleCreateComponent} disabled={!newName.trim() || creating} className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">{creating ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Tags Modal */}
      {showManageTags && (
        <ManageTagsModal
          tagData={tagData}
          components={components}
          onSave={(newData) => { saveTagData(newData); setShowManageTags(false); }}
          onClose={() => setShowManageTags(false)}
        />
      )}
    </div></AdminOnly>
  );
}

// ── Manage Tags Modal ──
function ManageTagsModal({
  tagData,
  components,
  onSave,
  onClose,
}: {
  tagData: TagData;
  components: ComponentEntry[];
  onSave: (data: TagData) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<TagData>(JSON.parse(JSON.stringify(tagData)));
  const [newTagName, setNewTagName] = useState('');
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editTagValue, setEditTagValue] = useState('');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpenDropdown(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addTag = () => {
    const name = newTagName.trim();
    if (!name) return;
    if (local.tags.some(t => t.toLowerCase() === name.toLowerCase())) return;
    setLocal({ ...local, tags: [...local.tags, name] });
    setNewTagName('');
  };

  const renameTag = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) { setEditingTag(null); return; }
    if (local.tags.some(t => t !== oldName && t.toLowerCase() === trimmed.toLowerCase())) { setEditingTag(null); return; }
    const newTags = local.tags.map(t => t === oldName ? trimmed : t);
    const newAssignments: Record<string, string[]> = {};
    for (const [key, tags] of Object.entries(local.assignments)) {
      newAssignments[key] = tags.map(t => t === oldName ? trimmed : t);
    }
    setLocal({ tags: newTags, assignments: newAssignments });
    setEditingTag(null);
  };

  const deleteTag = (tagName: string) => {
    const count = Object.values(local.assignments).filter(tags => tags.includes(tagName)).length;
    if (count > 0 && !confirm(`Remove "${tagName}" tag from ${count} section${count > 1 ? 's' : ''}?`)) return;
    const newTags = local.tags.filter(t => t !== tagName);
    const newAssignments: Record<string, string[]> = {};
    for (const [key, tags] of Object.entries(local.assignments)) {
      const filtered = tags.filter(t => t !== tagName);
      if (filtered.length > 0) newAssignments[key] = filtered;
    }
    setLocal({ tags: newTags, assignments: newAssignments });
  };

  const assignTag = (sectionName: string, tagName: string) => {
    const current = local.assignments[sectionName] || [];
    if (current.includes(tagName)) return;
    setLocal({
      ...local,
      assignments: { ...local.assignments, [sectionName]: [...current, tagName] },
    });
    setOpenDropdown(null);
  };

  const unassignTag = (sectionName: string, tagName: string) => {
    const current = local.assignments[sectionName] || [];
    const filtered = current.filter(t => t !== tagName);
    const newAssignments = { ...local.assignments };
    if (filtered.length > 0) {
      newAssignments[sectionName] = filtered;
    } else {
      delete newAssignments[sectionName];
    }
    setLocal({ ...local, assignments: newAssignments });
  };

  const getTagCount = (tagName: string) => {
    return Object.values(local.assignments).filter(tags => tags.includes(tagName)).length;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in" onClick={onClose}>
      <div className="glass-modal w-[560px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
          <h3 className="text-sm font-semibold">Manage Tags</h3>
          <button onClick={onClose} className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Section A: Tags */}
          <div>
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Tags</h4>
            <div className="space-y-1.5">
              {local.tags.map(tag => (
                <div key={tag} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]">
                  {editingTag === tag ? (
                    <input
                      type="text"
                      value={editTagValue}
                      onChange={(e) => setEditTagValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') renameTag(tag, editTagValue); if (e.key === 'Escape') setEditingTag(null); }}
                      onBlur={() => renameTag(tag, editTagValue)}
                      className="flex-1 text-sm bg-transparent border-none outline-none text-[var(--foreground)]"
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1 text-sm font-medium">{tag}</span>
                  )}
                  <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">{getTagCount(tag)}</span>
                  <button
                    onClick={() => { setEditingTag(tag); setEditTagValue(tag); }}
                    className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                    title="Rename"
                  >
                    <PencilIcon className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => deleteTag(tag)}
                    className="p-1 rounded text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete tag"
                  >
                    <XMarkIcon className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
                className="flex-1 text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[var(--foreground)]"
                placeholder="New tag name..."
              />
              <button onClick={addTag} disabled={!newTagName.trim()} className="px-3 py-1.5 bg-[var(--primary)] text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50">
                Add
              </button>
            </div>
          </div>

          {/* Section B: Section Assignments */}
          <div>
            <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Section Assignments</h4>
            <div className="space-y-2">
              {components.map(comp => {
                const assigned = local.assignments[comp.name] || [];
                const available = local.tags.filter(t => !assigned.includes(t));
                const isDropdownOpen = openDropdown === comp.name;

                return (
                  <div key={comp.name} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)]">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{comp.label}</p>
                    </div>
                    <div className="flex-1 flex items-center gap-1.5 flex-wrap justify-end">
                      {assigned.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
                          {tag}
                          <button onClick={() => unassignTag(comp.name, tag)} className="hover:text-red-400 transition-colors">
                            <XMarkIcon className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      {assigned.length === 0 && (
                        <span className="text-[10px] text-[var(--muted-foreground)] italic">untagged</span>
                      )}
                      {available.length > 0 && (
                        <div className="relative" ref={isDropdownOpen ? dropdownRef : undefined}>
                          <button
                            onClick={() => setOpenDropdown(isDropdownOpen ? null : comp.name)}
                            className="p-0.5 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--muted)] transition-colors"
                            title="Add tag"
                          >
                            <PlusIcon className="w-3.5 h-3.5" />
                          </button>
                          {isDropdownOpen && (
                            <div className="absolute right-0 top-full mt-1 z-50 w-36 glass-dropdown">
                              {available.map(tag => (
                                <button
                                  key={tag}
                                  onClick={() => assignTag(comp.name, tag)}
                                  className="w-full text-left px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                                >
                                  {tag}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors">
            Cancel
          </button>
          <button onClick={() => onSave(local)} className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
