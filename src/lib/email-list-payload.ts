export type EmailStatus = 'draft' | 'active' | 'archived' | string;

export type EmailListItem = {
  id: string;
  name: string;
  accountKey: string;
  status: EmailStatus;
  createdAt: string;
  updatedAt: string;
  templateId: string;
  templateSlug: string;
  templateTitle: string;
};

type UnknownRecord = Record<string, unknown>;

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toTemplateLabel(slug: string): string {
  if (!slug) return 'Unknown Template';
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeEmailRow(value: unknown): EmailListItem | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as UnknownRecord;
  const id = readString(row.id);
  if (!id) return null;

  const template = (row.template && typeof row.template === 'object')
    ? (row.template as UnknownRecord)
    : {};
  const account = (row.account && typeof row.account === 'object')
    ? (row.account as UnknownRecord)
    : {};

  const templateSlug = readString(template.slug);
  const templateTitle = readString(template.title) || toTemplateLabel(templateSlug);

  return {
    id,
    name: readString(row.name) || 'Untitled Email',
    accountKey: readString(row.accountKey) || readString(account.key),
    status: readString(row.status) || 'draft',
    createdAt: readString(row.createdAt),
    updatedAt: readString(row.updatedAt),
    templateId: readString(row.templateId) || readString(template.id),
    templateSlug,
    templateTitle,
  };
}

export function parseEmailListPayload(payload: unknown): EmailListItem[] {
  if (!Array.isArray(payload)) return [];
  const rows: EmailListItem[] = [];
  for (const entry of payload) {
    const normalized = normalizeEmailRow(entry);
    if (!normalized) continue;
    rows.push(normalized);
  }
  return rows;
}
