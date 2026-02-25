// ── Klaviyo Adapter ──
// Composite adapter wrapping all Klaviyo sub-modules behind the EspAdapter interface.

import type {
  EspAdapter,
  EspCapabilities,
  EspConnectionAdapter,
  EspConnectInput,
  EspConnectResult,
  EspValidationAdapter,
  EspValidationInput,
  EspValidationResult,
  ContactsAdapter,
  CampaignsAdapter,
  TemplatesAdapter,
  MediaAdapter,
  MediaCapabilities,
  EspMedia,
  MediaListResult,
  MediaUploadInput,
  WebhookAdapter,
  WebhookVerifyInput,
  EspCredentials,
  NormalizedContact,
  EspCampaign,
  EspCampaignAnalytics,
  EspWorkflow,
  EspEmailTemplate,
  CreateEspTemplateInput,
  UpdateEspTemplateInput,
  ScheduleEmailCampaignInput,
  ScheduledEmailCampaignResult,
} from '../../types';
import { EspValidationError } from '../../types';

// ── Sub-module imports ──

import {
  removeKlaviyoConnection,
  storeKlaviyoConnection,
  validateApiKey,
} from './auth';

import {
  resolveCredentials,
  fetchContactCount,
  fetchAllContacts,
  normalizeContact,
  requestContacts,
  getCachedContactCount,
  setCachedContactCount,
} from './contacts';

import {
  fetchCampaigns,
  fetchCampaignAnalytics,
  fetchWorkflows,
  fetchCampaignPreviewHtml,
  scheduleEmailCampaign,
} from './campaigns';

import {
  fetchTemplates,
  fetchTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from './templates';

import {
  listMedia as listKlaviyoMedia,
  uploadMedia as uploadKlaviyoMedia,
  renameMedia as renameKlaviyoMedia,
} from './media';

import { verifyWebhookSignature } from './webhook';
import { klaviyoEmailStatsWebhookHandler } from '@/lib/esp/webhooks/providers/klaviyo-email-stats';

// ── Connection Sub-adapter ──

class KlaviyoConnectionAdapter implements EspConnectionAdapter {
  readonly provider = 'klaviyo' as const;

  async connect(input: EspConnectInput): Promise<EspConnectResult> {
    const accountKey = input.accountKey.trim();
    if (!accountKey) {
      throw new Error('accountKey is required');
    }
    const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
    if (!apiKey) {
      throw new Error('apiKey is required');
    }

    const { accountId, accountName } = await validateApiKey(apiKey);
    await storeKlaviyoConnection({
      accountKey,
      apiKey,
      accountId,
      accountName,
    });

    return { accountId, accountName };
  }

  async disconnect(accountKey: string): Promise<boolean> {
    return removeKlaviyoConnection(accountKey);
  }
}

// ── Validation Sub-adapter ──

class KlaviyoValidationAdapter implements EspValidationAdapter {
  readonly provider = 'klaviyo' as const;

  async validate(input: EspValidationInput): Promise<EspValidationResult> {
    const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
    if (!apiKey) {
      throw new EspValidationError('apiKey is required', 400);
    }

    try {
      const { accountId, accountName } = await validateApiKey(apiKey);
      return {
        provider: 'klaviyo',
        mode: 'api-key',
        account: { id: accountId, name: accountName },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to validate Klaviyo API key';
      const statusMatch = /\((\d{3})\)/.exec(message);
      const status = statusMatch ? Number(statusMatch[1]) : 500;
      throw new EspValidationError(message, status);
    }
  }
}

// ── Contacts Sub-adapter ──

class KlaviyoContactsAdapter implements ContactsAdapter {
  readonly provider = 'klaviyo' as const;

  async resolveCredentials(accountKey: string): Promise<EspCredentials | null> {
    return resolveCredentials(accountKey);
  }

  async fetchContactCount(token: string, locationId: string): Promise<number> {
    return fetchContactCount(token, locationId);
  }

  async fetchAllContacts(
    token: string,
    locationId: string,
  ): Promise<Record<string, unknown>[]> {
    return fetchAllContacts(token, locationId);
  }

  normalizeContact(raw: Record<string, unknown>): NormalizedContact {
    return normalizeContact(raw);
  }

  async requestContacts(params: {
    token: string;
    locationId: string;
    limit: number;
    search: string;
  }): Promise<{ contacts: Record<string, unknown>[]; total: number }> {
    return requestContacts(params);
  }

  getCachedContactCount(accountKey: string): number | null {
    return getCachedContactCount(accountKey);
  }

  setCachedContactCount(accountKey: string, total: number): void {
    setCachedContactCount(accountKey, total);
  }
}

// ── Campaigns Sub-adapter ──

class KlaviyoCampaignsAdapter implements CampaignsAdapter {
  readonly provider = 'klaviyo' as const;

  async fetchCampaigns(
    token: string,
    locationId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<EspCampaign[]> {
    return fetchCampaigns(token, locationId, options);
  }

  async fetchCampaignAnalytics(
    token: string,
    locationId: string,
    identifiers: { scheduleId?: string; campaignId?: string; recordId?: string },
  ): Promise<EspCampaignAnalytics> {
    return fetchCampaignAnalytics(token, locationId, identifiers);
  }

  async fetchWorkflows(
    token: string,
    locationId: string,
  ): Promise<EspWorkflow[]> {
    return fetchWorkflows(token, locationId);
  }

  async fetchCampaignPreviewHtml(
    token: string,
    locationId: string,
    campaignId: string,
  ): Promise<{ previewUrl: string; html: string }> {
    return fetchCampaignPreviewHtml(token, locationId, campaignId);
  }

  async scheduleEmailCampaign(
    input: ScheduleEmailCampaignInput,
  ): Promise<ScheduledEmailCampaignResult> {
    return scheduleEmailCampaign(input);
  }
}

// ── Templates Sub-adapter ──

class KlaviyoTemplatesAdapter implements TemplatesAdapter {
  readonly provider = 'klaviyo' as const;

  async fetchTemplates(
    token: string,
    accountId: string,
  ): Promise<EspEmailTemplate[]> {
    return fetchTemplates(token, accountId);
  }

  async fetchTemplateById(
    token: string,
    accountId: string,
    templateId: string,
  ): Promise<EspEmailTemplate | null> {
    return fetchTemplateById(token, accountId, templateId);
  }

  async createTemplate(
    token: string,
    accountId: string,
    input: CreateEspTemplateInput,
  ): Promise<EspEmailTemplate> {
    return createTemplate(token, accountId, input);
  }

  async updateTemplate(
    token: string,
    accountId: string,
    templateId: string,
    input: UpdateEspTemplateInput,
  ): Promise<EspEmailTemplate> {
    return updateTemplate(token, accountId, templateId, input);
  }

  async deleteTemplate(
    token: string,
    accountId: string,
    templateId: string,
  ): Promise<void> {
    return deleteTemplate(token, accountId, templateId);
  }
}

// ── Webhook Sub-adapter ──

class KlaviyoWebhookAdapter implements WebhookAdapter {
  readonly provider = 'klaviyo' as const;
  readonly signatureHeaderCandidates = ['klaviyo-signature'] as const;

  verifySignature(input: WebhookVerifyInput): boolean {
    return verifyWebhookSignature(
      input.rawBody,
      input.signature,
      input.headers?.['klaviyo-timestamp'] || input.headers?.['Klaviyo-Timestamp'],
    );
  }
}

// ── Media Sub-adapter ──

class KlaviyoMediaAdapter implements MediaAdapter {
  readonly provider = 'klaviyo' as const;
  readonly mediaCapabilities: MediaCapabilities = {
    canUpload: true,
    canDelete: false,
    canRename: true,
    canCreateFolders: false,
    canNavigateFolders: false,
  };

  async listMedia(
    apiKey: string,
    accountId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<MediaListResult> {
    return listKlaviyoMedia(apiKey, accountId, options);
  }

  async uploadMedia(
    apiKey: string,
    accountId: string,
    input: MediaUploadInput,
  ): Promise<EspMedia> {
    return uploadKlaviyoMedia(apiKey, accountId, input);
  }

  async renameMedia(
    apiKey: string,
    accountId: string,
    imageId: string,
    newName: string,
  ): Promise<EspMedia> {
    return renameKlaviyoMedia(apiKey, accountId, imageId, newName);
  }
  // deleteMedia is intentionally undefined — Klaviyo does not support it
}

// ── Composite Klaviyo Adapter ──

export class KlaviyoAdapter implements EspAdapter {
  readonly provider = 'klaviyo' as const;

  readonly capabilities: EspCapabilities = {
    auth: 'api-key',
    contacts: true,
    campaigns: true,
    workflows: true,
    messages: false,     // Klaviyo has no 1:1 message send API
    users: false,        // Klaviyo has no team members API
    webhooks: true,      // Beta API
    customValues: false,  // Schema-less properties, no field definition CRUD
    templates: true,
    media: true,
  };

  async resolveCredentials(accountKey: string): Promise<EspCredentials | null> {
    return this.contacts.resolveCredentials(accountKey);
  }

  readonly contacts = new KlaviyoContactsAdapter();
  readonly campaigns = new KlaviyoCampaignsAdapter();
  readonly webhook = new KlaviyoWebhookAdapter();
  readonly webhookFamilies = {
    'email-stats': klaviyoEmailStatsWebhookHandler,
  };
  readonly templates = new KlaviyoTemplatesAdapter();
  readonly media = new KlaviyoMediaAdapter();
  readonly connection = new KlaviyoConnectionAdapter();
  readonly validation = new KlaviyoValidationAdapter();
  // messages, users, customValues are intentionally undefined
}
