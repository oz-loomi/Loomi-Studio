import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getChatSystemPrompt } from '@/lib/ai-knowledge';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  prompt?: string;
  context?: {
    page?: string;
    accountKey?: string | null;
    accountName?: string | null;
    userRole?: string | null;
    userName?: string | null;
    isAdmin?: boolean;
  };
  history?: ConversationMessage[];
}

interface ChatResponsePayload {
  reply: string;
  suggestions: string[];
}

function normalizeResponse(raw: unknown): ChatResponsePayload {
  if (!raw || typeof raw !== 'object') {
    return { reply: '', suggestions: [] };
  }

  const row = raw as Record<string, unknown>;
  const reply = typeof row.reply === 'string' ? row.reply : '';
  const suggestions = Array.isArray(row.suggestions)
    ? row.suggestions.filter((s): s is string => typeof s === 'string').slice(0, 4)
    : [];

  return { reply, suggestions };
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const body = (await req.json()) as ChatRequestBody;
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured' },
        { status: 400 },
      );
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const apiBase = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    const requestContext = body.context || {};
    const accountKey = requestContext.accountKey ?? null;
    const accountName = requestContext.accountName ?? null;
    const userContent = JSON.stringify({
      prompt,
      context: {
        ...requestContext,
        accountKey,
        accountName,
      },
    });

    // Build message array with conversation history (last 5 exchanges max)
    const systemPrompt = await getChatSystemPrompt();
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
    for (const msg of history) {
      if (msg.role === 'user' && typeof msg.content === 'string') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant' && typeof msg.content === 'string') {
        messages.push({ role: 'assistant', content: msg.content });
      }
    }

    messages.push({ role: 'user', content: userContent });

    const llmRes = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages,
      }),
    });

    const llmData = await llmRes.json();
    if (!llmRes.ok) {
      const message = llmData?.error?.message || 'AI request failed';
      return NextResponse.json({ error: message }, { status: llmRes.status });
    }

    const content = llmData?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'AI response was empty' }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    const normalized = normalizeResponse(parsed);
    if (!normalized.reply && normalized.suggestions.length === 0) {
      normalized.reply = 'No response generated. Try rephrasing your question.';
    }

    return NextResponse.json(normalized);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to run AI chat';
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
