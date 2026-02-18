import 'dotenv/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client.js';
import bcryptjs from 'bcryptjs';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? 'file:./dev.db',
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const hashedPassword = await bcryptjs.hash('admin123', 12);

  const user = await prisma.user.upsert({
    where: { email: 'connor@ozmarketing.com' },
    update: {},
    create: {
      name: 'Connor Kelly',
      email: 'connor@ozmarketing.com',
      password: hashedPassword,
      role: 'developer',
      accountKeys: '[]',
    },
  });

  console.log('Seeded developer user:', user.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
