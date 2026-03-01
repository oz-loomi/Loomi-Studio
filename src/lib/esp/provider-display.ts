import {
  getProviderConfig,
  providerDisplayName as providerDisplayNameFromConfig,
} from '@/lib/esp/provider-config';

export type ProviderCardTheme = {
  description: string;
  /** Features / integrations available once connected — shown on "Learn More". */
  features?: string[];
  logoSrc?: string;
  logoAlt?: string;
  headerClassName?: string;
  connectButtonClassName?: string;
};

export type ProviderIcon = {
  src: string;
  alt: string;
};

export function providerDisplayName(provider: string | null | undefined): string {
  return providerDisplayNameFromConfig(provider);
}

export function providerUnsupportedMessage(
  provider: string | null | undefined,
  capability: string,
): string {
  return `${providerDisplayName(provider)} does not currently support ${capability}`;
}

export function providerCardTheme(provider: string | null | undefined): ProviderCardTheme {
  const config = getProviderConfig(provider);
  return {
    description: config?.description || 'Provider registered in Loomi ESP adapters.',
    features: config?.features,
    logoSrc: config?.logoSrc,
    logoAlt: config?.logoAlt || providerDisplayName(provider),
    headerClassName: config?.headerClassName || 'bg-[var(--muted)]',
    connectButtonClassName: config?.connectButtonClassName || 'bg-[var(--primary)] text-white hover:opacity-90',
  };
}

export function providerIcon(provider: string | null | undefined): ProviderIcon | null {
  const config = getProviderConfig(provider);
  if (!config?.iconSrc) return null;
  return {
    src: config.iconSrc,
    alt: config.iconAlt || providerDisplayName(provider),
  };
}
