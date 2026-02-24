import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/api-auth';
import fs from 'fs';
import path from 'path';

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

/**
 * GET /api/logos/[key]/[filename]
 *
 * Serves locally-stored logo files from data/logos/.
 * Next.js doesn't serve files added to /public after build,
 * so this route handles local fallback logos.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  // Require authentication (logos are behind auth)
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const segments = await params;
  const filePath = segments.path;

  // Expect exactly [key, filename] — e.g. /api/logos/myAccount/light.png
  if (!filePath || filePath.length !== 2) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const [key, fileName] = filePath;

  // Sanitize — prevent directory traversal
  if (key.includes('..') || fileName.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Try data/logos first (new location), then fall back to public/logos (legacy)
  const dataPath = path.join(process.cwd(), 'data', 'logos', key, fileName);
  const publicPath = path.join(process.cwd(), 'public', 'logos', key, fileName);

  const resolvedPath = fs.existsSync(dataPath)
    ? dataPath
    : fs.existsSync(publicPath)
      ? publicPath
      : null;

  if (!resolvedPath) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ext = path.extname(fileName).slice(1).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const fileBuffer = fs.readFileSync(resolvedPath);

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
