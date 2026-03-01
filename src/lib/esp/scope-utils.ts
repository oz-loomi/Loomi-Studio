/**
 * Parse a JSON-encoded array of scope strings.
 * Returns an empty array for null/undefined/invalid input.
 */
export function parseScopes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
