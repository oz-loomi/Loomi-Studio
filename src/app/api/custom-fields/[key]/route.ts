import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import {
  isResolveError,
  resolveAdapterAndCredentials,
} from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';
import {
  createCustomField,
  fetchCustomFields,
} from '@/lib/esp/adapters/ghl/custom-fields';

function parseBodyRecord(body: unknown): Record<string, unknown> | null {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/**
 * GET /api/custom-fields/[key]?model=contact
 * Fetch custom fields directly from a connected GHL sub-account.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { error } = await requireRole('developer', 'super_admin');
  if (error) return error;

  try {
    const { key } = await params;
    const model = req.nextUrl.searchParams.get('model')?.trim() || undefined;

    const resolved = await resolveAdapterAndCredentials(key);
    if (isResolveError(resolved)) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const { adapter, credentials } = resolved;
    if (adapter.provider !== 'ghl') {
      return NextResponse.json(
        unsupportedCapabilityPayload(adapter.provider, 'custom fields'),
        { status: 501 },
      );
    }

    const fields = await fetchCustomFields(credentials.token, credentials.locationId, model);
    return NextResponse.json({
      provider: adapter.provider,
      accountKey: key,
      model: model || null,
      fields,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch custom fields' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/custom-fields/[key]?model=contact
 * Create a custom field directly in a connected GHL sub-account.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { error } = await requireRole('developer', 'super_admin');
  if (error) return error;

  try {
    const { key } = await params;
    const body = await req.json();
    const payload = parseBodyRecord(body);
    if (!payload) {
      return NextResponse.json({ error: 'Body must be an object' }, { status: 400 });
    }

    const modelFromQuery = req.nextUrl.searchParams.get('model')?.trim() || undefined;
    const modelFromBody = typeof payload.model === 'string' && payload.model.trim()
      ? payload.model.trim()
      : undefined;
    const model = modelFromQuery || modelFromBody;

    const resolved = await resolveAdapterAndCredentials(key);
    if (isResolveError(resolved)) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const { adapter, credentials } = resolved;
    if (adapter.provider !== 'ghl') {
      return NextResponse.json(
        unsupportedCapabilityPayload(adapter.provider, 'custom fields'),
        { status: 501 },
      );
    }

    const created = await createCustomField(credentials.token, credentials.locationId, payload, model);
    return NextResponse.json({
      provider: adapter.provider,
      accountKey: key,
      created,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create custom field' },
      { status: 500 },
    );
  }
}
