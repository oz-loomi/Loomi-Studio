import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';

type RouteContext = { params: Promise<{ contactId: string }> };
type OutboundMessageChannel = 'SMS' | 'MMS';

function normalizeChannel(value: unknown): OutboundMessageChannel {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return text === 'MMS' ? 'MMS' : 'SMS';
}

function normalizeMediaUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .filter((url) => /^https?:\/\/\S+$/i.test(url));
  return [...new Set(urls)];
}

/**
 * POST /api/esp/contacts/[contactId]/messages?accountKey=xxx
 *
 * Provider-agnostic 1:1 outbound message send.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { session, error } = await requireRole('developer', 'admin', 'client');
  if (error) return error;

  const { contactId } = await params;
  const body = await req.json().catch(() => ({}));
  const accountKey =
    req.nextUrl.searchParams.get('accountKey')?.trim() ||
    (typeof body?.accountKey === 'string' ? body.accountKey.trim() : '');
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const channel = normalizeChannel(body?.channel);
  const mediaUrls = normalizeMediaUrls(body?.mediaUrls);

  if (!accountKey) {
    return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
  }
  if (!contactId) {
    return NextResponse.json({ error: 'contactId is required' }, { status: 400 });
  }
  if (!message && mediaUrls.length === 0) {
    return NextResponse.json({ error: 'message or mediaUrls is required' }, { status: 400 });
  }

  if (session!.user.role === 'client') {
    const userAccountKeys = session!.user.accountKeys ?? [];
    if (!userAccountKeys.includes(accountKey)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const result = await resolveAdapterAndCredentials(accountKey, {
    requireCapability: 'messages',
  });
  if (isResolveError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { adapter, credentials } = result;
  if (!adapter.messages) {
    return NextResponse.json(
      unsupportedCapabilityPayload(adapter.provider, 'direct 1:1 messaging'),
      { status: 501 },
    );
  }

  try {
    const sent = await adapter.messages.sendMessageToContact({
      token: credentials.token,
      locationId: credentials.locationId,
      contactId,
      message,
      channel,
      mediaUrls,
    });

    return NextResponse.json({
      ok: true,
      provider: adapter.provider,
      message: {
        id: sent.id,
        channel: sent.channel,
        type: sent.type,
        direction: sent.direction,
        body: sent.body,
        dateAdded: sent.dateAdded,
        conversationId: sent.conversationId,
      },
    });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : 'Failed to send message';
    const status =
      typeof (err as { status?: unknown })?.status === 'number'
        ? Number((err as { status: number }).status)
        : messageText.includes('(401)')
          ? 401
          : messageText.includes('(403)')
            ? 403
            : messageText.includes('(404)')
              ? 404
              : messageText.includes('(400)')
                ? 400
                : 500;
    return NextResponse.json({ error: messageText }, { status });
  }
}
