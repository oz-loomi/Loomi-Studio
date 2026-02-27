import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

const MAX_WIDGETS = 80;
const MAX_TOKEN_LENGTH = 96;

function parseTokenArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const deduped = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const token = item.trim();
    if (!token || token.length > MAX_TOKEN_LENGTH) continue;
    deduped.add(token);
    if (deduped.size >= MAX_WIDGETS) break;
  }

  return [...deduped];
}

function parseStoredTokenArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    return parseTokenArray(JSON.parse(raw));
  } catch {
    return [];
  }
}

function normalizeScope(value: string | null): string {
  return (value || '').trim().slice(0, 120);
}

function normalizeMode(value: string | null): string {
  return (value || '').trim().slice(0, 120);
}

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const mode = normalizeMode(req.nextUrl.searchParams.get('mode'));
  const scope = normalizeScope(req.nextUrl.searchParams.get('scope'));

  if (!mode || !scope) {
    return NextResponse.json({ error: 'mode and scope are required' }, { status: 400 });
  }

  const role = session.user.role;
  const userId = session.user.id;

  const record = await prisma.dashboardLayoutPreference.findUnique({
    where: {
      userId_role_mode_scopeKey: {
        userId,
        role,
        mode,
        scopeKey: scope,
      },
    },
  });

  return NextResponse.json({
    role,
    mode,
    scope,
    order: parseStoredTokenArray(record?.orderJson),
    hidden: parseStoredTokenArray(record?.hiddenJson),
  });
}

export async function PUT(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    const body = (await req.json()) as {
      mode?: unknown;
      scope?: unknown;
      order?: unknown;
      hidden?: unknown;
    };

    const mode = normalizeMode(typeof body.mode === 'string' ? body.mode : null);
    const scope = normalizeScope(typeof body.scope === 'string' ? body.scope : null);

    if (!mode || !scope) {
      return NextResponse.json({ error: 'mode and scope are required' }, { status: 400 });
    }

    const order = parseTokenArray(body.order);
    const hidden = parseTokenArray(body.hidden);

    const role = session.user.role;
    const userId = session.user.id;

    const saved = await prisma.dashboardLayoutPreference.upsert({
      where: {
        userId_role_mode_scopeKey: {
          userId,
          role,
          mode,
          scopeKey: scope,
        },
      },
      update: {
        orderJson: JSON.stringify(order),
        hiddenJson: JSON.stringify(hidden),
      },
      create: {
        userId,
        role,
        mode,
        scopeKey: scope,
        orderJson: JSON.stringify(order),
        hiddenJson: JSON.stringify(hidden),
      },
    });

    return NextResponse.json({
      role,
      mode,
      scope,
      order: parseStoredTokenArray(saved.orderJson),
      hidden: parseStoredTokenArray(saved.hiddenJson),
    });
  } catch {
    return NextResponse.json({ error: 'Invalid layout payload' }, { status: 400 });
  }
}
