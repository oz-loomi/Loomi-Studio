import { NextRequest, NextResponse } from 'next/server';
import { PATHS } from '@/lib/paths';
import fs from 'fs';

function readClients(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(PATHS.client.clients, 'utf-8'));
  } catch {
    return {};
  }
}

function writeClients(data: Record<string, unknown>) {
  fs.writeFileSync(PATHS.client.clients, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET() {
  try {
    return NextResponse.json(readClients());
  } catch (err) {
    return NextResponse.json({ error: 'Could not read clients' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { key, dealer, category } = await req.json();
    if (!key || !dealer) {
      return NextResponse.json({ error: 'Missing key and dealer' }, { status: 400 });
    }
    const safeKey = key.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeKey) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
    }
    const clients = readClients();
    if (clients[safeKey]) {
      return NextResponse.json({ error: 'Client key already exists' }, { status: 409 });
    }
    clients[safeKey] = {
      dealer: dealer.trim(),
      category: category || 'General',
      logos: { light: '', dark: '' },
    };
    writeClients(clients);
    return NextResponse.json({ key: safeKey, ...(clients[safeKey] as Record<string, unknown>) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json();
    writeClients(data);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const key = req.nextUrl.searchParams.get('key');
    if (!key) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    }
    const clients = readClients();
    if (!clients[key]) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    delete clients[key];
    writeClients(clients);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
