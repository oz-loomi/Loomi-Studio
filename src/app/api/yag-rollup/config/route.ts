import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { ELEVATED_ROLES } from '@/lib/auth';
import { isYagRollupAccount } from '@/lib/accounts/rollup';
import {
  createYagRollupJob,
  getYagRollupConfigSnapshot,
  isValidYagRollupJobKey,
  listYagRollupConfigHistory,
  listYagRollupJobs,
  listYagRollupRunHistory,
  normalizeYagRollupJobKey,
  normalizeYagRollupJobKeyForRoute,
  upsertYagRollupConfig,
} from '@/lib/services/yag-rollup';

const HISTORY_LIMIT = 25;

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

function parseBoundedInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseJobKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

async function loadConfigResponse(scopedAccountKeys?: string[], jobKey?: string) {
  const [snapshot, history, runHistory, jobs] = await Promise.all([
    getYagRollupConfigSnapshot(scopedAccountKeys, jobKey),
    listYagRollupConfigHistory(HISTORY_LIMIT, jobKey),
    listYagRollupRunHistory(HISTORY_LIMIT, jobKey),
    listYagRollupJobs(),
  ]);
  return {
    ...snapshot,
    history,
    runHistory,
    jobs,
    activeJobKey: normalizeYagRollupJobKeyForRoute(normalizeYagRollupJobKey(jobKey)),
  };
}

export async function GET(req: NextRequest) {
  const { session, error } = await requireRole(...ELEVATED_ROLES);
  if (error) return error;

  try {
    const jobKey = parseJobKey(req.nextUrl.searchParams.get('jobKey'));
    const scopedAccountKeys = scopedAccountKeysForSession(session!);
    const snapshot = await loadConfigResponse(scopedAccountKeys, jobKey);
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read YAG rollup config';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireRole(...ELEVATED_ROLES);
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const jobKey = parseJobKey(body.jobKey);
    if (!jobKey || !isValidYagRollupJobKey(jobKey)) {
      return NextResponse.json(
        { error: 'jobKey is required and must use lowercase letters, numbers, and hyphens' },
        { status: 400 },
      );
    }

    await createYagRollupJob(jobKey);

    const scopedAccountKeys = scopedAccountKeysForSession(session!);
    const snapshot = await loadConfigResponse(scopedAccountKeys, jobKey);
    return NextResponse.json(snapshot, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create YAG rollup job';
    const status = message.includes('already exists')
      ? 409
      : message.includes('jobKey must')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: NextRequest) {
  const { session, error } = await requireRole(...ELEVATED_ROLES);
  if (error) return error;

  try {
    const requestedQueryJobKey = parseJobKey(req.nextUrl.searchParams.get('jobKey'));
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const requestedBodyJobKey = parseJobKey(body.jobKey);
    const requestedJobKey = requestedBodyJobKey || requestedQueryJobKey;

    const scopedAccountKeys = scopedAccountKeysForSession(session!);
    const snapshot = await getYagRollupConfigSnapshot(scopedAccountKeys, requestedJobKey);

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
    const scheduleIntervalHours = parseBoundedInt(
      body.scheduleIntervalHours,
      snapshot.config.scheduleIntervalHours,
      1,
      24,
    );
    const scheduleMinuteUtc = parseBoundedInt(
      body.scheduleMinuteUtc,
      snapshot.config.scheduleMinuteUtc,
      0,
      55,
    );
    if (scheduleMinuteUtc % 5 !== 0) {
      return NextResponse.json(
        { error: 'scheduleMinuteUtc must be in 5-minute increments (0, 5, 10, ... 55)' },
        { status: 400 },
      );
    }
    const fullSyncEnabled = typeof body.fullSyncEnabled === 'boolean'
      ? body.fullSyncEnabled
      : snapshot.config.fullSyncEnabled;
    const fullSyncHourUtc = parseBoundedInt(
      body.fullSyncHourUtc,
      snapshot.config.fullSyncHourUtc,
      0,
      23,
    );
    const fullSyncMinuteUtc = parseBoundedInt(
      body.fullSyncMinuteUtc,
      snapshot.config.fullSyncMinuteUtc,
      0,
      55,
    );
    if (fullSyncMinuteUtc % 5 !== 0) {
      return NextResponse.json(
        { error: 'fullSyncMinuteUtc must be in 5-minute increments (0, 5, 10, ... 55)' },
        { status: 400 },
      );
    }
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
      scheduleIntervalHours,
      scheduleMinuteUtc,
      fullSyncEnabled,
      fullSyncHourUtc,
      fullSyncMinuteUtc,
      scrubInvalidEmails,
      scrubInvalidPhones,
      updatedByUserId: session!.user.id,
      updatedByUserName: session!.user.name || null,
      updatedByUserEmail: session!.user.email || null,
      updatedByUserRole: session!.user.role || null,
      updatedByUserAvatarUrl: session!.user.avatarUrl || null,
    }, requestedJobKey);

    const updated = await loadConfigResponse(scopedAccountKeys, requestedJobKey);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save YAG rollup config';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
