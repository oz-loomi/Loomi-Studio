import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { parseTemplate } from '@/lib/template-parser';
import { serializeTemplate } from '@/lib/template-serializer';
import * as templateService from '@/lib/services/templates';

interface FindReplaceOperation {
  kind: 'findReplace';
  find: string;
  replace?: string;
  mode?: 'plain' | 'regex';
  flags?: string;
}

interface SetComponentPropOperation {
  kind: 'setComponentProp';
  componentType: string;
  propKey: string;
  value?: string;
  action?: 'set' | 'unset';
}

type BulkOperation = FindReplaceOperation | SetComponentPropOperation;

interface BulkRequestBody {
  dryRun?: boolean;
  designs?: string[];
  operation?: BulkOperation;
}

interface TemplateChangeResult {
  design: string;
  changeCount: number;
  summary: string;
}

interface TemplateErrorResult {
  design: string;
  error: string;
}

function countPlainOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let start = 0;
  while (true) {
    const idx = haystack.indexOf(needle, start);
    if (idx === -1) break;
    count += 1;
    start = idx + needle.length;
  }
  return count;
}

function createRegex(find: string, flags?: string): RegExp {
  const normalizedFlags = flags?.includes('g') ? flags : `${flags || ''}g`;
  return new RegExp(find, normalizedFlags);
}

function applyFindReplace(raw: string, operation: FindReplaceOperation): {
  changed: boolean;
  updatedRaw: string;
  changeCount: number;
  summary: string;
} {
  const replace = operation.replace ?? '';
  const mode = operation.mode || 'plain';

  if (!operation.find) {
    throw new Error('Find value is required');
  }

  if (mode === 'regex') {
    const regex = createRegex(operation.find, operation.flags);
    const matches = raw.match(regex);
    const changeCount = matches?.length || 0;
    if (changeCount === 0) {
      return { changed: false, updatedRaw: raw, changeCount: 0, summary: 'No matches' };
    }
    const updatedRaw = raw.replace(regex, replace);
    return {
      changed: updatedRaw !== raw,
      updatedRaw,
      changeCount,
      summary: `Replaced ${changeCount} regex match${changeCount === 1 ? '' : 'es'}`,
    };
  }

  const changeCount = countPlainOccurrences(raw, operation.find);
  if (changeCount === 0) {
    return { changed: false, updatedRaw: raw, changeCount: 0, summary: 'No matches' };
  }
  const updatedRaw = raw.split(operation.find).join(replace);
  return {
    changed: updatedRaw !== raw,
    updatedRaw,
    changeCount,
    summary: `Replaced ${changeCount} text match${changeCount === 1 ? '' : 'es'}`,
  };
}

function applySetComponentProp(raw: string, operation: SetComponentPropOperation): {
  changed: boolean;
  updatedRaw: string;
  changeCount: number;
  summary: string;
} {
  const parsed = parseTemplate(raw);
  const action = operation.action || 'set';
  const value = operation.value ?? '';

  if (!operation.componentType || !operation.propKey) {
    throw new Error('componentType and propKey are required');
  }

  let changeCount = 0;
  for (const comp of parsed.components) {
    if (comp.type !== operation.componentType) continue;

    if (action === 'unset') {
      if (operation.propKey in comp.props) {
        delete comp.props[operation.propKey];
        changeCount += 1;
      }
      continue;
    }

    if (comp.props[operation.propKey] !== value) {
      comp.props[operation.propKey] = value;
      changeCount += 1;
    }
  }

  if (changeCount === 0) {
    return { changed: false, updatedRaw: raw, changeCount: 0, summary: 'No matching component props found' };
  }

  const updatedRaw = serializeTemplate(parsed);
  return {
    changed: updatedRaw !== raw,
    updatedRaw,
    changeCount,
    summary:
      action === 'unset'
        ? `Unset ${operation.propKey} on ${changeCount} ${operation.componentType} component${changeCount === 1 ? '' : 's'}`
        : `Set ${operation.propKey} on ${changeCount} ${operation.componentType} component${changeCount === 1 ? '' : 's'}`,
  };
}

function applyOperation(raw: string, operation: BulkOperation) {
  if (operation.kind === 'findReplace') return applyFindReplace(raw, operation);
  return applySetComponentProp(raw, operation);
}

export async function POST(req: NextRequest) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  try {
    const body = (await req.json()) as BulkRequestBody;
    const operation = body.operation;
    if (!operation) {
      return NextResponse.json({ error: 'Missing operation' }, { status: 400 });
    }

    const dryRun = body.dryRun !== false;

    // Get all templates from DB
    const allTemplates = await templateService.getTemplates();
    const availableSlugs = allTemplates.map((t) => t.slug);

    const selectedSlugs = Array.isArray(body.designs) && body.designs.length > 0
      ? body.designs.filter((design) => availableSlugs.includes(design))
      : availableSlugs;

    const affectedTemplates: TemplateChangeResult[] = [];
    const errors: TemplateErrorResult[] = [];
    let totalChanges = 0;
    let appliedCount = 0;

    for (const slug of selectedSlugs) {
      try {
        const template = await templateService.getTemplate(slug);
        if (!template) continue;

        const raw = template.content;
        const result = applyOperation(raw, operation);
        if (!result.changed || result.changeCount === 0) continue;

        totalChanges += result.changeCount;
        affectedTemplates.push({
          design: slug,
          changeCount: result.changeCount,
          summary: result.summary,
        });

        if (!dryRun) {
          await templateService.updateTemplate(slug, { content: result.updatedRaw });
          appliedCount += 1;
        }
      } catch (err: any) {
        errors.push({
          design: slug,
          error: err?.message || 'Failed to process template',
        });
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      operation: operation.kind,
      totalTemplates: selectedSlugs.length,
      affectedCount: affectedTemplates.length,
      totalChanges,
      appliedCount,
      affectedTemplates,
      errors,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Bulk operation failed' },
      { status: 500 },
    );
  }
}
