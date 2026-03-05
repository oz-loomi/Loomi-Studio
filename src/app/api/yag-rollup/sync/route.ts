import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { ELEVATED_ROLES } from '@/lib/auth';
import { runYagRollupSync } from '@/lib/services/yag-rollup';
import type { YagRollupProgressEvent } from '@/lib/services/yag-rollup';

function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireRole(...ELEVATED_ROLES);
  if (error) return error;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
        } catch {
          // Stream closed by client
        }
      };

      send({ type: 'start', timestamp: new Date().toISOString() });

      try {
        const result = await runYagRollupSync({
          jobKey: typeof body.jobKey === 'string' ? body.jobKey : undefined,
          dryRun: body.dryRun === true,
          fullSync: body.fullSync === true,
          sourceAccountLimit: parseOptionalInt(body.sourceAccountLimit),
          maxUpserts: parseOptionalInt(body.maxUpserts),
          triggerSource: 'settings-ui',
          triggeredByUserId: session!.user.id,
          triggeredByUserName: session!.user.name || null,
          triggeredByUserEmail: session!.user.email || null,
          triggeredByUserRole: session!.user.role || null,
          triggeredByUserAvatarUrl: session!.user.avatarUrl || null,
          onProgress: (event: YagRollupProgressEvent) => {
            send({ type: 'progress', ...event });
          },
        });

        send({ type: 'done', result });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to run YAG rollup sync';
        send({ type: 'error', error: message });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
