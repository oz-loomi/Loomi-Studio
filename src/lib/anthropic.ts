import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
    client = new Anthropic({ apiKey });
  }
  return client;
}

export const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250514';

/** Attempt to parse JSON from an AI response, stripping markdown fences if needed. */
export function parseAiJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Claude sometimes wraps JSON in markdown fences despite instructions
    const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }
    throw new Error('AI response was not valid JSON');
  }
}
