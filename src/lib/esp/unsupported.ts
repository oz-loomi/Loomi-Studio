import { providerUnsupportedMessage } from '@/lib/esp/provider-display';

export function unsupportedCapabilityPayload(
  provider: string,
  capability: string,
  extra: Record<string, unknown> = {},
) {
  return {
    error: providerUnsupportedMessage(provider, capability),
    provider,
    unsupported: true,
    ...extra,
  };
}
