import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'src', 'data', 'esp-template-folders.json');

export interface EspTemplateFolder {
  id: string;
  accountKey: string;
  name: string;
  parentId: string | null;
  /** GHL remote folder ID (set when synced from ESP) */
  remoteId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EspTemplateFolderStore {
  folders: EspTemplateFolder[];
  assignments: Record<string, Record<string, string>>;
}

const EMPTY_STORE: EspTemplateFolderStore = {
  folders: [],
  assignments: {},
};

function ensureDir(): void {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function parseStore(raw: unknown): EspTemplateFolderStore {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STORE };
  const source = raw as Partial<EspTemplateFolderStore>;
  const folders = Array.isArray(source.folders)
    ? source.folders.filter((folder): folder is EspTemplateFolder => (
      !!folder
      && typeof folder.id === 'string'
      && typeof folder.accountKey === 'string'
      && typeof folder.name === 'string'
      && (typeof folder.parentId === 'string' || folder.parentId === null)
      && typeof folder.createdAt === 'string'
      && typeof folder.updatedAt === 'string'
    ))
    : [];
  const assignments: Record<string, Record<string, string>> = {};
  if (source.assignments && typeof source.assignments === 'object') {
    for (const [accountKey, value] of Object.entries(source.assignments)) {
      if (!value || typeof value !== 'object') continue;
      const accountAssignments: Record<string, string> = {};
      for (const [templateId, folderId] of Object.entries(value)) {
        if (typeof folderId === 'string') {
          accountAssignments[templateId] = folderId;
        }
      }
      assignments[accountKey] = accountAssignments;
    }
  }
  return { folders, assignments };
}

export function readEspTemplateFolderStore(): EspTemplateFolderStore {
  ensureDir();
  if (!fs.existsSync(DATA_FILE)) return { ...EMPTY_STORE };
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    return parseStore(parsed);
  } catch {
    return { ...EMPTY_STORE };
  }
}

export function writeEspTemplateFolderStore(store: EspTemplateFolderStore): void {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

export function getAccountFolders(store: EspTemplateFolderStore, accountKey: string): EspTemplateFolder[] {
  return store.folders
    .filter((folder) => folder.accountKey === accountKey)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getAccountAssignments(
  store: EspTemplateFolderStore,
  accountKey: string,
): Record<string, string> {
  return { ...(store.assignments[accountKey] || {}) };
}

export function createAccountFolder(
  store: EspTemplateFolderStore,
  accountKey: string,
  name: string,
  parentId: string | null,
  remoteId?: string | null,
): EspTemplateFolder {
  const now = new Date().toISOString();
  const folder: EspTemplateFolder = {
    id: randomUUID().replace(/-/g, ''),
    accountKey,
    name,
    parentId,
    ...(remoteId ? { remoteId } : {}),
    createdAt: now,
    updatedAt: now,
  };
  store.folders.push(folder);
  return folder;
}

/** Find a local folder by its GHL remote ID. */
export function findFolderByRemoteId(
  store: EspTemplateFolderStore,
  accountKey: string,
  remoteId: string,
): EspTemplateFolder | null {
  return store.folders.find(
    (f) => f.accountKey === accountKey && f.remoteId === remoteId,
  ) ?? null;
}

export function updateAccountFolder(
  store: EspTemplateFolderStore,
  accountKey: string,
  folderId: string,
  updates: { name?: string; parentId?: string | null },
): EspTemplateFolder | null {
  const index = store.folders.findIndex((folder) => folder.id === folderId && folder.accountKey === accountKey);
  if (index === -1) return null;
  const existing = store.folders[index];
  const next: EspTemplateFolder = {
    ...existing,
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.parentId !== undefined ? { parentId: updates.parentId } : {}),
    updatedAt: new Date().toISOString(),
  };
  store.folders[index] = next;
  return next;
}

function collectDescendantIds(store: EspTemplateFolderStore, accountKey: string, folderId: string): Set<string> {
  const ids = new Set<string>([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of store.folders) {
      if (folder.accountKey !== accountKey) continue;
      if (!folder.parentId) continue;
      if (ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function deleteAccountFolder(
  store: EspTemplateFolderStore,
  accountKey: string,
  folderId: string,
): { deletedIds: string[] } {
  const deletedIds = Array.from(collectDescendantIds(store, accountKey, folderId));
  if (deletedIds.length === 0) return { deletedIds: [] };

  const deletedSet = new Set(deletedIds);
  store.folders = store.folders.filter((folder) => {
    if (folder.accountKey !== accountKey) return true;
    return !deletedSet.has(folder.id);
  });

  const accountAssignments = store.assignments[accountKey] || {};
  for (const [templateId, assignedFolderId] of Object.entries(accountAssignments)) {
    if (deletedSet.has(assignedFolderId)) {
      delete accountAssignments[templateId];
    }
  }
  store.assignments[accountKey] = accountAssignments;

  return { deletedIds };
}

export function assignTemplatesToFolder(
  store: EspTemplateFolderStore,
  accountKey: string,
  templateIds: string[],
  folderId: string | null,
): Record<string, string> {
  const nextAssignments = { ...(store.assignments[accountKey] || {}) };
  for (const templateId of templateIds) {
    if (!templateId) continue;
    if (!folderId) {
      delete nextAssignments[templateId];
    } else {
      nextAssignments[templateId] = folderId;
    }
  }
  store.assignments[accountKey] = nextAssignments;
  return nextAssignments;
}

export function folderExistsForAccount(
  store: EspTemplateFolderStore,
  accountKey: string,
  folderId: string,
): boolean {
  return store.folders.some((folder) => folder.accountKey === accountKey && folder.id === folderId);
}
