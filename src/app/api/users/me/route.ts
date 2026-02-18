import { NextRequest, NextResponse } from 'next/server';
import bcryptjs from 'bcryptjs';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

function parseAccountKeys(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
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
  const { session, error } = await requireAuth();
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
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

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json(withAccountKeys(user));
}

export async function PUT(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { name, title, email, password } = await req.json() as {
    name?: string;
    title?: string;
    email?: string;
    password?: string;
  };

  const data: Record<string, unknown> = {};

  if (name !== undefined) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    data.name = trimmedName;
  }

  if (email !== undefined) {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } });
    if (existing && existing.id !== session.user.id) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }

    data.email = trimmedEmail;
  }

  if (title !== undefined) {
    const trimmedTitle = title.trim();
    data.title = trimmedTitle ? trimmedTitle : null;
  }

  if (password !== undefined) {
    if (password.trim()) {
      data.password = await bcryptjs.hash(password, 12);
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No changes submitted' }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
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
