/**
 * Backfill script: generates slugs for any Account rows that lack one.
 * Idempotent — safe to run on every deploy.
 * Run after `prisma db push` so the nullable slug column exists.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

function dealerToSlug(dealer: string): string {
  return dealer
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main() {
  const accounts = await prisma.account.findMany({
    where: { slug: null },
    select: { id: true, key: true, dealer: true, city: true },
    orderBy: { createdAt: 'asc' },
  });

  if (accounts.length === 0) {
    console.log('[backfill-slugs] All accounts already have slugs.');
    return;
  }

  console.log(`[backfill-slugs] Found ${accounts.length} accounts without slugs.`);

  // Collect existing slugs to avoid collisions
  const existing = await prisma.account.findMany({
    where: { slug: { not: null } },
    select: { slug: true },
  });
  const usedSlugs = new Set(existing.map((a) => a.slug));

  for (const account of accounts) {
    let base = dealerToSlug(account.dealer);
    if (!base) base = 'account';

    let slug = base;

    // If collision, try appending city
    if (usedSlugs.has(slug) && account.city) {
      slug = `${base}-${dealerToSlug(account.city)}`;
    }

    // If still collision, use numeric suffix
    let counter = 2;
    while (usedSlugs.has(slug)) {
      slug = `${base}-${counter}`;
      counter++;
    }

    await prisma.account.update({
      where: { id: account.id },
      data: { slug },
    });
    usedSlugs.add(slug);
    console.log(`[backfill-slugs] ${account.key} → ${slug}`);
  }

  console.log(`[backfill-slugs] Done. Backfilled ${accounts.length} slugs.`);
}

main()
  .catch((e) => {
    console.error('[backfill-slugs] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
