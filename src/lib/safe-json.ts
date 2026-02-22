/**
 * Safely parse a fetch Response as JSON.
 *
 * When a reverse proxy (nginx, Cloudflare, etc.) intercepts a request it often
 * returns an HTML error page (e.g. 413 Request Entity Too Large). Calling
 * `res.json()` on that HTML throws "Unexpected token '<'…" which is confusing.
 *
 * This helper inspects the content-type header first and returns a meaningful
 * error object when the response isn't JSON.
 */

export interface SafeJsonResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

/**
 * Parse a fetch response safely. Returns `{ ok, status, data, error }`.
 *
 * - If the response has a JSON content-type, parses normally.
 * - If the response is HTML or non-JSON, returns a user-friendly error message
 *   derived from the HTTP status (e.g. "Server rejected the upload (413)").
 * - Never throws.
 */
export async function safeJson<T = Record<string, unknown>>(
  res: Response,
): Promise<SafeJsonResult<T>> {
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  // Happy path: JSON response
  if (isJson) {
    try {
      const data = (await res.json()) as T;
      return { ok: res.ok, status: res.status, data, error: null };
    } catch {
      return {
        ok: false,
        status: res.status,
        data: null,
        error: `Failed to parse server response (${res.status})`,
      };
    }
  }

  // Non-JSON response — derive a readable error from the HTTP status
  const statusMessages: Record<number, string> = {
    413: 'File too large — your server (e.g. nginx) rejected the upload. Increase client_max_body_size.',
    401: 'Not authenticated. Please sign in again.',
    403: 'Access denied.',
    404: 'Endpoint not found. The server may not be configured correctly.',
    500: 'Internal server error.',
    502: 'Bad gateway — the server may be restarting.',
    503: 'Service unavailable — the server may be overloaded.',
    504: 'Gateway timeout — the server took too long to respond.',
  };

  const fallback = `Server returned an unexpected response (${res.status})`;
  const error = statusMessages[res.status] || fallback;

  return { ok: false, status: res.status, data: null, error };
}
