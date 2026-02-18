import type { EspAdapter } from '@/lib/esp/types';
import { GhlAdapter } from './ghl';
import { KlaviyoAdapter } from './klaviyo';

export function instantiateEspAdapters(): EspAdapter[] {
  return [
    new GhlAdapter(),
    new KlaviyoAdapter(),
  ];
}
