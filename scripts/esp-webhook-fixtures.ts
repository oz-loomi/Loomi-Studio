import 'dotenv/config';
import crypto from 'crypto';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';
import '@/lib/esp/init';
import { prisma } from '@/lib/prisma';
import {
  POST as providerFamilyPostRoute,
} from '@/app/api/webhooks/esp/[provider]/[family]/route';

type JsonObject = Record<string, unknown>;

const FIXTURE_DIR = path.join(process.cwd(), 'scripts', 'fixtures', 'webhooks');
const FIXTURE_PREFIX = '__webhook-fixture__';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function loadFixture(name: string): Promise<JsonObject> {
  const file = path.join(FIXTURE_DIR, name);
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw) as JsonObject;
}

function applyReplacements<T>(value: T, replacements: Record<string, string>): T {
  let encoded = JSON.stringify(value);
  for (const [token, replacement] of Object.entries(replacements)) {
    encoded = encoded.split(token).join(replacement);
  }
  return JSON.parse(encoded) as T;
}

function buildPostRequest(params: {
  url: string;
  body: JsonObject;
  headers: Record<string, string>;
}): NextRequest {
  return new NextRequest(new Request(params.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...params.headers,
    },
    body: JSON.stringify(params.body),
  }));
}

async function resetFixtureRows() {
  await prisma.campaignEmailStats.deleteMany({
    where: {
      OR: [
        { accountId: { startsWith: FIXTURE_PREFIX } },
        { campaignId: { startsWith: FIXTURE_PREFIX } },
      ],
    },
  });
}

async function runGhlFixtureScenario() {
  const scenarioId = `${FIXTURE_PREFIX}:ghl:${Date.now()}`;
  const accountId = `${scenarioId}:location`;
  const campaignId = `${scenarioId}:campaign`;
  const nowSeconds = Math.floor(Date.now() / 1000);

  const deliveredFixture = applyReplacements(
    await loadFixture('ghl-delivered.json'),
    {
      '__LOCATION_ID__': accountId,
      '__CAMPAIGN_ID__': campaignId,
      '__EVENT_ID__': `${scenarioId}:delivered`,
      '__TIMESTAMP__': String(nowSeconds),
    },
  );
  const openedFixture = applyReplacements(
    await loadFixture('ghl-opened.json'),
    {
      '__LOCATION_ID__': accountId,
      '__CAMPAIGN_ID__': campaignId,
      '__EVENT_ID__': `${scenarioId}:opened`,
      '__TIMESTAMP__': String(nowSeconds + 10),
    },
  );

  (process.env as Record<string, string | undefined>).NODE_ENV = 'development';

  const deliveredRes = await providerFamilyPostRoute(
    buildPostRequest({
      url: 'http://localhost/api/webhooks/esp/ghl/email-stats',
      body: deliveredFixture,
      headers: {
        'x-wh-signature': 'fixture-signature',
      },
    }),
    { params: Promise.resolve({ provider: 'ghl', family: 'email-stats' }) },
  );
  assert(deliveredRes.status === 200, `GHL delivered fixture failed (${deliveredRes.status})`);

  const openedRes = await providerFamilyPostRoute(
    buildPostRequest({
      url: 'http://localhost/api/webhooks/esp/ghl/email-stats',
      body: openedFixture,
      headers: {
        'x-wh-signature': 'fixture-signature',
      },
    }),
    { params: Promise.resolve({ provider: 'ghl', family: 'email-stats' }) },
  );
  assert(openedRes.status === 200, `GHL opened fixture failed (${openedRes.status})`);

  const row = await prisma.campaignEmailStats.findUnique({
    where: {
      provider_accountId_campaignId: {
        provider: 'ghl',
        accountId,
        campaignId,
      },
    },
  });
  assert(row, 'GHL fixture did not produce a CampaignEmailStats row');
  assert(row.deliveredCount === 1, `GHL deliveredCount expected 1, received ${row.deliveredCount}`);
  assert(row.openedCount === 1, `GHL openedCount expected 1, received ${row.openedCount}`);
  assert(Boolean(row.firstDeliveredAt), 'GHL firstDeliveredAt should be set after delivered event');
}

async function runKlaviyoFixtureScenario() {
  const scenarioId = `${FIXTURE_PREFIX}:klaviyo:${Date.now()}`;
  const accountId = `${scenarioId}:account`;
  const campaignId = `${scenarioId}:campaign`;
  const timestamp = String(Math.floor(Date.now() / 1000));

  const payload = applyReplacements(
    await loadFixture('klaviyo-email-events.json'),
    {
      '__ACCOUNT_ID__': accountId,
      '__CAMPAIGN_ID__': campaignId,
      '__TIMESTAMP__': timestamp,
    },
  );

  const secret = process.env.KLAVIYO_WEBHOOK_SECRET || `fixture-secret-${Date.now()}`;
  (process.env as Record<string, string | undefined>).KLAVIYO_WEBHOOK_SECRET = secret;
  const rawBody = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .update(timestamp)
    .digest('hex');

  const res = await providerFamilyPostRoute(
    buildPostRequest({
      url: 'http://localhost/api/webhooks/esp/klaviyo/email-stats',
      body: payload,
      headers: {
        'klaviyo-signature': signature,
        'klaviyo-timestamp': timestamp,
      },
    }),
    { params: Promise.resolve({ provider: 'klaviyo', family: 'email-stats' }) },
  );
  assert(res.status === 200, `Klaviyo fixture failed (${res.status})`);

  const row = await prisma.campaignEmailStats.findUnique({
    where: {
      provider_accountId_campaignId: {
        provider: 'klaviyo',
        accountId,
        campaignId,
      },
    },
  });
  assert(row, 'Klaviyo fixture did not produce a CampaignEmailStats row');
  assert(row.deliveredCount === 1, `Klaviyo deliveredCount expected 1, received ${row.deliveredCount}`);
  assert(row.clickedCount === 1, `Klaviyo clickedCount expected 1, received ${row.clickedCount}`);
}

async function runUnsupportedFamilyScenario() {
  const response = await providerFamilyPostRoute(
    buildPostRequest({
      url: 'http://localhost/api/webhooks/esp/ghl/unknown-family',
      body: { ping: true },
      headers: {},
    }),
    { params: Promise.resolve({ provider: 'ghl', family: 'unknown-family' }) },
  );
  assert(
    response.status === 404,
    `Unknown webhook family should return 404 (received ${response.status})`,
  );
}

async function main() {
  await resetFixtureRows();
  try {
    await runGhlFixtureScenario();
    await runKlaviyoFixtureScenario();
    await runUnsupportedFamilyScenario();
    console.log('Webhook fixtures passed: GHL + Klaviyo email-stats handlers');
  } finally {
    await resetFixtureRows();
  }
}

main()
  .catch((err) => {
    console.error('Webhook fixture validation failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
