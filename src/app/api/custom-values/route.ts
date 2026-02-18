import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import '@/lib/esp/init';
import { getDefaultEspProvider } from '@/lib/esp/registry';

type CustomValueDef = { name: string; value: string };

const DEFAULTS_KEY = '_customValueDefaults';

/**
 * Read the global custom value defaults stored as a special Account record.
 */
async function readDefaults(): Promise<Record<string, CustomValueDef>> {
  const record = await prisma.account.findUnique({ where: { key: DEFAULTS_KEY } });
  if (!record?.customValues) return {};
  try {
    return JSON.parse(record.customValues);
  } catch {
    return {};
  }
}

/**
 * Write the global custom value defaults to the special Account record.
 */
async function writeDefaults(defaults: Record<string, CustomValueDef>): Promise<void> {
  const serialized = JSON.stringify(defaults);
  const defaultProvider = getDefaultEspProvider();
  await prisma.account.upsert({
    where: { key: DEFAULTS_KEY },
    update: { customValues: serialized },
    create: { key: DEFAULTS_KEY, dealer: '_system', customValues: serialized, espProvider: defaultProvider },
  });
}

/**
 * GET /api/custom-values
 *
 * Returns the global custom value defaults stored in _customValueDefaults.
 */
export async function GET() {
  const { error } = await requireRole('developer');
  if (error) return error;

  const defaults = await readDefaults();
  return NextResponse.json({ defaults });
}

/**
 * PUT /api/custom-values
 *
 * Updates the global custom value defaults.
 * Body: Record<string, { name: string; value: string }>
 */
export async function PUT(req: NextRequest) {
  const { error } = await requireRole('developer');
  if (error) return error;

  try {
    const body = await req.json() as { defaults: Record<string, CustomValueDef> } | Record<string, CustomValueDef>;

    // Support both { defaults: {...} } and raw {...} formats
    const defaults: Record<string, CustomValueDef> = 'defaults' in body && body.defaults && typeof body.defaults === 'object'
      ? body.defaults as Record<string, CustomValueDef>
      : body as Record<string, CustomValueDef>;

    // Validate structure
    for (const [key, def] of Object.entries(defaults)) {
      if (!key || typeof key !== 'string') {
        return NextResponse.json({ error: `Invalid field key: ${key}` }, { status: 400 });
      }
      if (!def || typeof def.name !== 'string') {
        return NextResponse.json({ error: `Missing name for key "${key}"` }, { status: 400 });
      }
      if (typeof def.value !== 'string') {
        return NextResponse.json({ error: `Missing value for key "${key}"` }, { status: 400 });
      }
    }

    await writeDefaults(defaults);

    return NextResponse.json({ defaults });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
