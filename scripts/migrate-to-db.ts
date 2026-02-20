/**
 * migrate-to-db.ts
 *
 * One-time migration script to load existing JSON/filesystem data into the database.
 *
 * Usage:
 *   npx tsx scripts/migrate-to-db.ts
 *
 * What it migrates:
 *   1. Accounts from rooftops.json → Account table
 *   2. Design templates from email-engine/src/templates/ → Template table
 *   3. Template tags from template-tags.json → TemplateTag + TemplateTagAssignment tables
 *   4. Template categories from template-categories.json → Template.category field
 *   5. Template version history from src/data/template-history/ → TemplateVersion table
 *   6. Email folders from email-folders.json → EmailFolder table
 *   7. Account emails from emails.json → AccountEmail table
 *
 * Safe to run multiple times — uses upsert where possible and skips existing records.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const STUDIO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
const ENGINE_ROOT = path.join(STUDIO_ROOT, 'email-engine');
const DATA_DIR = path.join(STUDIO_ROOT, 'src', 'data');
const CLIENT_ROOT = path.resolve(STUDIO_ROOT, '..', 'clients', 'young-automotive-group');
const DEFAULT_ESP_PROVIDER = (
  process.env.LOOMI_DEFAULT_ESP_PROVIDER ||
  process.env.DEFAULT_ESP_PROVIDER ||
  ''
).trim().toLowerCase();

function readJsonSafe<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function log(emoji: string, message: string) {
  console.log(`${emoji}  ${message}`);
}

// ── 1. Migrate Accounts ──

async function migrateAccounts() {
  const rooftopsPath = path.join(CLIENT_ROOT, 'src', 'data', 'rooftops.json');
  const rooftops = readJsonSafe<Record<string, Record<string, unknown>>>(rooftopsPath);

  if (!rooftops) {
    log('⚠️', 'No rooftops.json found — skipping accounts');
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const [key, data] of Object.entries(rooftops)) {
    if (key.startsWith('_')) continue; // Skip metadata like _customValueDefaults

    const existing = await prisma.account.findUnique({ where: { key } });
    if (existing) {
      skipped++;
      continue;
    }

    const espProviderRaw =
      typeof data.espProvider === 'string'
        ? data.espProvider.trim().toLowerCase()
        : '';

    const resolvedProvider = espProviderRaw || DEFAULT_ESP_PROVIDER;
    if (!resolvedProvider) {
      throw new Error(
        `Account "${key}" is missing espProvider and no default provider is configured. Set LOOMI_DEFAULT_ESP_PROVIDER or DEFAULT_ESP_PROVIDER.`,
      );
    }

    await prisma.account.create({
      data: {
        key,
        dealer: String(data.dealer || key),
        espProvider: resolvedProvider,
        category: data.category ? String(data.category) : null,
        oem: data.oem ? String(data.oem) : null,
        oems: data.oems ? JSON.stringify(data.oems) : null,
        email: data.email ? String(data.email) : null,
        phone: data.phone ? String(data.phone) : null,
        salesPhone: data.salesPhone ? String(data.salesPhone) : null,
        servicePhone: data.servicePhone ? String(data.servicePhone) : null,
        partsPhone: data.partsPhone ? String(data.partsPhone) : null,
        address: data.address ? String(data.address) : null,
        city: data.city ? String(data.city) : null,
        state: data.state ? String(data.state) : null,
        postalCode: data.postalCode ? String(data.postalCode) : null,
        website: data.website ? String(data.website) : null,
        timezone: data.timezone ? String(data.timezone) : null,
        logos: data.logos ? JSON.stringify(data.logos) : null,
        branding: data.branding ? JSON.stringify(data.branding) : null,
        customValues: data.customValues ? JSON.stringify(data.customValues) : null,
      },
    });
    created++;
  }

  log('✅', `Accounts: ${created} created, ${skipped} skipped (already existed)`);
}

// ── 2. Migrate Design Templates ──

async function migrateDesignTemplates() {
  const templatesDir = path.join(ENGINE_ROOT, 'src', 'templates');
  if (!fs.existsSync(templatesDir)) {
    log('⚠️', 'No email-engine/src/templates/ directory — skipping design templates');
    return;
  }

  const templateDirs = fs.readdirSync(templatesDir).filter((d) => {
    const stat = fs.statSync(path.join(templatesDir, d));
    return stat.isDirectory() && !d.startsWith('_');
  });

  let created = 0;
  let skipped = 0;

  for (const slug of templateDirs) {
    const templateFile = path.join(templatesDir, slug, 'template.html');
    if (!fs.existsSync(templateFile)) continue;

    const existing = await prisma.template.findUnique({ where: { slug } });
    if (existing) {
      skipped++;
      continue;
    }

    const content = fs.readFileSync(templateFile, 'utf-8');

    // Extract title from frontmatter
    const titleMatch = content.match(/title:\s*["']?(.+?)["']?\s*$/m);
    const title = titleMatch
      ? titleMatch[1]
      : slug
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

    // Extract preheader from frontmatter
    const preheaderMatch = content.match(/preheader:\s*["']?(.+?)["']?\s*$/m);
    const preheader = preheaderMatch ? preheaderMatch[1] : null;

    await prisma.template.create({
      data: {
        slug,
        title,
        type: 'design',
        content,
        preheader,
      },
    });
    created++;
  }

  log('✅', `Design templates: ${created} created, ${skipped} skipped`);
}

// ── 3. Migrate Template Categories ──

async function migrateCategories() {
  const categoriesPath = path.join(DATA_DIR, 'template-categories.json');
  const categories = readJsonSafe<Record<string, string[]>>(categoriesPath);

  if (!categories) {
    log('⚠️', 'No template-categories.json — skipping categories');
    return;
  }

  let updated = 0;
  for (const [category, slugs] of Object.entries(categories)) {
    for (const slug of slugs) {
      try {
        await prisma.template.update({
          where: { slug },
          data: { category },
        });
        updated++;
      } catch {
        // Template might not exist in DB yet — skip
      }
    }
  }

  log('✅', `Template categories: ${updated} templates categorized`);
}

// ── 4. Migrate Template Tags ──

async function migrateTags() {
  const tagsPath = path.join(DATA_DIR, 'template-tags.json');
  const tagsData = readJsonSafe<{
    tags: string[];
    assignments: Record<string, string[]>;
  }>(tagsPath);

  if (!tagsData) {
    log('⚠️', 'No template-tags.json — skipping tags');
    return;
  }

  // Create tags
  let tagCount = 0;
  for (const tagName of tagsData.tags) {
    await prisma.templateTag.upsert({
      where: { name: tagName },
      create: { name: tagName },
      update: {},
    });
    tagCount++;
  }

  // Create assignments
  let assignmentCount = 0;
  for (const [designPath, tagNames] of Object.entries(tagsData.assignments)) {
    // Assignment keys are "slug/template" — extract just the slug
    const slug = designPath.split('/')[0];
    const template = await prisma.template.findUnique({ where: { slug } });
    if (!template) continue;

    for (const tagName of tagNames) {
      const tag = await prisma.templateTag.findUnique({ where: { name: tagName } });
      if (!tag) continue;

      try {
        await prisma.templateTagAssignment.create({
          data: { templateId: template.id, tagId: tag.id },
        });
        assignmentCount++;
      } catch {
        // Already exists — skip (unique constraint)
      }
    }
  }

  log('✅', `Tags: ${tagCount} tags, ${assignmentCount} assignments`);
}

// ── 5. Migrate Template Version History ──

async function migrateVersionHistory() {
  const historyRoot = path.join(DATA_DIR, 'template-history');
  if (!fs.existsSync(historyRoot)) {
    log('⚠️', 'No template-history/ directory — skipping version history');
    return;
  }

  let versionCount = 0;

  // Traverse: template-history/{project}/{slug}/template/*.html
  const projects = fs.readdirSync(historyRoot);
  for (const project of projects) {
    const projectDir = path.join(historyRoot, project);
    if (!fs.statSync(projectDir).isDirectory()) continue;

    const slugDirs = fs.readdirSync(projectDir);
    for (const slug of slugDirs) {
      const templateVersionDir = path.join(projectDir, slug, 'template');
      if (!fs.existsSync(templateVersionDir)) continue;

      const template = await prisma.template.findUnique({ where: { slug } });
      if (!template) continue;

      const versionFiles = fs.readdirSync(templateVersionDir)
        .filter((f) => f.endsWith('.html'))
        .sort(); // chronological order

      // Check existing versions to avoid duplicates
      const existingVersions = await prisma.templateVersion.findMany({
        where: { templateId: template.id },
        select: { content: true },
      });
      const existingContents = new Set(existingVersions.map((v) => v.content));

      for (const versionFile of versionFiles) {
        const content = fs.readFileSync(path.join(templateVersionDir, versionFile), 'utf-8');

        // Skip if this content already exists as a version
        if (existingContents.has(content)) continue;

        // Parse timestamp from filename: "2026-02-13T10-17-21-209Z-96e018.html"
        const tsMatch = versionFile.match(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
        let createdAt = new Date();
        if (tsMatch) {
          const isoStr = `${tsMatch[1]}:${tsMatch[2]}:${tsMatch[3]}.${tsMatch[4]}Z`;
          const parsed = new Date(isoStr);
          if (!isNaN(parsed.getTime())) createdAt = parsed;
        }

        await prisma.templateVersion.create({
          data: {
            templateId: template.id,
            content,
            createdAt,
          },
        });
        versionCount++;
      }
    }
  }

  log('✅', `Template versions: ${versionCount} snapshots migrated`);
}

// ── 6. Migrate Email Folders ──

async function migrateEmailFolders() {
  const foldersPath = path.join(DATA_DIR, 'email-folders.json');
  const folders = readJsonSafe<Record<string, string[]>>(foldersPath);

  if (!folders || Object.keys(folders).length === 0) {
    log('⚠️', 'No email-folders.json or empty — skipping folders');
    return;
  }

  let created = 0;
  for (const folderName of Object.keys(folders)) {
    try {
      await prisma.emailFolder.create({
        data: { name: folderName },
      });
      created++;
    } catch {
      // Already exists
    }
  }

  log('✅', `Email folders: ${created} created`);
}

// ── 7. Migrate Account Emails ──

async function migrateEmails() {
  const emailsPath = path.join(DATA_DIR, 'emails.json');
  const emailsData = readJsonSafe<{ emails: Array<Record<string, unknown>> }>(emailsPath);

  if (!emailsData?.emails || emailsData.emails.length === 0) {
    log('⚠️', 'No emails.json or empty — skipping account emails');
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const email of emailsData.emails) {
    const id = email.id as string;
    const client = email.client as string;
    const name = email.name as string;
    const templateRef = email.templateRef as string | undefined;

    if (!id || !client || !name) {
      skipped++;
      continue;
    }

    // Resolve template from templateRef (format: "slug/template")
    let templateId: string | null = null;
    if (templateRef) {
      const slug = templateRef.split('/')[0];
      const template = await prisma.template.findUnique({ where: { slug } });
      if (template) templateId = template.id;
    }

    if (!templateId) {
      skipped++;
      continue;
    }

    try {
      await prisma.accountEmail.create({
        data: {
          id, // Preserve original ID
          accountKey: client,
          templateId,
          name,
          content: (email.customHtml as string) || null,
          status: (email.status as string) || 'draft',
        },
      });
      created++;
    } catch {
      skipped++; // FK constraint or duplicate
    }
  }

  log('✅', `Account emails: ${created} created, ${skipped} skipped`);
}

// ── Main ──

async function main() {
  console.log('\n🚀 Starting migration to database...\n');

  await migrateAccounts();
  await migrateDesignTemplates();
  await migrateCategories();
  await migrateTags();
  await migrateVersionHistory();
  await migrateEmailFolders();
  await migrateEmails();

  console.log('\n✨ Migration complete!\n');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
