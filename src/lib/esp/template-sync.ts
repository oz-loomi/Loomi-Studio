import '@/lib/esp/init';

import { getEspConnectionsStatus } from '@/lib/esp/connections';
import { getAdapter } from '@/lib/esp/registry';
import type { EspCredentials, EspProvider } from '@/lib/esp/types';

export type TemplateSyncResultEntry = {
  success: boolean;
  remoteId?: string;
  error?: string;
};

export type TemplateSyncResult = {
  results: Record<string, TemplateSyncResultEntry>;
  publishedTo: Record<string, string>;
  primaryRemoteId: string | null;
  syncedProviders: string[];
  failedProviders: string[];
};

function normalizeProvider(provider: string | null | undefined): EspProvider | null {
  const normalized = (provider || '').trim().toLowerCase();
  return normalized ? (normalized as EspProvider) : null;
}

export function parsePublishedToMapping(input: {
  publishedTo?: string | null;
  remoteId?: string | null;
  provider?: string | null;
}): Record<string, string> {
  let publishedTo: Record<string, string> = {};
  if (input.publishedTo) {
    try {
      const parsed = JSON.parse(input.publishedTo) as Record<string, unknown>;
      for (const [provider, remoteId] of Object.entries(parsed)) {
        const normalizedProvider = normalizeProvider(provider);
        const normalizedRemoteId =
          typeof remoteId === 'string' && remoteId.trim() ? remoteId.trim() : null;
        if (normalizedProvider && normalizedRemoteId) {
          publishedTo[normalizedProvider] = normalizedRemoteId;
        }
      }
    } catch {
      publishedTo = {};
    }
  }

  const normalizedPrimaryProvider = normalizeProvider(input.provider);
  const legacyRemoteId =
    typeof input.remoteId === 'string' && input.remoteId.trim() ? input.remoteId.trim() : null;
  if (normalizedPrimaryProvider && legacyRemoteId && !publishedTo[normalizedPrimaryProvider]) {
    publishedTo[normalizedPrimaryProvider] = legacyRemoteId;
  }

  return publishedTo;
}

export function serializePublishedToMapping(publishedTo: Record<string, string>): string | null {
  return Object.keys(publishedTo).length > 0 ? JSON.stringify(publishedTo) : null;
}

function resolvePrimaryRemoteId(
  primaryProvider: string | null | undefined,
  publishedTo: Record<string, string>,
  fallbackRemoteId?: string | null,
): string | null {
  const normalizedPrimaryProvider = normalizeProvider(primaryProvider);
  if (normalizedPrimaryProvider && publishedTo[normalizedPrimaryProvider]) {
    return publishedTo[normalizedPrimaryProvider];
  }

  const firstPublishedRemoteId = Object.values(publishedTo)[0];
  if (typeof firstPublishedRemoteId === 'string' && firstPublishedRemoteId.trim()) {
    return firstPublishedRemoteId;
  }

  return typeof fallbackRemoteId === 'string' && fallbackRemoteId.trim()
    ? fallbackRemoteId.trim()
    : null;
}

async function resolveProviderCredentials(
  accountKey: string,
  provider: EspProvider,
): Promise<EspCredentials | null> {
  const adapter = getAdapter(provider);
  if (adapter.resolveCredentials) {
    return adapter.resolveCredentials(accountKey);
  }
  if (adapter.contacts) {
    return adapter.contacts.resolveCredentials(accountKey);
  }
  return null;
}

export async function resolveTemplateSyncProviders(input: {
  accountKey: string;
  preferredProviders?: Array<string | null | undefined>;
  publishedTo?: string | null;
  remoteId?: string | null;
  primaryProvider?: string | null;
}): Promise<EspProvider[]> {
  const preferredProviders = Array.from(new Set(
    (input.preferredProviders || [])
      .map((provider) => normalizeProvider(provider))
      .filter((provider): provider is EspProvider => Boolean(provider)),
  ));
  if (preferredProviders.length > 0) return preferredProviders;

  const existingPublishedProviders = Object.keys(parsePublishedToMapping({
    publishedTo: input.publishedTo,
    remoteId: input.remoteId,
    provider: input.primaryProvider,
  }))
    .map((provider) => normalizeProvider(provider))
    .filter((provider): provider is EspProvider => Boolean(provider));
  if (existingPublishedProviders.length > 0) {
    return Array.from(new Set(existingPublishedProviders));
  }

  const status = await getEspConnectionsStatus(input.accountKey);
  return status.connectedProviders.filter((provider) => {
    try {
      return Boolean(getAdapter(provider).templates);
    } catch {
      return false;
    }
  });
}

export async function syncTemplateToProviders(input: {
  accountKey: string;
  primaryProvider?: string | null;
  remoteId?: string | null;
  publishedTo?: string | null;
  providers: string[];
  name: string;
  subject?: string | null;
  previewText?: string | null;
  html: string;
  editorType?: string | null;
}): Promise<TemplateSyncResult> {
  const publishedTo = parsePublishedToMapping({
    publishedTo: input.publishedTo,
    remoteId: input.remoteId,
    provider: input.primaryProvider,
  });
  const results: Record<string, TemplateSyncResultEntry> = {};
  const providers = Array.from(new Set(
    input.providers
      .map((provider) => normalizeProvider(provider))
      .filter((provider): provider is EspProvider => Boolean(provider)),
  ));
  const trimmedHtml = input.html.trim();

  if (!trimmedHtml) {
    for (const provider of providers) {
      results[provider] = {
        success: false,
        error: 'Template has no HTML content to sync',
      };
    }
    return {
      results,
      publishedTo,
      primaryRemoteId: resolvePrimaryRemoteId(
        input.primaryProvider,
        publishedTo,
        input.remoteId,
      ),
      syncedProviders: [],
      failedProviders: providers,
    };
  }

  for (const provider of providers) {
    try {
      const adapter = getAdapter(provider);
      if (!adapter.templates) {
        results[provider] = {
          success: false,
          error: `${provider} does not support templates`,
        };
        continue;
      }

      const credentials = await resolveProviderCredentials(input.accountKey, provider);
      if (!credentials) {
        results[provider] = {
          success: false,
          error: `${provider} is not connected for this account`,
        };
        continue;
      }

      const existingRemoteId = publishedTo[provider];
      if (existingRemoteId) {
        await adapter.templates.updateTemplate(
          credentials.token,
          credentials.locationId,
          existingRemoteId,
          {
            name: input.name,
            subject: input.subject ?? undefined,
            previewText: input.previewText ?? undefined,
            html: trimmedHtml,
          },
        );
        results[provider] = {
          success: true,
          remoteId: existingRemoteId,
        };
        continue;
      }

      const created = await adapter.templates.createTemplate(
        credentials.token,
        credentials.locationId,
        {
          name: input.name,
          subject: input.subject ?? undefined,
          previewText: input.previewText ?? undefined,
          html: trimmedHtml,
          editorType: input.editorType ?? undefined,
        },
      );
      publishedTo[provider] = created.id;
      results[provider] = {
        success: true,
        remoteId: created.id,
      };
    } catch (error) {
      results[provider] = {
        success: false,
        error: error instanceof Error ? error.message : `Failed to sync ${provider} template`,
      };
    }
  }

  const syncedProviders = Object.entries(results)
    .filter(([, result]) => result.success)
    .map(([provider]) => provider);
  const failedProviders = Object.entries(results)
    .filter(([, result]) => !result.success)
    .map(([provider]) => provider);

  return {
    results,
    publishedTo,
    primaryRemoteId: resolvePrimaryRemoteId(
      input.primaryProvider,
      publishedTo,
      input.remoteId,
    ),
    syncedProviders,
    failedProviders,
  };
}
