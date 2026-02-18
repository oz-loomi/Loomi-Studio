export type FolderAssignments = Record<string, string[]>;

export type EmailFolderEntry = {
  id?: string;
  name: string;
  accountKey?: string | null;
  emailIds: string[];
};

export type EmailFoldersPayload = {
  folders: EmailFolderEntry[];
};

function normalizeEmailIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim();
    if (!id) continue;
    deduped.add(id);
  }
  return [...deduped];
}

export function foldersArrayToMap(entries: EmailFolderEntry[]): FolderAssignments {
  const result: FolderAssignments = {};
  for (const entry of entries) {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    if (!name) continue;
    result[name] = normalizeEmailIds(entry.emailIds);
  }
  return result;
}

export function foldersMapToArray(assignments: FolderAssignments): EmailFolderEntry[] {
  return Object.entries(assignments)
    .map(([name, emailIds]) => ({
      name,
      emailIds: normalizeEmailIds(emailIds),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function parseEmailFoldersPayload(payload: unknown): FolderAssignments {
  if (!payload || typeof payload !== 'object') return {};
  const folders = (payload as { folders?: unknown }).folders;
  if (!Array.isArray(folders)) return {};
  return foldersArrayToMap(folders as EmailFolderEntry[]);
}
