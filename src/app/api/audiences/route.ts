import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import * as audienceService from '@/lib/services/audiences';

/**
 * GET /api/audiences
 * List audiences accessible to the current user.
 */
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const userRole = session!.user.role;
  const userAccountKeys: string[] = session!.user.accountKeys ?? [];

  const audiences =
    userRole === 'developer'
      ? await audienceService.getAudiences()
      : await audienceService.getAudiences(userAccountKeys);

  return NextResponse.json({ audiences });
}

/**
 * POST /api/audiences
 * Create a new audience.
 */
export async function POST(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const { name, description, accountKey, filters, icon, color } = body;

  if (!name || !filters) {
    return NextResponse.json({ error: 'name and filters are required' }, { status: 400 });
  }

  // Validate filters is valid JSON
  try {
    const parsed = JSON.parse(filters);
    if (parsed.version !== 1 || !Array.isArray(parsed.groups)) {
      return NextResponse.json({ error: 'Invalid filter definition' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'filters must be valid JSON' }, { status: 400 });
  }

  // Non-admin users can only create audiences for their assigned accounts
  const userRole = session!.user.role;
  const userAccountKeys: string[] = session!.user.accountKeys ?? [];
  if (accountKey && userRole !== 'developer' && !userAccountKeys.includes(accountKey)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const audience = await audienceService.createAudience({
    name,
    description,
    accountKey: accountKey || null,
    createdByUserId: session!.user.id,
    filters,
    icon,
    color,
  });

  return NextResponse.json({ audience }, { status: 201 });
}
