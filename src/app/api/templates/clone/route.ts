import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { MANAGEMENT_ROLES } from '@/lib/auth';
import * as templateService from '@/lib/services/templates';

export async function POST(req: NextRequest) {
  const { session, error } = await requireRole(...MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const { sourceDesign, newDesign } = await req.json();

    if (!sourceDesign) {
      return NextResponse.json({ error: 'Source design is required' }, { status: 400 });
    }

    const cloned = await templateService.cloneTemplate(sourceDesign, newDesign || undefined, session!.user.id);

    return NextResponse.json({
      success: true,
      design: cloned.slug,
      name: cloned.title,
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'Template already exists' }, { status: 409 });
    }
    const message = err?.message || 'Failed to clone template';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
