import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const candidate =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:5432/loomi_studio?schema=public';
if (!/^postgres(ql)?:\/\//.test(candidate)) {
  throw new Error('DATABASE_URL must be a PostgreSQL URL (postgresql://...)');
}
const needsSsl = /[?&]sslmode=require/.test(candidate);
const cleanUrl = candidate.replace(/[?&]sslmode=require/, (m) =>
  m.startsWith('?') ? '?' : '',
).replace(/\?$/, '');
const pool = new pg.Pool({
  connectionString: cleanUrl,
  ...(needsSsl && { ssl: { rejectUnauthorized: false } }),
});
const adapter = new PrismaPg(pool);
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

  // ── Seed test accounts ──
  const accounts = [
    {
      key: 'youngHondaOgden',
      dealer: 'Young Honda Ogden',
      category: 'Automotive',
      oem: 'Honda',
      oems: JSON.stringify(['Honda']),
      espProvider: 'ghl',
      email: 'info@younghondaogden.com',
      phone: '(801) 555-1001',
      city: 'Ogden',
      state: 'UT',
      postalCode: '84401',
      website: 'https://younghondaogden.com',
      timezone: 'US/Mountain',
    },
    {
      key: 'ridersEdgePowersports',
      dealer: "Rider's Edge Powersports",
      category: 'Powersports',
      oem: 'Kawasaki',
      oems: JSON.stringify(['Kawasaki', 'Yamaha', 'Can-Am']),
      espProvider: 'ghl',
      email: 'sales@ridersedgeps.com',
      phone: '(385) 555-2020',
      city: 'Draper',
      state: 'UT',
      postalCode: '84020',
      website: 'https://ridersedgepowersports.com',
      timezone: 'US/Mountain',
    },
    {
      key: 'peakOutdoorGear',
      dealer: 'Peak Outdoor Gear',
      category: 'Ecommerce',
      espProvider: 'klaviyo',
      email: 'support@peakoutdoorgear.com',
      phone: '(801) 555-3030',
      website: 'https://peakoutdoorgear.com',
      timezone: 'US/Mountain',
    },
  ];

  for (const account of accounts) {
    const result = await prisma.account.upsert({
      where: { key: account.key },
      update: {},
      create: account,
    });
    console.log(`Seeded account: ${result.dealer} (${result.category})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
