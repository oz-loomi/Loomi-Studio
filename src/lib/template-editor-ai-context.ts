import { componentSchemas } from '@/lib/component-schemas';
import type { ParsedComponent, ParsedTemplate } from '@/lib/template-parser';

const MAX_TEXT_CONTENT_CHARS = 6000;
const MAX_LIST_ITEMS = 8;
const MAX_OUTLINE_ITEMS = 12;
const MAX_SNIPPET_CHARS = 220;

const TEXT_LIKE_PROP_KEY = /(?:title|headline|heading|subheading|subtitle|eyebrow|copy|body|content|text|message|description|label|cta|button|offer|incentive|disclaimer|note|preview|subject)/i;
const NUMERIC_VALUE = /^[0-9.]+(?:px|%|em|rem)?$/i;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const VARIABLE_ONLY = /^\s*\{\{[\s\S]*\}\}\s*$/;

export interface TemplateEditorSelectedComponentContext {
  index: number;
  type: string;
  label: string;
  props: Record<string, string>;
}

export interface CurrentEmailContext {
  source: 'preview' | 'components';
  subject: string | null;
  previewText: string | null;
  textContent: string | null;
  headings: string[];
  ctas: string[];
  componentOutline: string[];
  selectedSection: string | null;
}

interface BuildCurrentEmailContextParams {
  parsed: ParsedTemplate | null;
  previewHtml: string;
  rawTemplate?: string;
  subject?: string | null;
  previewText?: string | null;
  selectedComponent?: TemplateEditorSelectedComponentContext | null;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 3).trimEnd()}...`;
}

export function stripHtmlToText(html: string): string {
  if (!html) return '';
  if (typeof window === 'undefined') {
    return collapseWhitespace(html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' '));
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  return collapseWhitespace((doc.body.textContent || '').replace(/\u00a0/g, ' '));
}

function collectUnique(values: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const value of values) {
    const normalized = value ? collapseWhitespace(value) : '';
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    results.push(normalized);
    if (results.length >= limit) break;
  }

  return results;
}

function toTextSnippet(key: string, rawValue: string | undefined): string | null {
  if (!rawValue) return null;

  const text = truncate(stripHtmlToText(rawValue), MAX_SNIPPET_CHARS);
  if (!text) return null;
  if (NUMERIC_VALUE.test(text) || HEX_COLOR.test(text) || VARIABLE_ONLY.test(text)) return null;
  if (/^(?:https?:\/\/|mailto:|tel:)/i.test(text)) return null;
  if (!TEXT_LIKE_PROP_KEY.test(key) && text.split(' ').length < 2 && text.length < 12) return null;

  return text;
}

function summarizeComponent(component: ParsedComponent, index: number): string {
  const label = componentSchemas[component.type]?.label || component.type;
  const snippets = collectUnique(
    [
      ...Object.entries(component.props).map(([key, value]) => toTextSnippet(key, value)),
      toTextSnippet('content', component.content),
    ],
    3,
  );

  return snippets.length > 0
    ? `${index + 1}. ${label}: ${snippets.join(' | ')}`
    : `${index + 1}. ${label}`;
}

function summarizeSelectedComponent(
  selectedComponent?: TemplateEditorSelectedComponentContext | null,
): string | null {
  if (!selectedComponent) return null;

  const snippets = collectUnique(
    Object.entries(selectedComponent.props).map(([key, value]) => toTextSnippet(key, value)),
    3,
  );

  return snippets.length > 0
    ? `Section ${selectedComponent.index + 1} (${selectedComponent.label}): ${snippets.join(' | ')}`
    : `Section ${selectedComponent.index + 1} (${selectedComponent.label})`;
}

function queryTextList(root: ParentNode, selector: string, limit = MAX_LIST_ITEMS): string[] {
  return collectUnique(
    Array.from(root.querySelectorAll(selector)).map((node) =>
      truncate(collapseWhitespace((node.textContent || '').replace(/\u00a0/g, ' ')), MAX_SNIPPET_CHARS),
    ),
    limit,
  );
}

function extractPreviewSignals(previewHtml: string): Pick<CurrentEmailContext, 'textContent' | 'headings' | 'ctas'> {
  if (!previewHtml) {
    return { textContent: null, headings: [], ctas: [] };
  }

  const textContent = truncate(stripHtmlToText(previewHtml), MAX_TEXT_CONTENT_CHARS) || null;

  if (typeof window === 'undefined') {
    return { textContent, headings: [], ctas: [] };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(previewHtml, 'text/html');

  return {
    textContent,
    headings: queryTextList(doc, 'h1, h2, h3, h4, h5, h6'),
    ctas: queryTextList(doc, 'a, button, [role="button"]'),
  };
}

export function buildCurrentEmailContext({
  parsed,
  previewHtml,
  rawTemplate,
  subject,
  previewText,
  selectedComponent,
}: BuildCurrentEmailContextParams): CurrentEmailContext | null {
  const previewSignals = extractPreviewSignals(previewHtml);
  const rawTextContent = rawTemplate
    ? truncate(stripHtmlToText(rawTemplate), MAX_TEXT_CONTENT_CHARS) || null
    : null;
  const componentOutline = parsed?.components.slice(0, MAX_OUTLINE_ITEMS).map(summarizeComponent) || [];
  const fallbackText = componentOutline.length > 0
    ? truncate(componentOutline.join('\n'), MAX_TEXT_CONTENT_CHARS)
    : null;

  const currentEmail: CurrentEmailContext = {
    source: previewSignals.textContent ? 'preview' : 'components',
    subject: subject?.trim() || null,
    previewText: previewText?.trim() || null,
    textContent: previewSignals.textContent || rawTextContent || fallbackText,
    headings: previewSignals.headings,
    ctas: previewSignals.ctas,
    componentOutline,
    selectedSection: summarizeSelectedComponent(selectedComponent),
  };

  if (
    !currentEmail.subject &&
    !currentEmail.previewText &&
    !currentEmail.textContent &&
    currentEmail.headings.length === 0 &&
    currentEmail.ctas.length === 0 &&
    currentEmail.componentOutline.length === 0 &&
    !currentEmail.selectedSection
  ) {
    return null;
  }

  return currentEmail;
}
