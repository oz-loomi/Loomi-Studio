import 'dotenv/config';
import crypto from 'crypto';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';
import '@/lib/esp/init';
import {
  POST as providerFamilyPostRoute,
} from '@/app/api/webhooks/esp/[provider]/[family]/route';

type JsonObject = Record<string, unknown>;

const FIXTURE_DIR = path.join(process.cwd(), 'scripts', 'fixtures', 'webhooks');

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

async function runKlaviyoFixtureScenario() {
  const scenarioId = `__webhook-fixture__:klaviyo:${Date.now()}`;
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
  await runKlaviyoFixtureScenario();
  await runUnsupportedFamilyScenario();
  console.log('Webhook fixtures passed: Klaviyo email-stats handler + unknown-family guard');
}

main()
  .catch((err) => {
    console.error('Webhook fixture validation failed:', err);
    process.exit(1);
  });
