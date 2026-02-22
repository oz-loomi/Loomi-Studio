import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'src', 'data', 'ghl-variables.json');

function readVariables(): Record<string, { variable: string; label: string; description: string }[]> {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeVariables(data: Record<string, { variable: string; label: string; description: string }[]>) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n');
}

// GET — return all variable definitions
export async function GET() {
  const variables = readVariables();
  return NextResponse.json(variables);
}

// PUT — update variable definitions (admin can add custom variables)
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    writeVariables(body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
