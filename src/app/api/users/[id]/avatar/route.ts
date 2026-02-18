import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function extensionFromMimeType(mimeType: string): string | null {
  const extensions: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
  };

  return extensions[mimeType] || null;
}

function clearAvatarFiles(userId: string, avatarDir: string) {
  if (!fs.existsSync(avatarDir)) return;

  const files = fs.readdirSync(avatarDir);
  for (const file of files) {
    if (file.startsWith(`${userId}-`)) {
      fs.unlinkSync(path.join(avatarDir, file));
    }
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file upload' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: PNG, JPG, WebP' },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB' },
        { status: 400 },
      );
    }

    const ext = extensionFromMimeType(file.type);
    if (!ext) {
      return NextResponse.json({ error: 'Unsupported image format' }, { status: 400 });
    }

    const avatarDir = path.join(process.cwd(), 'public', 'avatars');
    if (!fs.existsSync(avatarDir)) {
      fs.mkdirSync(avatarDir, { recursive: true });
    }

    clearAvatarFiles(id, avatarDir);

    const fileName = `${id}-${Date.now()}.${ext}`;
    const filePath = path.join(avatarDir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    const avatarUrl = `/avatars/${fileName}`;

    await prisma.user.update({
      where: { id },
      data: { avatarUrl },
    });

    return NextResponse.json({ avatarUrl });
  } catch (err) {
    console.error('Avatar upload failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const avatarDir = path.join(process.cwd(), 'public', 'avatars');
    clearAvatarFiles(id, avatarDir);

    await prisma.user.update({
      where: { id },
      data: { avatarUrl: null },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Avatar delete failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Delete failed' },
      { status: 500 },
    );
  }
}
