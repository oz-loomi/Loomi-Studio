export type TemplateTagAssignments = Record<string, string[]>;

export type TemplateTagAssignmentEntry = {
  templateSlug: string;
  tags: string[];
};

export type TemplateTagsPayload = {
  tags: string[];
  assignments: TemplateTagAssignmentEntry[];
};

function normalizeTagList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const tag = entry.trim();
    if (!tag) continue;
    deduped.add(tag);
  }
  return [...deduped];
}

export function assignmentsArrayToMap(entries: TemplateTagAssignmentEntry[]): TemplateTagAssignments {
  const map: TemplateTagAssignments = {};
  for (const entry of entries) {
    const templateSlug = typeof entry?.templateSlug === 'string' ? entry.templateSlug.trim() : '';
    if (!templateSlug) continue;
    map[templateSlug] = normalizeTagList(entry.tags);
  }
  return map;
}

export function assignmentsMapToArray(assignments: TemplateTagAssignments): TemplateTagAssignmentEntry[] {
  return Object.entries(assignments)
    .map(([templateSlug, tags]) => ({
      templateSlug,
      tags: normalizeTagList(tags),
    }))
    .sort((a, b) => a.templateSlug.localeCompare(b.templateSlug));
}

export function parseTemplateTagsPayload(payload: unknown): {
  tags: string[];
  assignments: TemplateTagAssignments;
} {
  if (!payload || typeof payload !== 'object') {
    return { tags: [], assignments: {} };
  }
  const tags = normalizeTagList((payload as { tags?: unknown }).tags);
  const assignmentEntries = (payload as { assignments?: unknown }).assignments;
  return {
    tags,
    assignments: Array.isArray(assignmentEntries)
      ? assignmentsArrayToMap(assignmentEntries as TemplateTagAssignmentEntry[])
      : {},
  };
}
