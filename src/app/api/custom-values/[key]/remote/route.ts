import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import type { CustomValueInput } from '@/lib/esp/types';
import {
  isResolveError,
  resolveAdapterAndCredentials,
} from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';

function slugifyFieldKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
}

function parseCreateInput(body: unknown): { value: CustomValueInput } | { error: string } {
  const row =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;

  if (!row) return { error: 'Body must be an object' };

  const name = typeof row.name === 'string' ? row.name.trim() : '';
  const value = typeof row.value === 'string' ? row.value : '';
  const candidateFieldKey = typeof row.fieldKey === 'string'
    ? row.fieldKey.trim()
    : '';
  const fieldKey = candidateFieldKey || slugifyFieldKey(name);

  if (!name) {
    return { error: 'name is required' };
  }
  if (!fieldKey) {
    return { error: 'fieldKey is required (or provide a name that can generate one)' };
  }

  return {
    value: {
      name,
      value,
      fieldKey,
    },
  };
}

/**
 * GET /api/custom-values/[key]/remote
 * Fetch custom values directly from the connected ESP account.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { error } = await requireRole('developer', 'super_admin');
  if (error) return error;

  try {
    const { key } = await params;
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

    const values = await adapter.customValues.fetchCustomValues(
      credentials.token,
      credentials.locationId,
    );

    return NextResponse.json({
      provider: adapter.provider,
      accountKey: key,
      values,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch remote custom values' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/custom-values/[key]/remote
 * Create one custom value directly in the connected ESP account.
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
    const parsed = parseCreateInput(body);
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

    const created = await adapter.customValues.createCustomValue(
      credentials.token,
      credentials.locationId,
      parsed.value,
    );

    return NextResponse.json({
      provider: adapter.provider,
      accountKey: key,
      created,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create remote custom value' },
      { status: 500 },
    );
  }
}
