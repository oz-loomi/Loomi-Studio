import '@/lib/esp/init';

import { getRegisteredProviders } from '@/lib/esp/registry';
import type { EspProvider } from '@/lib/esp/types';

function normalizeProvider(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

export function listEspProviders(): EspProvider[] {
  return getRegisteredProviders();
}

export function parseEspProvider(value: string | null | undefined): EspProvider | null {
  const normalized = normalizeProvider(value);
  if (!normalized) return null;

  const providers = listEspProviders();
  return providers.includes(normalized as EspProvider)
    ? (normalized as EspProvider)
    : null;
}

export function providerValidationMessage(fieldName = 'provider'): string {
  const providers = listEspProviders();
  if (providers.length === 0) {
    return `${fieldName} is not configured`;
  }
  return `${fieldName} must be one of: ${providers.join(', ')}`;
}
