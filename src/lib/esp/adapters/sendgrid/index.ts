// ── SendGrid Adapter ──
// Composite adapter wrapping all SendGrid sub-modules behind the EspAdapter interface.

import type {
  EspAdapter,
  EspCapabilities,
  EspConnectionAdapter,
  EspConnectInput,
  EspConnectResult,
  EspValidationAdapter,
  EspValidationInput,
  EspValidationResult,
  CampaignsAdapter,
  TemplatesAdapter,
  WebhookAdapter,
  WebhookVerifyInput,
  EspCredentials,
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
  removeSendGridConnection,
  storeSendGridConnection,
  validateApiKey,
  resolveSendGridCredentials,
} from './auth';

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

import { verifySendGridWebhookSignature } from './webhook';
import { sendgridEmailStatsWebhookHandler } from '@/lib/esp/webhooks/providers/sendgrid-email-stats';

// ── Connection Sub-adapter ──

class SendGridConnectionAdapter implements EspConnectionAdapter {
  readonly provider = 'sendgrid' as const;

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
    await storeSendGridConnection({
      accountKey,
      apiKey,
      accountId,
      accountName,
    });

    return { accountId, accountName };
  }

  async disconnect(accountKey: string): Promise<boolean> {
    return removeSendGridConnection(accountKey);
  }
}

// ── Validation Sub-adapter ──

class SendGridValidationAdapter implements EspValidationAdapter {
  readonly provider = 'sendgrid' as const;

  async validate(input: EspValidationInput): Promise<EspValidationResult> {
    const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
    if (!apiKey) {
      throw new EspValidationError('apiKey is required', 400);
    }

    try {
      const { accountId, accountName } = await validateApiKey(apiKey);
      return {
        provider: 'sendgrid',
        mode: 'api-key',
        account: { id: accountId, name: accountName },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to validate SendGrid API key';
      const statusMatch = /\((\d{3})\)/.exec(message);
      const status = statusMatch ? Number(statusMatch[1]) : 500;
      throw new EspValidationError(message, status);
    }
  }
}

// ── Campaigns Sub-adapter ──

class SendGridCampaignsAdapter implements CampaignsAdapter {
  readonly provider = 'sendgrid' as const;

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

class SendGridTemplatesAdapter implements TemplatesAdapter {
  readonly provider = 'sendgrid' as const;

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

class SendGridWebhookAdapter implements WebhookAdapter {
  readonly provider = 'sendgrid' as const;
  readonly signatureHeaderCandidates = ['x-twilio-email-event-webhook-signature'] as const;

  verifySignature(input: WebhookVerifyInput): boolean {
    return verifySendGridWebhookSignature(
      input.rawBody,
      input.signature,
      input.headers?.['x-twilio-email-event-webhook-timestamp'],
    );
  }
}

// ── Composite SendGrid Adapter ──

export class SendGridAdapter implements EspAdapter {
  readonly provider = 'sendgrid' as const;

  readonly capabilities: EspCapabilities = {
    auth: 'api-key',
    contacts: false,       // Not using SendGrid for contacts (yet)
    campaigns: true,
    workflows: false,      // No workflow concept in SendGrid
    messages: false,
    users: false,
    webhooks: true,
    customValues: false,
    templates: true,
    media: false,
  };

  async resolveCredentials(accountKey: string): Promise<EspCredentials | null> {
    return resolveSendGridCredentials(accountKey);
  }

  readonly campaigns = new SendGridCampaignsAdapter();
  readonly webhook = new SendGridWebhookAdapter();
  readonly webhookFamilies = {
    'email-stats': sendgridEmailStatsWebhookHandler,
  };
  readonly templates = new SendGridTemplatesAdapter();
  readonly connection = new SendGridConnectionAdapter();
  readonly validation = new SendGridValidationAdapter();
  // contacts, messages, users, customValues, media are intentionally undefined
}
