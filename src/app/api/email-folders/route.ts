import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import * as folderService from '@/lib/services/folders';
import { prisma } from '@/lib/prisma';
import { foldersMapToArray, foldersArrayToMap } from '@/lib/email-folders-payload';

type FolderPutBody = {
  accountKey?: string | null;
  folders?: Array<{ name?: unknown; emailIds?: unknown }>;
};

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const accountKey = req.nextUrl.searchParams.get('accountKey') || undefined;
  const folders = await folderService.getFolders(accountKey);
  return NextResponse.json({
    folders: folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      accountKey: folder.accountKey,
      emailIds: folder.emails.map((email) => email.id),
    })),
  });
}

export async function PUT(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const body = await req.json() as FolderPutBody;
    const accountKey = typeof body.accountKey === 'string' && body.accountKey.trim()
      ? body.accountKey.trim()
      : undefined;
    if (!Array.isArray(body.folders)) {
      return NextResponse.json({ error: 'folders array is required' }, { status: 400 });
    }

    const desiredAssignments = foldersArrayToMap(
      body.folders.map((folder) => ({
        name: typeof folder?.name === 'string' ? folder.name : '',
        emailIds: Array.isArray(folder?.emailIds) ? (folder.emailIds as string[]) : [],
      })),
    );
    const desiredFolders = foldersMapToArray(desiredAssignments);

    const existingFolders = await folderService.getFolders(accountKey);
    const existingByName = new Map(existingFolders.map((folder) => [folder.name, folder]));
    const desiredNames = new Set(desiredFolders.map((folder) => folder.name));

    for (const folder of desiredFolders) {
      if (!existingByName.has(folder.name)) {
        await folderService.createFolder(folder.name, accountKey);
      }
    }

    for (const existing of existingFolders) {
      if (!desiredNames.has(existing.name)) {
        await folderService.deleteFolder(existing.id);
      }
    }

    const currentFolders = await folderService.getFolders(accountKey);
    const folderByName = new Map(currentFolders.map((folder) => [folder.name, folder]));
    const folderIdsInScope = currentFolders.map((folder) => folder.id);

    if (folderIdsInScope.length > 0) {
      await prisma.accountEmail.updateMany({
        where: {
          folderId: { in: folderIdsInScope },
          ...(accountKey ? { accountKey } : {}),
        },
        data: { folderId: null },
      });
    }

    for (const folder of desiredFolders) {
      const targetFolder = folderByName.get(folder.name);
      if (!targetFolder || folder.emailIds.length === 0) continue;
      await prisma.accountEmail.updateMany({
        where: {
          id: { in: folder.emailIds },
          ...(accountKey ? { accountKey } : {}),
        },
        data: { folderId: targetFolder.id },
      });
    }

    const updatedFolders = await folderService.getFolders(accountKey);
    return NextResponse.json({
      success: true,
      folders: updatedFolders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        accountKey: folder.accountKey,
        emailIds: folder.emails.map((email) => email.id),
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
