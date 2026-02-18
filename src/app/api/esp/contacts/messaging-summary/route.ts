import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';

/**
 * GET /api/esp/contacts/messaging-summary?accountKey=xxx&contactIds=id1,id2,...
 *
 * Provider-agnostic messaging summary.
 * Uses provider messaging adapter when available.
 * Providers without messaging summary support return empty summaries.
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireRole('developer', 'admin', 'client');
  if (error) return error;

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

  const contactIds = (req.nextUrl.searchParams.get('contactIds') || '').split(',').filter(Boolean);
  if (contactIds.length === 0) {
    return NextResponse.json({ error: 'contactIds is required' }, { status: 400 });
  }

  const result = await resolveAdapterAndCredentials(accountKey, {
    requireCapability: 'contacts',
  });
  if (isResolveError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { adapter, credentials } = result;

  if (!adapter.contactMessaging) {
    const summaryByContactId: Record<string, {
      hasReceivedMessage: boolean;
      hasReceivedEmail: boolean;
      hasReceivedSms: boolean;
      lastMessageDate: string;
    }> = {};
    for (const id of contactIds) {
      summaryByContactId[id] = {
        hasReceivedMessage: false,
        hasReceivedEmail: false,
        hasReceivedSms: false,
        lastMessageDate: '',
      };
    }
    return NextResponse.json({
      ...unsupportedCapabilityPayload(adapter.provider, 'messaging summaries'),
      summaryByContactId,
    });
  }

  try {
    const payload = await adapter.contactMessaging.fetchMessagingSummary({
      accountKey,
      contactIds: [...new Set(contactIds)].slice(0, 40),
      credentials,
    });
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch messaging summary';
    const statusRaw = (err as { status?: unknown })?.status;
    const status = typeof statusRaw === 'number' ? statusRaw : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
