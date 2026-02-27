import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

function timingSafeCompare(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function readPresentedSecret(req: NextRequest): string {
  const headerSecret = req.headers.get('x-internal-job-secret')?.trim() || '';
  if (headerSecret) return headerSecret;

  const auth = req.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice('bearer '.length).trim();
  }

  return '';
}

export function requireInternalJobAuth(req: NextRequest): NextResponse | null {
  const expectedSecret = (process.env.INTERNAL_JOB_SECRET || '').trim();
  if (!expectedSecret) {
    return NextResponse.json(
      { error: 'INTERNAL_JOB_SECRET is not configured' },
      { status: 500 },
    );
  }

  const presentedSecret = readPresentedSecret(req);
  if (!presentedSecret || !timingSafeCompare(presentedSecret, expectedSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
