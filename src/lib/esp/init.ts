// ── ESP Initialization ──
// Auto-registers all available ESP adapters.
// Import this module once at app startup (e.g., in layout or middleware).

import { registerAdapter } from './registry';
import { instantiateEspAdapters } from './adapters/catalog';
import { registerProviderWebhookFamilyHandler } from './webhooks/families';
import type { EspAdapter } from './types';
import { getProviderConfig } from './provider-config';

function registerAdapterWebhookFamilies(adapter: EspAdapter): void {
  if (!adapter.webhookFamilies) return;
  for (const [family, handler] of Object.entries(adapter.webhookFamilies)) {
    registerProviderWebhookFamilyHandler(adapter.provider, family, handler);
  }
}

function validateAdapterWebhookConfiguration(adapter: EspAdapter): void {
  const familyCount = Object.keys(adapter.webhookFamilies || {}).length;
  const claimsWebhookCapability = adapter.capabilities.webhooks === true;
  if (familyCount > 0 && !claimsWebhookCapability) {
    console.warn(
      `[esp:init] Adapter "${adapter.provider}" declares webhook families but capabilities.webhooks=false`,
    );
  }
  if (familyCount === 0 && claimsWebhookCapability) {
    console.warn(
      `[esp:init] Adapter "${adapter.provider}" capabilities.webhooks=true but no webhook families are registered`,
    );
  }
}

function validateAdapterCapabilityContracts(adapter: EspAdapter): void {
  const { capabilities } = adapter;

  if (capabilities.auth === 'oauth' && !adapter.oauth) {
    console.warn(`[esp:init] Adapter "${adapter.provider}" auth=oauth but oauth adapter is missing`);
  }
  if (capabilities.auth === 'api-key' && !adapter.connection) {
    console.warn(`[esp:init] Adapter "${adapter.provider}" auth=api-key but connection adapter is missing`);
  }
  if (capabilities.auth === 'both' && !adapter.oauth && !adapter.connection) {
    console.warn(
      `[esp:init] Adapter "${adapter.provider}" auth=both but neither oauth nor connection adapter is implemented`,
    );
  }

  if (capabilities.contacts && !adapter.contacts) {
    console.warn(`[esp:init] Adapter "${adapter.provider}" capabilities.contacts=true but contacts adapter is missing`);
  }
  if (capabilities.campaigns && !adapter.campaigns) {
    console.warn(`[esp:init] Adapter "${adapter.provider}" capabilities.campaigns=true but campaigns adapter is missing`);
  }
  if (capabilities.workflows && !adapter.campaigns) {
    console.warn(
      `[esp:init] Adapter "${adapter.provider}" capabilities.workflows=true but campaigns/workflows adapter is missing`,
    );
  }
  if (capabilities.messages && !adapter.messages) {
    console.warn(`[esp:init] Adapter "${adapter.provider}" capabilities.messages=true but messages adapter is missing`);
  }
  if (capabilities.users && !adapter.users) {
    console.warn(`[esp:init] Adapter "${adapter.provider}" capabilities.users=true but users adapter is missing`);
  }
  if (capabilities.customValues && !adapter.customValues) {
    console.warn(
      `[esp:init] Adapter "${adapter.provider}" capabilities.customValues=true but customValues adapter is missing`,
    );
  }
}

function validateAdapterProviderMetadata(adapter: EspAdapter): void {
  if (!getProviderConfig(adapter.provider)) {
    console.warn(
      `[esp:init] Adapter "${adapter.provider}" is registered without provider-config metadata (provider-config.ts)`,
    );
  }
}

// Register all ESP adapters + declared webhook families
const adapters = instantiateEspAdapters();
for (const adapter of adapters) {
  validateAdapterProviderMetadata(adapter);
  validateAdapterCapabilityContracts(adapter);
  validateAdapterWebhookConfiguration(adapter);
  registerAdapter(adapter);
  registerAdapterWebhookFamilies(adapter);
}
