/**
 * Seed script: inserts dummy EspTemplate rows for local testing.
 *
 * Usage:
 *   DATABASE_URL="postgresql://connorkelly@127.0.0.1:5432/loomi_studio?schema=public" npx tsx scripts/seed-templates.ts
 *
 * Pass --clean to delete all existing EspTemplate rows first.
 */

import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://connorkelly@127.0.0.1:5432/loomi_studio?schema=public',
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const clean = process.argv.includes('--clean');

// -- Template data per provider --

const ghlTemplates = [
  { name: 'June Service Special', subject: 'Your Honda needs a tune-up!', status: 'active', editorType: 'code' },
  { name: 'Welcome New Customer', subject: 'Welcome to the family!', status: 'active', editorType: 'code' },
  { name: 'Holiday Sales Event', subject: 'Huge holiday savings inside', status: 'draft', editorType: 'code' },
  { name: 'Parts Promo - Brakes', subject: '20% off brake pads this month', status: 'active', editorType: 'code' },
  { name: 'Monthly Newsletter', subject: 'Your monthly update', status: 'active', editorType: 'code' },
  { name: 'Trade-In Offer', subject: 'Get top dollar for your trade', status: 'draft', editorType: 'code' },
  { name: 'Anniversary Sale', subject: "It's our anniversary — celebrate with savings", status: 'active', editorType: 'code' },
  { name: 'Winter Prep Reminder', subject: 'Is your vehicle winter-ready?', status: 'active', editorType: 'code' },
  { name: 'Referral Program', subject: 'Refer a friend, earn rewards', status: 'draft', editorType: 'code' },
  { name: 'Test Drive Invitation', subject: 'Come test drive the all-new models', status: 'active', editorType: 'code' },
  { name: 'Customer Survey', subject: 'How did we do?', status: 'draft', editorType: 'code' },
  { name: 'Spring Clearance', subject: 'Spring clearance — everything must go', status: 'active', editorType: 'code' },
];

const klaviyoTemplates = [
  { name: 'Welcome Series - Email 1', subject: 'Welcome to Peak Outdoor Gear!', status: 'active', editorType: 'drag-and-drop' },
  { name: 'Welcome Series - Email 2', subject: 'Here are our top picks for you', status: 'active', editorType: 'drag-and-drop' },
  { name: 'Abandoned Cart Reminder', subject: 'You left something behind', status: 'active', editorType: 'drag-and-drop' },
  { name: 'Summer Sale Announce', subject: 'Summer sale starts now — up to 40% off', status: 'active', editorType: 'drag-and-drop' },
  { name: 'Product Launch - Hiking Boots', subject: 'Introducing our all-new TrailPro boots', status: 'draft', editorType: 'code' },
  { name: 'Re-engagement Campaign', subject: 'We miss you! Come back for 15% off', status: 'active', editorType: 'drag-and-drop' },
  { name: 'Post-Purchase Follow-up', subject: 'How are you enjoying your gear?', status: 'active', editorType: 'code' },
  { name: 'VIP Early Access', subject: 'VIP exclusive — shop new arrivals first', status: 'draft', editorType: 'drag-and-drop' },
  { name: 'Back in Stock Alert', subject: 'Good news — your item is back!', status: 'active', editorType: 'code' },
  { name: 'Holiday Gift Guide', subject: 'The ultimate outdoor gift guide', status: 'draft', editorType: 'drag-and-drop' },
];

const sampleHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Email</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="border:1px solid #e0e0e0;">
<tr><td style="padding:32px;text-align:center;background:#1e3a5f;color:#fff;">
<h1 style="margin:0;font-size:24px;">{{template_name}}</h1>
</td></tr>
<tr><td style="padding:24px;">
<p>This is a seed template for local development testing.</p>
<p><a href="#" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;">Call to Action</a></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function randomDaysAgo(min: number, max: number): Date {
  return daysAgo(Math.floor(Math.random() * (max - min + 1)) + min);
}

async function main() {
  const accounts = await prisma.account.findMany({
    select: { key: true, dealer: true, espProvider: true },
  });

  if (accounts.length === 0) {
    console.log('No accounts found in database. Nothing to seed.');
    return;
  }

  if (clean) {
    const deleted = await prisma.espTemplate.deleteMany({});
    console.log(`Cleaned ${deleted.count} existing template(s).`);
  }

  let created = 0;

  for (const account of accounts) {
    const provider = account.espProvider as 'ghl' | 'klaviyo';
    const templates = provider === 'klaviyo' ? klaviyoTemplates : ghlTemplates;

    for (const tpl of templates) {
      const createdAt = randomDaysAgo(7, 90);
      const updatedAt = randomDaysAgo(0, 6);

      await prisma.espTemplate.upsert({
        where: {
          accountKey_provider_remoteId: {
            accountKey: account.key,
            provider,
            remoteId: `seed-${account.key}-${tpl.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          },
        },
        update: {
          name: tpl.name,
          subject: tpl.subject,
          status: tpl.status,
          editorType: tpl.editorType,
          html: sampleHtml.replace('{{template_name}}', tpl.name),
          updatedAt,
        },
        create: {
          accountKey: account.key,
          provider,
          remoteId: `seed-${account.key}-${tpl.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          name: tpl.name,
          subject: tpl.subject,
          previewText: `Preview: ${tpl.subject}`,
          html: sampleHtml.replace('{{template_name}}', tpl.name),
          status: tpl.status,
          editorType: tpl.editorType,
          lastSyncedAt: randomDaysAgo(0, 3),
          createdAt,
          updatedAt,
        },
      });
      created++;
    }

    console.log(`  ${account.dealer} (${provider}): ${templates.length} templates`);
  }

  console.log(`\nDone — ${created} template(s) seeded across ${accounts.length} account(s).`);
}

main()
  .catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
