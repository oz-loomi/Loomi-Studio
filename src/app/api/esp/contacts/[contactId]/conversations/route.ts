import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';

/**
 * GET /api/esp/contacts/:contactId/conversations?accountKey=xxx
 *
 * Provider-agnostic conversation history.
 * Uses provider messaging adapter when available, otherwise returns an empty payload.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> },
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

  if (!adapter.contactMessaging) {
    return NextResponse.json({
      ...unsupportedCapabilityPayload(adapter.provider, 'conversation history'),
      conversations: [],
      messages: [],
      stats: {
        smsCount: 0,
        emailCount: 0,
        totalMessages: 0,
        lastMessageDate: null,
        lastMessageDirection: null,
      },
    });
  }

  try {
    const payload = await adapter.contactMessaging.fetchContactConversations({
      accountKey,
      contactId,
      credentials,
    });
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch conversations';
    const statusRaw = (err as { status?: unknown })?.status;
    const status = typeof statusRaw === 'number' ? statusRaw : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
