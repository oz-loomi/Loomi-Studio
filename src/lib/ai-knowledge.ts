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

  // 1. Components — names, labels, key content props, and defaults
  const componentEntries = Object.values(componentSchemas);
  if (componentEntries.length > 0) {
    const lines = componentEntries.map((schema) => {
      // Split props into essential (content/text/buttons) vs design (layout/border/tracking)
      const designGroups = new Set(['border', 'tracking']);
      const essential = schema.props
        .filter((p) => !p.repeatableGroup && !designGroups.has(p.group || ''))
        .map((p) => {
          const parts = [`\`${p.key}\``];
          if (p.type !== 'text' && p.type !== 'textarea') parts.push(`(${p.type})`);
          if (p.default) parts.push(`= "${p.default}"`);
          if (p.required) parts.push('[required]');
          return parts.join(' ');
        });
      const repeatable = schema.repeatableGroups
        ? schema.repeatableGroups.map((g) => `${g.label} (up to ${g.maxItems})`).join(', ')
        : '';
      return [
        `- **${schema.label}** (\`${schema.name}\`) — ${schema.props.length} total props`,
        `  Essential props: ${essential.slice(0, 12).join(', ')}${essential.length > 12 ? ', ...' : ''}`,
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

// ── Build account context for AI prompts ──
export interface AccountContextInput {
  name?: string | null;
  branding?: {
    colors?: Record<string, string | undefined>;
    fonts?: Record<string, string | undefined>;
  } | null;
  logos?: Array<{ name?: string; url?: string }> | null;
  customValues?: Record<string, string> | null;
  identity?: {
    city?: string | null;
    state?: string | null;
    phone?: string | null;
    address?: string | null;
    website?: string | null;
  } | null;
}

export function buildAccountContext(account: AccountContextInput): string {
  const lines: string[] = [];

  if (account.name) {
    lines.push(`Account: ${account.name}`);
  }

  if (account.identity) {
    const { city, state, phone, address, website } = account.identity;
    const location = [city, state].filter(Boolean).join(', ');
    if (location) lines.push(`Location: ${location}`);
    if (address) lines.push(`Address: ${address}`);
    if (phone) lines.push(`Phone: ${phone}`);
    if (website) lines.push(`Website: ${website}`);
  }

  if (account.branding?.colors) {
    const colorEntries = Object.entries(account.branding.colors)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`);
    if (colorEntries.length > 0) {
      lines.push(`Brand Colors: ${colorEntries.join(', ')}`);
    }
  }

  if (account.branding?.fonts) {
    const fontEntries = Object.entries(account.branding.fonts)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`);
    if (fontEntries.length > 0) {
      lines.push(`Brand Fonts: ${fontEntries.join(', ')}`);
    }
  }

  if (account.logos && account.logos.length > 0) {
    const logoList = account.logos
      .filter((l) => l.url)
      .map((l) => l.name ? `${l.name}: ${l.url}` : l.url)
      .join(', ');
    if (logoList) lines.push(`Logos: ${logoList}`);
  }

  if (account.customValues) {
    const cvEntries = Object.entries(account.customValues)
      .filter(([, v]) => v)
      .slice(0, 15) // Limit to avoid token bloat
      .map(([k, v]) => `${k} = ${v}`);
    if (cvEntries.length > 0) {
      lines.push(`Custom Values: ${cvEntries.join(', ')}`);
    }
  }

  return lines.join('\n');
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
    'CRITICAL: Return ONLY valid JSON. No markdown fences, no text before or after the JSON.',
    '{"reply":"string","suggestions":["string"]}',
    '- reply: Your answer in plain text (no markdown fences, keep concise).',
    '- suggestions: 0-3 short follow-up questions the user might want to ask next.',
  ].join('\n');
}

// ── System prompt for the template editor assistant ──
export async function getAssistantSystemPrompt(accountContext?: string): Promise<string> {
  const knowledge = await buildKnowledgeContext();

  const sections = [
    'You are Loomi, an expert email production assistant for the Loomi Studio template editor.',
    'You help users build complete emails, edit component props, write subject lines, improve copy, and answer questions about the template system.',
    '',
    'KNOWLEDGE BASE:',
    knowledge,
  ];

  if (accountContext) {
    sections.push('', 'CURRENT ACCOUNT CONTEXT:', accountContext);
  }

  sections.push(
    '',
    'CAPABILITIES:',
    '1. **Answer questions** about the template editor, components, variables, and email best practices.',
    '2. **Edit component props** when the user asks to change a specific property of the currently selected component.',
    '3. **Build complete emails** when the user requests a full email. Generate the complete component array with props set according to best practices, the account\'s branding, and the user\'s requirements.',
    '4. **Ask clarifying questions** when the user\'s request is too vague to generate a good email (unclear purpose, missing key details).',
    '',
    'BEHAVIOR RULES:',
    '- Keep reply concise and actionable.',
    '- When suggesting prop edits, use real prop keys from the component schemas in the knowledge base.',
    '- When building emails, follow the component ordering conventions and email best practices from the knowledge base.',
    '- Apply account branding (colors, fonts) when available. Use brand primary color for main CTA buttons, etc.',
    '- For ALL image props, use the placeholder URL: https://loomistorage.sfo3.digitaloceanspaces.com/media/_admin/69fa3adf4ae444edaadd1d0d7fee4b87/image placeholder.png',
    '- For logos, always use {{custom_values.logo_url}}.',
    '- Use template variables ({{contact.first_name}}, {{location.name}}, etc.) for personalization.',
    '- Only include props that differ from schema defaults. The system auto-fills defaults for omitted props.',
    '- If unsure about the email purpose, audience, or content, ask a clarifying question BEFORE generating.',
    '- When generating for "code" mode, produce valid Maizzle HTML with <x-base> and <x-core.*> tags.',
    '',
    'RESPONSE FORMAT:',
    'CRITICAL: Return ONLY valid JSON. No markdown fences, no text before or after the JSON object.',
    'The response MUST be parseable by JSON.parse().',
    '',
    '{',
    '  "reply": "Your conversational response explaining what you did or are asking",',
    '  "suggestions": ["0-4 short follow-up suggestions or questions"],',
    '  "componentEdits": [{"key": "prop-key", "value": "new value", "reason": "optional"}],',
    '  "templateBuild": null or {',
    '    "mode": "visual" or "code",',
    '    "components": [{"type": "component-name", "props": {"key": "value"}}],',
    '    "html": "raw Maizzle HTML (code mode only)",',
    '    "frontmatter": {"subject": "...", "previewText": "..."},',
    '    "baseProps": {"body-bg": "#ffffff", "body-width": "600px", "font-family": "Arial, sans-serif"}',
    '  },',
    '  "clarification": null or "Your question to the user before generating"',
    '}',
    '',
    'RULES FOR CHOOSING RESPONSE FIELDS:',
    '- For questions/help: Set reply + suggestions. Leave componentEdits=[], templateBuild=null, clarification=null.',
    '- For prop edits on selected component: Set reply + componentEdits. Leave templateBuild=null.',
    '- For full email generation (visual mode): Set reply + templateBuild with mode="visual" and components array.',
    '- For full email generation (code mode): Set reply + templateBuild with mode="code" and html string.',
    '- For clarification needed: Set reply + clarification with your question. Leave templateBuild=null.',
    '- NEVER set both templateBuild and clarification in the same response.',
    '- componentEdits is for editing the CURRENTLY SELECTED component only. templateBuild is for generating a FULL EMAIL.',
  );

  return sections.join('\n');
}
