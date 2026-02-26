import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

interface GenerateEmailMetaBody {
  field: 'subject' | 'previewText';
  emailTextContent?: string;
  currentSubject?: string;
  currentPreviewText?: string;
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const body = (await req.json()) as GenerateEmailMetaBody;
    const { field, emailTextContent, currentSubject, currentPreviewText } = body;

    if (field !== 'subject' && field !== 'previewText') {
      return NextResponse.json({ error: 'Invalid field — must be "subject" or "previewText"' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 400 });
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const apiBase = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    const fieldLabel = field === 'subject' ? 'subject line' : 'preview text';

    const systemPrompt = `You are an expert email marketer. Generate a single compelling ${fieldLabel} for the email described below.

Rules:
- ${field === 'subject' ? 'Subject lines should be 6-10 words, attention-grabbing, and relevant to the content.' : 'Preview text should be 40-90 characters, complement the subject line, and entice the reader to open.'}
- Do NOT use spammy language or all-caps.
- Return ONLY a JSON object: { "result": "your generated text" }`;

    const userParts: string[] = [];
    if (emailTextContent?.trim()) {
      userParts.push(`Email content:\n${emailTextContent.slice(0, 3000)}`);
    }
    if (currentSubject?.trim()) {
      userParts.push(`Current subject line: ${currentSubject}`);
    }
    if (currentPreviewText?.trim()) {
      userParts.push(`Current preview text: ${currentPreviewText}`);
    }
    if (userParts.length === 0) {
      userParts.push('No email content provided — generate a generic professional email subject line.');
    }

    const llmRes = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userParts.join('\n\n') },
        ],
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

    let parsed: { result?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    const result = typeof parsed?.result === 'string' ? parsed.result.trim() : '';
    if (!result) {
      return NextResponse.json({ error: 'AI returned an empty result' }, { status: 502 });
    }

    return NextResponse.json({ result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate email meta';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
