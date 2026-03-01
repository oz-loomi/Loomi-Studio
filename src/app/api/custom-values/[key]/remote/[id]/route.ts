import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import {
  isResolveError,
  resolveAdapterAndCredentials,
} from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';

type UpdatePayload = {
  name: string;
  value: string;
};

function parseUpdateInput(body: unknown): { value: UpdatePayload } | { error: string } {
  const row =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  if (!row) return { error: 'Body must be an object' };

  const name = typeof row.name === 'string' ? row.name.trim() : '';
  const value = typeof row.value === 'string' ? row.value : '';
  if (!name) return { error: 'name is required' };

  return { value: { name, value } };
}

/**
 * PUT /api/custom-values/[key]/remote/[id]
 * Update one remote custom value.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string; id: string }> },
) {
  const { error } = await requireRole('developer', 'super_admin');
  if (error) return error;

  try {
    const { key, id } = await params;
    const customValueId = id.trim();
    if (!customValueId) {
      return NextResponse.json({ error: 'Custom value id is required' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = parseUpdateInput(body);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const resolved = await resolveAdapterAndCredentials(key, {
      requireCapability: 'customValues',
    });
    if (isResolveError(resolved)) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const { adapter, credentials } = resolved;
    if (!adapter.customValues) {
      return NextResponse.json(
        unsupportedCapabilityPayload(adapter.provider, 'custom values'),
        { status: 501 },
      );
    }

    const updated = await adapter.customValues.updateCustomValue(
      credentials.token,
      credentials.locationId,
      customValueId,
      parsed.value,
    );

    return NextResponse.json({
      provider: adapter.provider,
      accountKey: key,
      updated,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update remote custom value' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/custom-values/[key]/remote/[id]
 * Delete one remote custom value.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string; id: string }> },
) {
  const { error } = await requireRole('developer', 'super_admin');
  if (error) return error;

  try {
    const { key, id } = await params;
    const customValueId = id.trim();
    if (!customValueId) {
      return NextResponse.json({ error: 'Custom value id is required' }, { status: 400 });
    }

    const resolved = await resolveAdapterAndCredentials(key, {
      requireCapability: 'customValues',
    });
    if (isResolveError(resolved)) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const { adapter, credentials } = resolved;
    if (!adapter.customValues) {
      return NextResponse.json(
        unsupportedCapabilityPayload(adapter.provider, 'custom values'),
        { status: 501 },
      );
    }

    await adapter.customValues.deleteCustomValue(
      credentials.token,
      credentials.locationId,
      customValueId,
    );

    return NextResponse.json({
      provider: adapter.provider,
      accountKey: key,
      deletedId: customValueId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete remote custom value' },
      { status: 500 },
    );
  }
}
