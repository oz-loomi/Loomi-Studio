import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getAssistantSystemPrompt, buildAccountContext, AccountContextInput } from '@/lib/ai-knowledge';
import { getAnthropicClient, ANTHROPIC_MODEL, parseAiJson } from '@/lib/anthropic';
import { componentSchemas } from '@/lib/component-schemas';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantRequestBody {
  prompt?: string;
  context?: Record<string, unknown>;
  history?: ConversationMessage[];
}

interface TemplateBuild {
  mode: 'visual' | 'code';
  components?: Array<{ type: string; props: Record<string, string> }>;
  html?: string;
  frontmatter?: Record<string, string>;
  baseProps?: Record<string, string>;
}

interface AssistantResponsePayload {
  reply: string;
  suggestions: string[];
  componentEdits: Array<{ componentIndex?: number; key: string; value: string; reason?: string }>;
  templateBuild: TemplateBuild | null;
  clarification: string | null;
}

const VALID_COMPONENT_TYPES = new Set(Object.keys(componentSchemas));

function normalizeTemplateBuild(raw: unknown): TemplateBuild | null {
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;
  const mode = obj.mode;
  if (mode !== 'visual' && mode !== 'code') return null;

  const result: TemplateBuild = { mode };

  if (mode === 'visual' && Array.isArray(obj.components)) {
    result.components = obj.components
      .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
      .filter((c) => typeof c.type === 'string' && VALID_COMPONENT_TYPES.has(c.type))
      .map((c) => {
        const props: Record<string, string> = {};
        if (c.props && typeof c.props === 'object') {
          for (const [k, v] of Object.entries(c.props as Record<string, unknown>)) {
            if (typeof v === 'string') props[k] = v;
            else if (v !== null && v !== undefined) props[k] = String(v);
          }
        }
        return { type: c.type as string, props };
      });
    if (result.components.length === 0) return null;
  } else if (mode === 'code' && typeof obj.html === 'string' && obj.html.trim()) {
    result.html = obj.html;
  } else {
    return null;
  }

  // Optional frontmatter and baseProps
  if (obj.frontmatter && typeof obj.frontmatter === 'object') {
    const fm: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj.frontmatter as Record<string, unknown>)) {
      if (typeof v === 'string') fm[k] = v;
    }
    if (Object.keys(fm).length > 0) result.frontmatter = fm;
  }

  if (obj.baseProps && typeof obj.baseProps === 'object') {
    const bp: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj.baseProps as Record<string, unknown>)) {
      if (typeof v === 'string') bp[k] = v;
    }
    if (Object.keys(bp).length > 0) result.baseProps = bp;
  }

  return result;
}

function normalizeResponse(raw: unknown): AssistantResponsePayload {
  if (!raw || typeof raw !== 'object') {
    return {
      reply: '',
      suggestions: [],
      componentEdits: [],
      templateBuild: null,
      clarification: null,
    };
  }

  const row = raw as Record<string, unknown>;
  const reply = typeof row.reply === 'string' ? row.reply : '';
  const suggestions = Array.isArray(row.suggestions)
    ? row.suggestions.filter((s): s is string => typeof s === 'string').slice(0, 12)
    : [];
  const componentEdits = Array.isArray(row.componentEdits)
    ? row.componentEdits
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({
          componentIndex: typeof item.componentIndex === 'number' ? item.componentIndex : undefined,
          key: typeof item.key === 'string' ? item.key : '',
          value: typeof item.value === 'string' ? item.value : (typeof item.value === 'number' ? String(item.value) : ''),
          reason: typeof item.reason === 'string' ? item.reason : undefined,
        }))
        .filter((item) => item.key && item.value)
        .slice(0, 50)
    : [];

  const clarification = typeof row.clarification === 'string' && row.clarification.trim()
    ? row.clarification.trim()
    : null;

  // If clarification is present, ignore templateBuild
  const templateBuild = clarification ? null : normalizeTemplateBuild(row.templateBuild);

  return { reply, suggestions, componentEdits, templateBuild, clarification };
}

function buildAssistantUserContent(prompt: string, context: Record<string, unknown>): string {
  return [
    'USER REQUEST:',
    prompt,
    '',
    'EDITOR CONTEXT JSON:',
    JSON.stringify(context),
    '',
    'IMPORTANT:',
    '- Match your output to the active editor context.',
    '- If EDITOR CONTEXT JSON.mode is "code" or EDITOR CONTEXT JSON.htmlOnlyBuilder is true, return templateBuild.mode="code" and do not return drag-and-drop component arrays unless the user explicitly asks for visual components.',
    '- Read the current email context before asking clarifying questions.',
    '- Infer details already present in the email and ask only about missing or conflicting information.',
    '- Use the account context for branding, logos, custom values, and business/profile details.',
  ].join('\n');
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const body = (await req.json()) as AssistantRequestBody;
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const client = getAnthropicClient();

    // Build account context if available
    const accountData = body.context?.account as AccountContextInput | undefined;
    const accountContext = accountData ? buildAccountContext(accountData) : undefined;
    const systemPrompt = await getAssistantSystemPrompt(accountContext);

    const context = body.context || {};
    const userContent = buildAssistantUserContent(prompt, context);

    // Build message array with conversation history (last 10 messages)
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
    for (const msg of history) {
      if (msg.role === 'user' && typeof msg.content === 'string') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant' && typeof msg.content === 'string') {
        messages.push({ role: 'assistant', content: msg.content });
      }
    }

    messages.push({ role: 'user', content: userContent });

    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      system: systemPrompt,
      messages,
      temperature: 0.4,
      max_tokens: 4096,
    });

    const content =
      response.content[0]?.type === 'text' ? response.content[0].text : '';
    if (!content) {
      return NextResponse.json({ error: 'AI response was empty' }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = parseAiJson(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    const normalized = normalizeResponse(parsed);
    if (!normalized.reply && normalized.suggestions.length === 0 && normalized.componentEdits.length === 0 && !normalized.templateBuild && !normalized.clarification) {
      normalized.reply = 'No suggestions generated. Try a more specific prompt.';
    }

    return NextResponse.json(normalized);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to run AI assistant';
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
