import { NextRequest, NextResponse } from 'next/server';
import { unsupportedCapabilityPayload } from '@/lib/esp/unsupported';
import type { ProviderWebhookFamilyHandler } from '@/lib/esp/webhooks/types';

const webhookFamilyHandlers = new Map<string, Map<string, ProviderWebhookFamilyHandler>>();

function normalizeProvider(provider: string | null | undefined): string {
  return (provider || '').trim().toLowerCase();
}

function normalizeFamily(family: string | null | undefined): string {
  return (family || '').trim().toLowerCase();
}

function resolveFamilyHandlers(
  family: string | null | undefined,
): Map<string, ProviderWebhookFamilyHandler> | null {
  const normalized = normalizeFamily(family);
  if (!normalized) return null;
  return webhookFamilyHandlers.get(normalized) || null;
}

function resolveProviderFamilyHandler(
  provider: string | null | undefined,
  family: string | null | undefined,
): ProviderWebhookFamilyHandler | null {
  const normalizedProvider = normalizeProvider(provider);
  if (!normalizedProvider) return null;
  const handlers = resolveFamilyHandlers(family);
  if (!handlers) return null;
  return handlers.get(normalizedProvider) || null;
}

function listProvidersForFamily(family: string | null | undefined): string[] {
  const handlers = resolveFamilyHandlers(family);
  if (!handlers) return [];
  return Array.from(handlers.keys()).sort();
}

function buildProviderWebhookEndpoint(
  provider: string,
  family: string,
): string {
  return `/api/webhooks/esp/${provider}/${family}`;
}

export function registerProviderWebhookFamilyHandler(
  provider: string,
  family: string,
  handler: ProviderWebhookFamilyHandler,
): void {
  const normalizedProvider = normalizeProvider(provider);
  const normalizedFamily = normalizeFamily(family);
  if (!normalizedProvider) {
    throw new Error('Provider is required to register webhook family handler');
  }
  if (!normalizedFamily) {
    throw new Error('Family is required to register webhook family handler');
  }

  const handlers = webhookFamilyHandlers.get(normalizedFamily) || new Map<string, ProviderWebhookFamilyHandler>();
  handlers.set(normalizedProvider, handler);
  webhookFamilyHandlers.set(normalizedFamily, handlers);
}

export function supportsProviderWebhookFamily(
  provider: string | null | undefined,
  family: string | null | undefined,
): boolean {
  return Boolean(resolveProviderFamilyHandler(provider, family));
}

export function listWebhookFamilies(): string[] {
  return Array.from(webhookFamilyHandlers.keys()).sort();
}

export function listWebhookEndpointsForProvider(
  provider: string | null | undefined,
): Record<string, string> {
  const normalizedProvider = normalizeProvider(provider);
  if (!normalizedProvider) return {};

  const endpoints: Record<string, string> = {};
  for (const family of listWebhookFamilies()) {
    if (!supportsProviderWebhookFamily(normalizedProvider, family)) continue;
    endpoints[family] = buildProviderWebhookEndpoint(normalizedProvider, family);
  }
  return endpoints;
}

export async function handleProviderWebhookGet(params: {
  provider: string;
  family: string;
  endpoint: string;
}) {
  const handlers = resolveFamilyHandlers(params.family);
  if (!handlers) {
    return NextResponse.json(
      {
        error: `Webhook family "${params.family}" is not supported`,
        supportedFamilies: listWebhookFamilies(),
      },
      { status: 404 },
    );
  }

  const handler = resolveProviderFamilyHandler(params.provider, params.family);
  if (!handler) {
    const normalizedProvider = normalizeProvider(params.provider) || params.provider || 'unknown';
    return NextResponse.json({
      ok: true,
      endpoint: params.endpoint,
      supportedProviders: listProvidersForFamily(params.family),
      ...unsupportedCapabilityPayload(normalizedProvider, `${normalizeFamily(params.family)} webhooks`),
    });
  }

  return handler.get({ provider: normalizeProvider(params.provider), endpoint: params.endpoint });
}

export async function handleProviderWebhookPost(
  req: NextRequest,
  params: {
    provider: string;
    family: string;
  },
) {
  const handlers = resolveFamilyHandlers(params.family);
  if (!handlers) {
    return NextResponse.json(
      {
        error: `Webhook family "${params.family}" is not supported`,
        supportedFamilies: listWebhookFamilies(),
      },
      { status: 404 },
    );
  }

  const handler = resolveProviderFamilyHandler(params.provider, params.family);
  if (!handler) {
    const normalizedProvider = normalizeProvider(params.provider) || params.provider || 'unknown';
    return NextResponse.json(
      {
        supportedProviders: listProvidersForFamily(params.family),
        ...unsupportedCapabilityPayload(normalizedProvider, `${normalizeFamily(params.family)} webhooks`),
      },
      { status: 501 },
    );
  }

  return handler.post(req, { provider: normalizeProvider(params.provider) });
}
