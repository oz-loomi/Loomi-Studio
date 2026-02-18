import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * Prisma client singleton.
 *
 * Currently uses SQLite via better-sqlite3 adapter for local development.
 *
 * For production (Railway with PostgreSQL):
 *   1. Change prisma/schema.prisma: provider = "postgresql"
 *   2. Set DATABASE_URL to the Postgres connection string
 *   3. Run: npx prisma generate && npx prisma db push
 *   4. Update this file to use PrismaClient without an adapter:
 *      ```
 *      const prisma = new PrismaClient();
 *      ```
 *   5. Remove @prisma/adapter-better-sqlite3 from dependencies
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
