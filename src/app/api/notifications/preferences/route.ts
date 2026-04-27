import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import {
  NOTIFICATION_TYPE_REGISTRY,
  type NotificationType,
} from '@/lib/notifications/types';

const VALID_TYPES = new Set<NotificationType>(
  NOTIFICATION_TYPE_REGISTRY.map((m) => m.type),
);

/**
 * GET /api/notifications/preferences
 *
 * Returns the registry (catalog of available notification types) joined with
 * the current user's explicit preferences. Types missing from the DB use the
 * registry's `defaultEnabled` value.
 */
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: session!.user.id },
  });
  const explicit = new Map(prefs.map((p) => [p.type, p.enabled]));

  const items = NOTIFICATION_TYPE_REGISTRY.map((meta) => ({
    type: meta.type,
    label: meta.label,
    description: meta.description,
    category: meta.category,
    channel: meta.channel,
    defaultEnabled: meta.defaultEnabled,
    enabled: explicit.get(meta.type) ?? meta.defaultEnabled,
  }));

  return NextResponse.json({ items });
}

interface UpdateBody {
  preferences?: Array<{ type: string; enabled: boolean }>;
}

/**
 * PUT /api/notifications/preferences
 *
 * Body: { preferences: [{ type, enabled }] }
 * Upserts the explicit preference rows for each provided type. Unknown types
 * are silently ignored.
 */
export async function PUT(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as UpdateBody;
  const updates = Array.isArray(body.preferences) ? body.preferences : [];
  const valid = updates.filter(
    (u) => typeof u.type === 'string' && VALID_TYPES.has(u.type as NotificationType) && typeof u.enabled === 'boolean',
  );

  await Promise.all(
    valid.map((u) =>
      prisma.notificationPreference.upsert({
        where: { userId_type: { userId: session!.user.id, type: u.type } },
        create: { userId: session!.user.id, type: u.type, enabled: u.enabled },
        update: { enabled: u.enabled },
      }),
    ),
  );

  // Return the fresh state after the upserts
  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: session!.user.id },
  });
  const explicit = new Map(prefs.map((p) => [p.type, p.enabled]));
  const items = NOTIFICATION_TYPE_REGISTRY.map((meta) => ({
    type: meta.type,
    label: meta.label,
    description: meta.description,
    category: meta.category,
    channel: meta.channel,
    defaultEnabled: meta.defaultEnabled,
    enabled: explicit.get(meta.type) ?? meta.defaultEnabled,
  }));

  return NextResponse.json({ items, updated: valid.length });
}
