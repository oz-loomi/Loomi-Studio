import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import type { EspContactCapabilities } from '@/lib/esp/types';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';

type RouteContext = { params: Promise<{ contactId: string }> };

function fallbackCapabilities(messagingSupported: boolean): EspContactCapabilities {
  return {
    dnd: false,
    conversations: false,
    messaging: messagingSupported,
  };
}

function statusFromError(err: unknown): number {
  const status = (err as { status?: unknown })?.status;
  return typeof status === 'number' ? status : 500;
}

/**
 * GET /api/esp/contacts/:contactId?accountKey=xxx
 *
 * Provider-agnostic single contact detail.
 * Uses provider-specific contact-detail adapters when available,
 * otherwise falls back to normalized contact lookup via contacts adapter.
 */
export async function GET(
  req: NextRequest,
  { params }: RouteContext,
) {
  const { session, error } = await requireRole('developer', 'super_admin', 'admin', 'client');
  if (error) return error;

  const { contactId } = await params;
  const accountKey = req.nextUrl.searchParams.get('accountKey')?.trim()
    || '';
  if (!accountKey) {
    return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
  }

  if (session!.user.role === 'client') {
    const userAccountKeys = session!.user.accountKeys ?? [];
    if (!userAccountKeys.includes(accountKey)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const result = await resolveAdapterAndCredentials(accountKey, {
    requireCapability: 'contacts',
  });
  if (isResolveError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { adapter, credentials } = result;

  // Provider-specific contact detail adapter (if implemented).
  if (adapter.contactDetail) {
    try {
      const payload = await adapter.contactDetail.fetchContactDetail({
        accountKey,
        contactId,
        credentials,
      });
      return NextResponse.json({
        ...payload,
        provider: adapter.provider,
        capabilities: adapter.contactDetail.capabilities,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch contact';
      return NextResponse.json({ error: message }, { status: statusFromError(err) });
    }
  }

  try {
    // Start with a targeted search request.
    const page = await adapter.contacts!.requestContacts({
      token: credentials.token,
      locationId: credentials.locationId,
      limit: 25,
      search: contactId,
    });

    let matchedRaw =
      page.contacts.find((raw) => adapter.contacts!.normalizeContact(raw).id === contactId) ||
      null;

    // Some providers do not support searching directly by provider contact ID.
    // Fall back to a full fetch and exact ID match for detail pages.
    if (!matchedRaw) {
      const rawContacts = await adapter.contacts!.fetchAllContacts(credentials.token, credentials.locationId);
      matchedRaw =
        rawContacts.find((raw) => adapter.contacts!.normalizeContact(raw).id === contactId) ||
        null;
    }

    if (!matchedRaw) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const contact = adapter.contacts!.normalizeContact(matchedRaw);
    return NextResponse.json({
      contact,
      provider: adapter.provider,
      capabilities: fallbackCapabilities(adapter.capabilities.messages),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch contact';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/esp/contacts/:contactId?accountKey=xxx
 *
 * Provider-agnostic contact settings update.
 * Only providers that implement contact-detail DND updates are supported.
 */
export async function PATCH(
  req: NextRequest,
  { params }: RouteContext,
) {
  const { session, error } = await requireRole('developer', 'super_admin', 'admin', 'client');
  if (error) return error;

  const { contactId } = await params;
  const accountKey = req.nextUrl.searchParams.get('accountKey')?.trim()
    || '';
  if (!accountKey) {
    return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
  }

  if (session!.user.role === 'client') {
    const userAccountKeys = session!.user.accountKeys ?? [];
    if (!userAccountKeys.includes(accountKey)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const result = await resolveAdapterAndCredentials(accountKey, {
    requireCapability: 'contacts',
  });
  if (isResolveError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { adapter, credentials } = result;
  if (!adapter.contactDetail?.updateContactDnd) {
    return NextResponse.json(
      unsupportedCapabilityPayload(adapter.provider, 'channel DND updates'),
      { status: 501 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const payload = await adapter.contactDetail.updateContactDnd({
      accountKey,
      contactId,
      body,
      credentials,
    });
    return NextResponse.json({
      ...payload,
      provider: adapter.provider,
      capabilities: adapter.contactDetail.capabilities,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update contact';
    return NextResponse.json({ error: message }, { status: statusFromError(err) });
  }
}
