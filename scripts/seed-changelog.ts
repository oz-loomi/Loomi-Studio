import { config } from 'dotenv';
config();

import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://connorkelly@127.0.0.1:5432/loomi_studio?schema=public';

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seed() {
  const entries = [
    {
      title: 'Colored Toast Notifications',
      content:
        'Toast notifications now have color-coded backgrounds — green for success, red for errors, amber for warnings, and blue for info messages. Works in both dark and light themes.',
      type: 'improvement',
      createdBy: 'Claude',
      publishedAt: new Date('2026-02-21T15:00:00Z'),
    },
    {
      title: 'Floating Changelog Panel',
      content:
        'The changelog panel now matches the navigation sidebar style — a floating rounded panel with glass styling instead of the previous edge-to-edge design.',
      type: 'improvement',
      createdBy: 'Claude',
      publishedAt: new Date('2026-02-21T14:00:00Z'),
    },
    {
      title: 'In-App Changelog',
      content:
        'Added this changelog panel! Click the clock icon in the header to see recent updates. Developers and admins can create, edit, and delete entries. An unread dot indicator appears when new entries are available.',
      type: 'feature',
      createdBy: 'Claude',
      publishedAt: new Date('2026-02-21T13:00:00Z'),
    },
    {
      title: 'Template Preview & Scrolling',
      content:
        'Added preview modals to both Account Templates and Template Library pages. Click any template card or use the View option in the dropdown menu to see a full scrollable preview without entering the editor. The TemplatePreview component now supports an interactive mode for modal contexts.',
      type: 'feature',
      createdBy: 'Claude',
      publishedAt: new Date('2026-02-21T12:00:00Z'),
    },
    {
      title: 'Template Page Consistency',
      content:
        'Aligned the UI between Account Templates and Template Library — consistent search bars with magnifying glass icons, matching font sizes, button styling, and header layouts across both pages.',
      type: 'improvement',
      createdBy: 'Claude',
      publishedAt: new Date('2026-02-21T11:00:00Z'),
    },
    {
      title: 'Save to Template Library',
      content:
        'When saving a template in the builder, admins now see a "Save to Template Library" checkbox. Checking it publishes the template to the shared library, making it available for all accounts.',
      type: 'feature',
      createdBy: 'Claude',
      publishedAt: new Date('2026-02-21T10:00:00Z'),
    },
    {
      title: 'Simplified Templates Page',
      content:
        'Removed the Accounts card overview from the Templates page. Admins now see a single flat list with an account filter dropdown. The Create button is always visible for admins — if no account is selected, a picker step appears in the create modal.',
      type: 'improvement',
      createdBy: 'Claude',
      publishedAt: new Date('2026-02-21T09:00:00Z'),
    },
  ];

  for (const entry of entries) {
    await prisma.changelogEntry.create({ data: entry });
  }

  console.log(`Seeded ${entries.length} changelog entries`);
  await prisma.$disconnect();
  await pool.end();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
