import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma client singleton.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPool(connectionString: string) {
  const ssl = connectionString.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined;
  return new pg.Pool({ connectionString, ssl });
}

function createPrismaClient() {
  const candidate =
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@127.0.0.1:5432/loomi_studio?schema=public';
  if (!/^postgres(ql)?:\/\//.test(candidate)) {
    throw new Error('DATABASE_URL must be a PostgreSQL URL (postgresql://...)');
  }
  const pool = createPool(candidate);
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
