import {
  SparklesIcon,
  WrenchScrewdriverIcon,
  BugAntIcon,
} from '@heroicons/react/24/outline';

// ── Types ──

export interface ChangelogEntry {
  id: string;
  title: string;
  content: string;
  type: string; // feature | improvement | fix
  publishedAt: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EntryType = 'feature' | 'improvement' | 'fix';

export const ENTRY_TYPES: EntryType[] = ['feature', 'improvement', 'fix'];

export const TYPE_META: Record<
  EntryType,
  { label: string; color: string; bg: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  feature: { label: 'Feature', color: '#10b981', bg: '#10b98120', Icon: SparklesIcon },
  improvement: { label: 'Improvement', color: '#3b82f6', bg: '#3b82f620', Icon: WrenchScrewdriverIcon },
  fix: { label: 'Fix', color: '#f59e0b', bg: '#f59e0b20', Icon: BugAntIcon },
};

// ── Helpers ──

export function formatChangelogDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}
