import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions, type UserRole } from '@/lib/auth';

export async function getAuthSession() {
  return getServerSession(authOptions);
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function requireAuth() {
  const session = await getAuthSession();
  if (!session?.user) return { session: null, error: unauthorized() };
  return { session, error: null };
}

export async function requireRole(...roles: UserRole[]) {
  const session = await getAuthSession();
  if (!session?.user) return { session: null, error: unauthorized() };
  if (!roles.includes(session.user.role)) return { session, error: forbidden() };
  return { session, error: null };
}
