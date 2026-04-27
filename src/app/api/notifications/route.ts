import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  countUnreadForUser,
  listNotificationsForUser,
} from '@/lib/notifications/service';

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const url = req.nextUrl;
  const unreadOnly = url.searchParams.get('unreadOnly') === '1';
  const limit = Number(url.searchParams.get('limit') || '50');

  const [items, unreadCount] = await Promise.all([
    listNotificationsForUser({ userId: session!.user.id, unreadOnly, limit }),
    countUnreadForUser(session!.user.id),
  ]);

  return NextResponse.json({ items, unreadCount });
}
