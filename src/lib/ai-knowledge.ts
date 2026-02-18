import fs from 'fs';
import path from 'path';
import { componentSchemas } from './component-schemas';
import { prisma } from './prisma';
import { readEspVariables } from './esp/variables';

// ── Paths ──
const STUDIO_ROOT = process.cwd();
const KNOWLEDGE_FILE = path.join(STUDIO_ROOT, 'loomi-knowledge.md');

// ── Read files safely ──
function readFileOrEmpty(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

// ── Build dynamic data snapshot ──
async function buildDynamicData(): Promise<string> {
  const sections: string[] = [];

  // 1. Components — names, labels, and prop summaries
  const componentEntries = Object.values(componentSchemas);
  if (componentEntries.length > 0) {
    const lines = componentEntries.map((schema) => {
      const propKeys = schema.props
        .filter((p) => !p.repeatableGroup) // skip repeatable duplicates
        .map((p) => p.key);
      const repeatable = schema.repeatableGroups
        ? schema.repeatableGroups.map((g) => `${g.label} (up to ${g.maxItems})`).join(', ')
        : '';
      return [
        `- **${schema.label}** (\`${schema.name}\`) — ${schema.props.length} props`,
        `  Key props: ${propKeys.slice(0, 8).join(', ')}${propKeys.length > 8 ? ', ...' : ''}`,
        repeatable ? `  Repeatable: ${repeatable}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    });
    sections.push(`### Available Components (${componentEntries.length})\n\n${lines.join('\n\n')}`);
  }

  // 2. ESP Variables
  const espVars = readEspVariables();
  if (Object.keys(espVars).length > 0) {
    const lines = Object.entries(espVars).map(([category, vars]) => {
      const varList = vars.map((v) => `\`${v.variable}\` (${v.label})`).join(', ');
      return `- **${category}:** ${varList}`;
    });
    sections.push(`### Template Variables (ESP)\n\n${lines.join('\n')}`);
  }

  // 3. Template tags from DB
  try {
    const tags = await prisma.templateTag.findMany({ orderBy: { name: 'asc' } });
    if (tags.length > 0) {
      sections.push(`### Template Style Tags\n\nAvailable styles: ${tags.map((t) => t.name).join(', ')}`);
    }
  } catch {
    // DB not available, skip
  }

  // 4. Template categories from DB
  try {
    const templates = await prisma.template.findMany({
      where: { category: { not: null } },
      select: { slug: true, category: true },
    });
    const catMap: Record<string, string[]> = {};
    for (const t of templates) {
      if (!t.category) continue;
      if (!catMap[t.category]) catMap[t.category] = [];
      catMap[t.category].push(t.slug);
    }
    if (Object.keys(catMap).length > 0) {
      const lines = Object.entries(catMap).map(
        ([cat, designs]) => `- **${cat}:** ${designs.join(', ')}`,
      );
      sections.push(`### Template Design Categories\n\n${lines.join('\n')}`);
    }
  } catch {
    // DB not available, skip
  }

  if (sections.length === 0) return '';

  return `\n\n---\n\n## DYNAMIC DATA (auto-generated from current platform state)\n\n${sections.join('\n\n')}`;
}

// ── Build the full knowledge context ──
export async function buildKnowledgeContext(): Promise<string> {
  const knowledgeBase = readFileOrEmpty(KNOWLEDGE_FILE);
  const dynamicData = await buildDynamicData();

  if (!knowledgeBase && !dynamicData) {
    return 'You are an AI assistant for Loomi Studio, an email template management platform by Oz Marketing.';
  }

  return `${knowledgeBase}${dynamicData}`;
}

// ── System prompt for the global chat assistant ──
export async function getChatSystemPrompt(): Promise<string> {
  const knowledge = await buildKnowledgeContext();

  return [
    'You are Loomi, a friendly and knowledgeable AI assistant for Loomi Studio.',
    '',
    'KNOWLEDGE BASE:',
    knowledge,
    '',
    'BEHAVIOR RULES:',
    '- Be concise, helpful, and conversational.',
    '- Use short paragraphs.',
    '- If you don\'t know something specific about their data, say so and suggest where to look.',
    '- Never make up template names, account details, or component names that aren\'t in the knowledge base.',
    '- Use the dynamic data section for accurate, up-to-date information about components, variables, and templates.',
    '',
    'CONTEXT:',
    'You will receive context about the user\'s current page, selected account, role, and name. Use this to give relevant, personalized answers.',
    '',
    'RESPONSE FORMAT:',
    'Return strict JSON: {"reply":"string","suggestions":["string"]}',
    '- reply: Your answer in plain text (no markdown fences, keep concise).',
    '- suggestions: 0-3 short follow-up questions the user might want to ask next.',
    '- Do not include markdown code fences in your output.',
  ].join('\n');
}

// ── System prompt for the template editor assistant ──
export async function getAssistantSystemPrompt(): Promise<string> {
  const knowledge = await buildKnowledgeContext();

  return [
    'You are an email production assistant for the Loomi Studio template editor.',
    'Help with subject lines, CTA text, body copy rewrites, and component prop tweaks.',
    '',
    'KNOWLEDGE BASE:',
    knowledge,
    '',
    'BEHAVIOR RULES:',
    '- Keep reply concise and actionable.',
    '- suggestions should be short list items users can copy directly.',
    '- componentEdits only when the user asks for prop-level changes; otherwise use empty array.',
    '- Use the knowledge base to understand available components, their props, and template variables.',
    '- When suggesting prop edits, use real prop keys from the component schemas in the knowledge base.',
    '',
    'RESPONSE FORMAT:',
    'Return strict JSON with this shape:',
    '{"reply":"string","suggestions":["string"],"componentEdits":[{"key":"prop-key","value":"new value","reason":"optional"}]}',
    '- Do not include markdown fences.',
  ].join('\n');
}
