import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import { issueAndSendUserInvite } from '@/lib/users/invitations';

function parseAccountKeys(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function normalizeAccountKeys(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((value) => String(value).trim()).filter(Boolean))];
}

function withAccountKeys<T extends { accountKeys: string }>(user: T): Omit<T, 'accountKeys'> & { accountKeys: string[] } {
  const { accountKeys: storedAccountKeys, ...rest } = user;
  const accountKeys = parseAccountKeys(storedAccountKeys);
  return {
    ...rest,
    accountKeys,
  };
}

export async function GET() {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      title: true,
      email: true,
      avatarUrl: true,
      role: true,
      accountKeys: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const formatted = users.map(u => ({
    ...withAccountKeys(u),
  }));

  return NextResponse.json(formatted);
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireRole('developer', 'admin');
  if (error) return error;

  const { name, title, email, password, role, accountKeys, sendInvite } = await req.json();
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim() : '';
  const shouldSendInvite = sendInvite !== false;
  const normalizedAccountKeys = normalizeAccountKeys(accountKeys);

  if (!normalizedName || !normalizedEmail || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!shouldSendInvite && (!password || !String(password).trim())) {
    return NextResponse.json({ error: 'Password is required when invite is disabled' }, { status: 400 });
  }

  if (!['developer', 'admin', 'client'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
  }

  const passwordSeed = shouldSendInvite
    ? crypto.randomBytes(32).toString('hex')
    : String(password).trim();
  const hashedPassword = await bcryptjs.hash(passwordSeed, 12);

  const user = await prisma.user.create({
    data: {
      name: normalizedName,
      title: typeof title === 'string' && title.trim() ? title.trim() : null,
      email: normalizedEmail,
      password: hashedPassword,
      role,
      accountKeys: JSON.stringify(normalizedAccountKeys),
    },
    select: {
      id: true,
      name: true,
      title: true,
      email: true,
      avatarUrl: true,
      role: true,
      accountKeys: true,
      createdAt: true,
    },
  });

  let invite: {
    sent: boolean;
    expiresAt?: string;
    error?: string;
  } | null = null;

  if (shouldSendInvite) {
    try {
      const issuedInvite = await issueAndSendUserInvite({
        userId: user.id,
        invitedByName: session?.user?.name || 'Loomi Studio',
      });
      invite = {
        sent: true,
        expiresAt: issuedInvite.expiresAt.toISOString(),
      };
    } catch (err) {
      invite = {
        sent: false,
        error: err instanceof Error ? err.message : 'Failed to send invite email',
      };
    }
  }

  return NextResponse.json(
    {
      ...withAccountKeys(user),
      invite,
    },
    { status: 201 },
  );
}

export async function PUT(req: NextRequest) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  const { id, name, title, email, role, accountKeys, password } = await req.json();

  if (!id) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (title !== undefined) data.title = typeof title === 'string' && title.trim() ? title.trim() : null;
  if (email !== undefined) data.email = email;
  if (role !== undefined) {
    if (!['developer', 'admin', 'client'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    data.role = role;
  }
  if (accountKeys !== undefined) {
    data.accountKeys = JSON.stringify(normalizeAccountKeys(accountKeys));
  }
  if (password) data.password = await bcryptjs.hash(password, 12);

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      title: true,
      email: true,
      avatarUrl: true,
      role: true,
      accountKeys: true,
      createdAt: true,
    },
  });

  return NextResponse.json(withAccountKeys(user));
}

export async function DELETE(req: NextRequest) {
  const { error, session } = await requireRole('developer', 'admin');
  if (error) return error;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 });
  }

  // Prevent self-deletion
  if (session?.user.id === id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
