import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { disconnectEspConnection } from '@/lib/esp/connections';
import { parseEspProvider, providerValidationMessage } from '@/lib/esp/provider-utils';

/**
 * POST /api/esp/connections/disconnect
 *
 * Body: { accountKey: string, provider: string | 'any' }
 */
export async function POST(req: NextRequest) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  let body: { accountKey?: string; provider?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const accountKey = typeof body.accountKey === 'string' && body.accountKey.trim()
    ? body.accountKey.trim()
    : '';
  const providerRaw = typeof body.provider === 'string'
    ? body.provider.trim().toLowerCase()
    : '';
  const provider = providerRaw === 'any'
    ? 'any'
    : parseEspProvider(providerRaw);

  if (!accountKey) {
    return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
  }
  if (!providerRaw) {
    return NextResponse.json({ error: 'provider is required' }, { status: 400 });
  }
  if (!provider) {
    return NextResponse.json(
      { error: `${providerValidationMessage()} or "any"` },
      { status: 400 },
    );
  }

  try {
    const result = await disconnectEspConnection({ accountKey, provider });
    if (!result.removed) {
      return NextResponse.json(
        { error: `No ${result.provider} connection found for this account`, provider: result.provider },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to disconnect ESP connection';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
