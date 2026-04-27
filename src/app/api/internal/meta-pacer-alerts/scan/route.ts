import { NextRequest, NextResponse } from 'next/server';
import { requireInternalJobAuth } from '@/lib/internal-jobs';
import { scanPacerAlerts } from '@/lib/notifications/service';

/**
 * POST /api/internal/meta-pacer-alerts/scan
 *
 * Cron-triggered scan of the Meta Ads Pacer dataset. Creates in-app
 * notifications and sends a per-recipient digest email summarising the
 * newly-created alerts. Idempotent within a 20-hour window per (ad, type).
 */
export async function POST(req: NextRequest) {
  const authError = requireInternalJobAuth(req);
  if (authError) return authError;

  try {
    const result = await scanPacerAlerts();
    const status = result.errors.length > 0 ? 207 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to scan pacer alerts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
