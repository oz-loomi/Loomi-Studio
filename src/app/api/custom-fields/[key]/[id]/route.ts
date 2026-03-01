import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import {
  isResolveError,
  resolveAdapterAndCredentials,
} from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';
import {
  deleteCustomField,
  fetchCustomField,
  updateCustomField,
} from '@/lib/esp/adapters/ghl/custom-fields';

function parseBodyRecord(body: unknown): Record<string, unknown> | null {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/**
 * GET /api/custom-fields/[key]/[id]
 * Fetch one custom field from a connected GHL sub-account.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string; id: string }> },
) {
  const { error } = await requireRole('developer', 'super_admin');
  if (error) return error;

  try {
    const { key, id } = await params;
    const customFieldId = id.trim();
    if (!customFieldId) {
      return NextResponse.json({ error: 'Custom field id is required' }, { status: 400 });
    }

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

    const field = await fetchCustomField(credentials.token, credentials.locationId, customFieldId);
    if (!field) {
      return NextResponse.json({ error: 'Custom field not found' }, { status: 404 });
    }

    return NextResponse.json({
      provider: adapter.provider,
      accountKey: key,
      field,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch custom field' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/custom-fields/[key]/[id]
 * Update one custom field in a connected GHL sub-account.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string; id: string }> },
) {
  const { error } = await requireRole('developer', 'super_admin');
  if (error) return error;

  try {
    const { key, id } = await params;
    const customFieldId = id.trim();
    if (!customFieldId) {
      return NextResponse.json({ error: 'Custom field id is required' }, { status: 400 });
    }

    const body = await req.json();
    const payload = parseBodyRecord(body);
    if (!payload) {
      return NextResponse.json({ error: 'Body must be an object' }, { status: 400 });
    }

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

    const updated = await updateCustomField(
      credentials.token,
      credentials.locationId,
      customFieldId,
      payload,
    );

    return NextResponse.json({
      provider: adapter.provider,
      accountKey: key,
      updated,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update custom field' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/custom-fields/[key]/[id]
 * Delete one custom field from a connected GHL sub-account.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string; id: string }> },
) {
  const { error } = await requireRole('developer', 'super_admin');
  if (error) return error;

  try {
    const { key, id } = await params;
    const customFieldId = id.trim();
    if (!customFieldId) {
      return NextResponse.json({ error: 'Custom field id is required' }, { status: 400 });
    }

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

    await deleteCustomField(credentials.token, credentials.locationId, customFieldId);
    return NextResponse.json({
      provider: adapter.provider,
      accountKey: key,
      deletedId: customFieldId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete custom field' },
      { status: 500 },
    );
  }
}
