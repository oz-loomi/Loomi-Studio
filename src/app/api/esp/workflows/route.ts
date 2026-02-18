import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveAdapterAndCredentials, isResolveError } from '@/lib/esp/route-helpers';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';

/**
 * GET /api/esp/workflows?accountKey=xxx
 *
 * Provider-agnostic workflow/flow list.
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const accountKey = req.nextUrl.searchParams.get('accountKey');
  if (!accountKey) {
    return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
  }

  const userRole = session!.user.role;
  const userAccountKeys: string[] = session!.user.accountKeys ?? [];
  const hasUnrestrictedAdminAccess = userRole === 'admin' && userAccountKeys.length === 0;
  if (userRole !== 'developer' && !hasUnrestrictedAdminAccess && !userAccountKeys.includes(accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const result = await resolveAdapterAndCredentials(accountKey, {
    requireCapability: 'workflows',
  });
  if (isResolveError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { adapter, credentials } = result;
  if (!adapter.campaigns) {
    return NextResponse.json(
      unsupportedCapabilityPayload(adapter.provider, 'workflows'),
      { status: 501 },
    );
  }

  try {
    const workflows = await adapter.campaigns.fetchWorkflows(credentials.token, credentials.locationId);
    const taggedWorkflows = workflows.map((workflow) => ({
      ...workflow,
      accountKey: workflow.accountKey || accountKey,
      provider: adapter.provider,
    }));
    return NextResponse.json({
      workflows: taggedWorkflows,
      meta: {
        total: workflows.length,
        accountKey,
        provider: adapter.provider,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch workflows';
    const status =
      message.includes('(401)') ? 401 :
      message.includes('(403)') ? 403 :
      message.includes('(404)') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
