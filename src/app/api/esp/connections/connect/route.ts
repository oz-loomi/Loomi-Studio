import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import { connectEspConnection, EspConnectionError } from '@/lib/esp/connections';
import { parseEspProvider, providerValidationMessage } from '@/lib/esp/provider-utils';

/**
 * POST /api/esp/connections/connect
 *
 * Provider-agnostic direct credential connect endpoint.
 * Body shape depends on provider auth model (currently apiKey providers).
 */
export async function POST(req: NextRequest) {
  const { error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  let body: {
    accountKey?: string;
    provider?: string;
    apiKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const accountKey = typeof body.accountKey === 'string' && body.accountKey.trim()
    ? body.accountKey.trim()
    : '';
  const providerRaw = typeof body.provider === 'string' ? body.provider : '';
  const provider = parseEspProvider(providerRaw);
  const apiKey = body.apiKey;

  if (!accountKey) {
    return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
  }
  if (!providerRaw.trim()) {
    return NextResponse.json({ error: 'provider is required' }, { status: 400 });
  }
  if (!provider) {
    return NextResponse.json({ error: providerValidationMessage() }, { status: 400 });
  }

  try {
    const result = await connectEspConnection({
      accountKey,
      provider,
      apiKey,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof EspConnectionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to connect provider';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
