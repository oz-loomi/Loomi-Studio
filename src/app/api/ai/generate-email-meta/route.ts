import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getAnthropicClient, ANTHROPIC_MODEL, parseAiJson } from '@/lib/anthropic';

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

    const client = getAnthropicClient();

    const fieldLabel = field === 'subject' ? 'subject line' : 'preview text';

    const systemPrompt = `You are an expert email marketer. Generate a single compelling ${fieldLabel} for the email described below.

Rules:
- ${field === 'subject' ? 'Subject lines should be 6-10 words, attention-grabbing, and relevant to the content.' : 'Preview text should be 40-90 characters, complement the subject line, and entice the reader to open.'}
- Do NOT use spammy language or all-caps.
- Return ONLY a JSON object: { "result": "your generated text" }
- No markdown fences or extra text.`;

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

    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userParts.join('\n\n') },
      ],
      temperature: 0.7,
      max_tokens: 256,
    });

    const content =
      response.content[0]?.type === 'text' ? response.content[0].text : '';
    if (!content) {
      return NextResponse.json({ error: 'AI response was empty' }, { status: 502 });
    }

    let parsed: { result?: string };
    try {
      parsed = parseAiJson(content) as { result?: string };
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
