import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'src', 'data', 'component-folders.json');

function ensureDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readFolders(): Record<string, string[]> {
  ensureDir();
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeFolders(data: Record<string, string[]>) {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET() {
  return NextResponse.json(readFolders());
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    writeFolders(body);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
