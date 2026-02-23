import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import { validateEspConnection } from '@/lib/esp/connection-validation';

/**
 * POST /api/esp/connections/validate
 *
 * Provider-agnostic credential validation for supported ESPs.
 *
 * Examples:
 * - { provider: 'provider-id', accountKey: 'abc' } (OAuth-backed provider)
 * - { provider: 'provider-id', apiKey: '...' } (API key-backed provider)
 */
export async function POST(req: NextRequest) {
  const { error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const parsed = await req.json().catch(() => ({}));
    const body = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
    const accountKey = typeof body.accountKey === 'string' && body.accountKey.trim()
      ? body.accountKey.trim()
      : '';
    const normalizedBody: Record<string, unknown> = {
      ...body,
      ...(accountKey ? { accountKey } : {}),
    };
    const result = await validateEspConnection(normalizedBody as Record<string, unknown>);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      provider: result.provider,
      mode: result.mode,
      ...(result.location ? { location: result.location } : {}),
      ...(result.account ? { account: result.account } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to validate ESP credentials';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
