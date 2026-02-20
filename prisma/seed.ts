import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const candidate =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:5432/loomi_studio?schema=public';
if (!/^postgres(ql)?:\/\//.test(candidate)) {
  throw new Error('DATABASE_URL must be a PostgreSQL URL (postgresql://...)');
}
const adapter = new PrismaPg({ connectionString: candidate });
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
