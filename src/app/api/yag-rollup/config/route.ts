import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import { isYagRollupAccount } from '@/lib/accounts/rollup';
import {
  getYagRollupConfigSnapshot,
  upsertYagRollupConfig,
} from '@/lib/services/yag-rollup';

function scopedAccountKeysForSession(session: {
  user: { role: string; accountKeys?: string[] };
}): string[] | undefined {
  if (session.user.role === 'developer' || session.user.role === 'super_admin') {
    return undefined;
  }
  return session.user.accountKeys ?? [];
}

function parseStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

export async function GET() {
  const { session, error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const scopedAccountKeys = scopedAccountKeysForSession(session!);
    const snapshot = await getYagRollupConfigSnapshot(scopedAccountKeys);
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read YAG rollup config';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { session, error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const scopedAccountKeys = scopedAccountKeysForSession(session!);
    const snapshot = await getYagRollupConfigSnapshot(scopedAccountKeys);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    const accountSet = new Set(snapshot.accountOptions.map((account) => account.key));
    const dealerByKey = new Map(snapshot.accountOptions.map((account) => [account.key, account.dealer]));

    const requestedTargetKey = typeof body.targetAccountKey === 'string'
      ? body.targetAccountKey.trim()
      : snapshot.config.targetAccountKey;
    if (!requestedTargetKey || !accountSet.has(requestedTargetKey)) {
      return NextResponse.json({ error: 'A valid targetAccountKey is required' }, { status: 400 });
    }
    if (!isYagRollupAccount(requestedTargetKey, dealerByKey.get(requestedTargetKey))) {
      return NextResponse.json(
        { error: 'targetAccountKey must be the Young Automotive Group rollup account' },
        { status: 400 },
      );
    }

    const requestedSourceKeysRaw = body.sourceAccountKeys === undefined
      ? snapshot.config.sourceAccountKeys
      : parseStringArray(body.sourceAccountKeys);
    const requestedSourceKeys = [...new Set(requestedSourceKeysRaw)]
      .filter((key) => accountSet.has(key))
      .filter((key) => key !== requestedTargetKey)
      .filter((key) => !isYagRollupAccount(key, dealerByKey.get(key)));

    if (requestedSourceKeys.length === 0) {
      return NextResponse.json(
        { error: 'sourceAccountKeys must include at least one non-YAG source account' },
        { status: 400 },
      );
    }

    const enabled = typeof body.enabled === 'boolean'
      ? body.enabled
      : snapshot.config.enabled;
    const scrubInvalidEmails = typeof body.scrubInvalidEmails === 'boolean'
      ? body.scrubInvalidEmails
      : snapshot.config.scrubInvalidEmails;
    const scrubInvalidPhones = typeof body.scrubInvalidPhones === 'boolean'
      ? body.scrubInvalidPhones
      : snapshot.config.scrubInvalidPhones;

    await upsertYagRollupConfig({
      targetAccountKey: requestedTargetKey,
      sourceAccountKeys: requestedSourceKeys,
      enabled,
      scrubInvalidEmails,
      scrubInvalidPhones,
      updatedByUserId: session!.user.id,
    });

    const updated = await getYagRollupConfigSnapshot(scopedAccountKeys);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save YAG rollup config';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
