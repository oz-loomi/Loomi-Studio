import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { markAllRead, markRead } from '@/lib/notifications/service';

interface ReadBody {
  ids?: string[];
  all?: boolean;
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as ReadBody;

  if (body.all) {
    const updated = await markAllRead(session!.user.id);
    return NextResponse.json({ updated });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === 'string')
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids[] or all=true required' }, { status: 400 });
  }
  const updated = await markRead(session!.user.id, ids);
  return NextResponse.json({ updated });
}
