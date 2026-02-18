import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import * as accountEmailService from '@/lib/services/account-emails';

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const accountKey = req.nextUrl.searchParams.get('accountKey');
  if (accountKey) {
    const emails = await accountEmailService.getAccountEmails(accountKey);
    return NextResponse.json(emails);
  }
  const emails = await accountEmailService.getAllEmails();
  return NextResponse.json(emails);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const { name, templateId, accountKey } = await req.json();
    const targetAccountKey = String(accountKey || '').trim();

    if (!name || !targetAccountKey) {
      return NextResponse.json({ error: 'Missing name and accountKey' }, { status: 400 });
    }

    if (!templateId) {
      return NextResponse.json({ error: 'Missing templateId' }, { status: 400 });
    }

    const email = await accountEmailService.createAccountEmail({
      accountKey: targetAccountKey,
      templateId,
      name,
    });

    return NextResponse.json(email);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const email = await accountEmailService.updateAccountEmail(id, updates);
    return NextResponse.json(email);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    await accountEmailService.deleteAccountEmail(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
