import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'src', 'data', 'component-tags.json');

interface ComponentTagData {
  tags: string[];
  assignments: Record<string, string[]>;
}

function ensureDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readTags(): ComponentTagData {
  ensureDir();
  if (!fs.existsSync(DATA_FILE)) return { tags: [], assignments: {} };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { tags: [], assignments: {} };
  }
}

function writeTags(data: ComponentTagData) {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET() {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  return NextResponse.json(readTags());
}

export async function PUT(req: NextRequest) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  try {
    const body = await req.json();
    writeTags(body);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
