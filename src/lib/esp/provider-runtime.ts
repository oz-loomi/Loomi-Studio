import { getProviderConfig } from '@/lib/esp/provider-config';

export function providerCustomValuesSyncDelayMs(provider: string | null | undefined): number {
  return getProviderConfig(provider)?.customValuesSyncDelayMs ?? 0;
}
