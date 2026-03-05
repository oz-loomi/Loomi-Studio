import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/roles';
import {
  readEspTemplateFolderStore,
  writeEspTemplateFolderStore,
  getAccountFolders,
  getAccountAssignments,
  createAccountFolder,
  folderExistsForAccount,
} from '@/lib/esp-template-folders-store';

function canAccessAccount(
  session: { user: { role: string; accountKeys?: string[] } },
  accountKey: string,
): boolean {
  const role = session.user.role;
  const userAccountKeys = session.user.accountKeys ?? [];
  if (role === 'developer' || role === 'super_admin') return true;
  if (role === 'admin' && userAccountKeys.length === 0) return true;
  return userAccountKeys.includes(accountKey);
}

export async function GET(req: NextRequest) {
  const { session, error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  const accountKey = req.nextUrl.searchParams.get('accountKey')?.trim();
  if (!accountKey) {
    return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
  }

  if (!canAccessAccount(session!, accountKey)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const store = readEspTemplateFolderStore();
  return NextResponse.json({
    folders: getAccountFolders(store, accountKey),
    assignments: getAccountAssignments(store, accountKey),
  });
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const body = await req.json();
    const accountKey = typeof body?.accountKey === 'string' ? body.accountKey.trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const parentId =
      typeof body?.parentId === 'string' && body.parentId.trim()
        ? body.parentId.trim()
        : null;

    if (!accountKey) {
      return NextResponse.json({ error: 'accountKey is required' }, { status: 400 });
    }
    if (!canAccessAccount(session!, accountKey)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (!name) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }

    const store = readEspTemplateFolderStore();
    if (parentId && !folderExistsForAccount(store, accountKey, parentId)) {
      return NextResponse.json({ error: 'Parent folder not found' }, { status: 404 });
    }

    const folder = createAccountFolder(store, accountKey, name, parentId);
    writeEspTemplateFolderStore(store);

    return NextResponse.json({ folder }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
