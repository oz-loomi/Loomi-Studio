import type { EspAdapter } from '@/lib/esp/types';
import { GhlAdapter } from './ghl';
import { KlaviyoAdapter } from './klaviyo';
import { SendGridAdapter } from './sendgrid';

export function instantiateEspAdapters(): EspAdapter[] {
  return [
    new GhlAdapter(),
    new KlaviyoAdapter(),
    new SendGridAdapter(),
  ];
}
