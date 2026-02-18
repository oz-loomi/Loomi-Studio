import { NextRequest, NextResponse } from 'next/server';
import { findActiveInviteByToken } from '@/lib/users/invitations';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim() || '';
  if (!token) {
    return NextResponse.json({ error: 'Invite token is required' }, { status: 400 });
  }

  const invite = await findActiveInviteByToken(token);
  if (!invite) {
    return NextResponse.json({ error: 'Invite is invalid or expired' }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      name: invite.user.name,
      email: invite.user.email,
      role: invite.user.role,
    },
    expiresAt: invite.expiresAt.toISOString(),
  });
}
