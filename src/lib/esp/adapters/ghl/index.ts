// ── GHL Adapter ──
// Composite adapter wrapping all GHL sub-modules behind the EspAdapter interface.

import type {
  EspAdapter,
  EspCapabilities,
  EspOAuthAdapter,
  EspValidationAdapter,
  EspValidationInput,
  EspValidationResult,
  ContactsAdapter,
  ContactDetailAdapter,
  ContactMessagingAdapter,
  CampaignsAdapter,
  CampaignScreenshotAdapter,
  LocationProvisioningAdapter,
  AccountDetailsSyncAdapter,
  MessagesAdapter,
  UsersAdapter,
  WebhookAdapter,
  WebhookVerifyInput,
  CustomValuesAdapter,
  TemplatesAdapter,
  MediaAdapter,
  MediaCapabilities,
  EspMedia,
  EspMediaFolder,
  MediaListResult,
  MediaFolderListResult,
  MediaUploadInput,
  CreateMediaFolderInput,
  EspCredentials,
  OAuthTokenSet,
  EspConnectionRecord,
  NormalizedContact,
  EspCampaign,
  EspCampaignAnalytics,
  EspWorkflow,
  EspEmailTemplate,
  CreateEspTemplateInput,
  UpdateEspTemplateInput,
  ScheduleEmailCampaignInput,
  ScheduledEmailCampaignResult,
  SentMessage,
  SendMessageOptions,
  EspUser,
  EspCustomValue,
  CustomValueInput,
  SyncResult,
  ContactConversationsResult,
  ContactMessagingSummary,
  LocationProvisioningInput,
  ProvisionedLocation,
  BusinessDetailsInput,
  BusinessDetailsSyncResult,
} from '../../types';
import { EspValidationError } from '../../types';

// ── Sub-module imports ──

import {
  REQUIRED_SCOPES,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidToken,
  getValidAgencyToken,
  fetchLocationDetails,
  storeConnection,
  removeConnection,
  getConnection,
  signState,
  verifyState,
  encryptToken,
  decryptToken,
} from './oauth';
import { API_VERSION, GHL_BASE } from './constants';

import {
  resolveGhlCredentials,
  fetchContactCount,
  fetchAllContacts,
  normalizeContact,
  requestContacts,
  getCachedContactCount,
  setCachedContactCount,
} from './contacts';
import {
  fetchGhlContactDetail,
  updateGhlContactDnd,
} from './contact-detail';
import {
  fetchGhlContactConversations,
  fetchGhlMessagingSummaryByContactIds,
} from './contact-messaging';

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
  listMedia as listGhlMedia,
  uploadMedia as uploadGhlMedia,
  deleteMedia as deleteGhlMedia,
  listFolders as listGhlFolders,
  createFolder as createGhlFolder,
} from './media';
import { generateGhlCampaignScreenshot } from './campaign-screenshot';

import {
  sendMessageToContact,
} from './messages';

import {
  fetchLocationUsers,
  buildUserNameMap,
} from './users';

import {
  verifyWebhookSignature,
} from './webhook';

import {
  fetchCustomValues,
  createCustomValue,
  updateCustomValue,
  deleteCustomValue,
  syncCustomValues,
} from './custom-values';
import { ghlEmailStatsWebhookHandler } from '@/lib/esp/webhooks/providers/ghl-email-stats';

// ── OAuth Sub-adapter ──

class GhlOAuthAdapter implements EspOAuthAdapter {
  readonly provider = 'ghl' as const;
  readonly requiredScopes = REQUIRED_SCOPES;

  getAuthorizationUrl(accountKey: string): string {
    return getAuthorizationUrl(accountKey);
  }

  async exchangeCodeForTokens(code: string): Promise<OAuthTokenSet> {
    return exchangeCodeForTokens(code);
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet> {
    return refreshAccessToken(refreshToken);
  }

  async getValidToken(accountKey: string): Promise<string | null> {
    return getValidToken(accountKey);
  }

  async fetchLocationDetails(
    accessToken: string,
    locationId: string,
  ): Promise<Record<string, string>> {
    return fetchLocationDetails(accessToken, locationId);
  }

  async storeConnection(params: {
    accountKey: string;
    locationId: string;
    locationName?: string;
    tokens: OAuthTokenSet;
  }): Promise<void> {
    return storeConnection(params);
  }

  async removeConnection(accountKey: string): Promise<boolean> {
    return removeConnection(accountKey);
  }

  async getConnection(accountKey: string): Promise<EspConnectionRecord | null> {
    return getConnection(accountKey);
  }

  signState(accountKey: string): string {
    return signState(accountKey);
  }

  verifyState(state: string): { accountKey: string } | null {
    return verifyState(state);
  }

  encryptToken(plaintext: string): string {
    return encryptToken(plaintext);
  }

  decryptToken(encrypted: string): string {
    return decryptToken(encrypted);
  }
}

// ── Validation Sub-adapter ──

class GhlValidationAdapter implements EspValidationAdapter {
  readonly provider = 'ghl' as const;

  async validate(input: EspValidationInput): Promise<EspValidationResult> {
    const accountKey = input.accountKey?.trim() || '';
    if (!accountKey) {
      throw new EspValidationError('accountKey is required for GHL OAuth validation', 400);
    }

    const token = await getValidToken(accountKey);
    if (!token) {
      throw new EspValidationError(
        'No OAuth connection found for this account. Connect via OAuth first.',
        400,
      );
    }

    const connection = await getConnection(accountKey);
    if (!connection?.locationId) {
      throw new EspValidationError('OAuth connection exists but no locationId is stored.', 400);
    }

    try {
      const location = await fetchLocationDetails(token, connection.locationId);
      return { provider: 'ghl', mode: 'oauth', location };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch location details';
      throw new EspValidationError(message, 500);
    }
  }
}

// ── Contacts Sub-adapter ──

class GhlContactsAdapter implements ContactsAdapter {
  readonly provider = 'ghl' as const;

  async resolveCredentials(accountKey: string): Promise<EspCredentials | null> {
    const result = await resolveGhlCredentials(accountKey);
    if (!result) return null;
    return { provider: 'ghl', ...result };
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
    return normalizeContact(raw) as NormalizedContact;
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

// ── Contact Detail Sub-adapter ──

class GhlContactDetailAdapter implements ContactDetailAdapter {
  readonly provider = 'ghl' as const;
  readonly capabilities = {
    dnd: true,
    conversations: true,
    messaging: true,
  };

  async fetchContactDetail(params: {
    accountKey: string;
    contactId: string;
    credentials: EspCredentials;
  }): Promise<{ contact: unknown; account?: unknown }> {
    return fetchGhlContactDetail({
      accountKey: params.accountKey,
      contactId: params.contactId,
    });
  }

  async updateContactDnd(params: {
    accountKey: string;
    contactId: string;
    body: unknown;
    credentials: EspCredentials;
  }): Promise<{ contact: unknown }> {
    return updateGhlContactDnd({
      accountKey: params.accountKey,
      contactId: params.contactId,
      body: params.body,
    });
  }
}

// ── Contact Messaging Sub-adapter ──

class GhlContactMessagingAdapter implements ContactMessagingAdapter {
  readonly provider = 'ghl' as const;

  async fetchMessagingSummary(params: {
    accountKey: string;
    contactIds: string[];
    credentials: EspCredentials;
  }): Promise<{ summaryByContactId: Record<string, ContactMessagingSummary> }> {
    return fetchGhlMessagingSummaryByContactIds({
      accountKey: params.accountKey,
      contactIds: params.contactIds,
    });
  }

  async fetchContactConversations(params: {
    accountKey: string;
    contactId: string;
    credentials: EspCredentials;
  }): Promise<ContactConversationsResult> {
    return fetchGhlContactConversations({
      accountKey: params.accountKey,
      contactId: params.contactId,
    }) as Promise<ContactConversationsResult>;
  }
}

// ── Campaigns Sub-adapter ──

class GhlCampaignsAdapter implements CampaignsAdapter {
  readonly provider = 'ghl' as const;

  async fetchCampaigns(
    token: string,
    locationId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<EspCampaign[]> {
    return fetchCampaigns(token, locationId, options) as Promise<EspCampaign[]>;
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
    return fetchWorkflows(token, locationId) as Promise<EspWorkflow[]>;
  }

  async fetchCampaignPreviewHtml(
    token: string,
    locationId: string,
    scheduleId: string,
  ): Promise<{ previewUrl: string; html: string }> {
    return fetchCampaignPreviewHtml(token, locationId, scheduleId);
  }

  async scheduleEmailCampaign(
    input: ScheduleEmailCampaignInput,
  ): Promise<ScheduledEmailCampaignResult> {
    return scheduleEmailCampaign(input) as Promise<ScheduledEmailCampaignResult>;
  }
}

// ── Campaign Screenshot Sub-adapter ──

class GhlCampaignScreenshotAdapter implements CampaignScreenshotAdapter {
  readonly provider = 'ghl' as const;

  async generateCampaignScreenshot(params: {
    accountKey: string;
    identifier: string;
    credentials: EspCredentials;
  }) {
    return generateGhlCampaignScreenshot({
      accountKey: params.accountKey,
      scheduleId: params.identifier,
    });
  }
}

// ── Location Provisioning Sub-adapter ──

class GhlLocationProvisioningAdapter implements LocationProvisioningAdapter {
  readonly provider = 'ghl' as const;

  async createLocation(input: LocationProvisioningInput): Promise<ProvisionedLocation> {
    const agencyToken = process.env.GHL_AGENCY_TOKEN;
    if (!agencyToken) {
      throw new EspValidationError(
        'GHL agency token is not configured. Set GHL_AGENCY_TOKEN in .env.local',
        500,
      );
    }

    const payload: Record<string, string> = { name: input.name };
    if (input.email) payload.email = input.email;
    if (input.phone) payload.phone = input.phone;
    if (input.address) payload.address = input.address;
    if (input.city) payload.city = input.city;
    if (input.state) payload.state = input.state;
    if (input.postalCode) payload.postalCode = input.postalCode;
    if (input.website) payload.website = input.website;
    if (input.timezone) payload.timezone = input.timezone;

    const res = await fetch(`${GHL_BASE}/locations/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${agencyToken}`,
        'Content-Type': 'application/json',
        Version: API_VERSION,
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        (data as Record<string, string>)?.message ||
        (data as Record<string, string>)?.error ||
        (data as Record<string, string>)?.msg ||
        `GHL API error (${res.status})`;
      throw new EspValidationError(message, res.status);
    }

    const locationRaw = ((data as Record<string, unknown>).location || data) as Record<string, unknown>;
    return {
      id: String(locationRaw.id || locationRaw._id || ''),
      name: String(locationRaw.name || ''),
      email: String(locationRaw.email || ''),
      phone: String(locationRaw.phone || ''),
      address: String(locationRaw.address || ''),
      city: String(locationRaw.city || ''),
      state: String(locationRaw.state || ''),
      postalCode: String(locationRaw.postalCode || locationRaw.postal_code || locationRaw.zipCode || ''),
      website: String(locationRaw.website || ''),
      timezone: String(locationRaw.timezone || ''),
    };
  }
}

// ── Account Details Sync Sub-adapter ──

class GhlAccountDetailsSyncAdapter implements AccountDetailsSyncAdapter {
  readonly provider = 'ghl' as const;

  async syncBusinessDetails(
    _accountKey: string,
    locationId: string,
    details: BusinessDetailsInput,
  ): Promise<BusinessDetailsSyncResult> {
    const payload: Record<string, string> = {};
    if (details.name) payload.name = details.name;
    if (details.email) payload.email = details.email;
    if (details.phone) payload.phone = details.phone;
    if (details.address) payload.address = details.address;
    if (details.city) payload.city = details.city;
    if (details.state) payload.state = details.state;
    if (details.postalCode) payload.postalCode = details.postalCode;
    if (details.website) payload.website = details.website;
    if (details.timezone) payload.timezone = details.timezone;

    if (Object.keys(payload).length === 0) {
      return { synced: false, warning: 'No business details to sync' };
    }

    // PUT /locations requires locations.write — an agency-level scope not available
    // to sub-account OAuth tokens. Use the agency OAuth token or legacy agency env token.
    let token: string | null = null;
    try {
      const agency = await getValidAgencyToken();
      if (agency?.token) token = agency.token;
    } catch {
      // Agency OAuth not connected.
    }
    if (!token) {
      token = process.env.GHL_AGENCY_TOKEN?.trim() || null;
    }

    if (!token) {
      // No agency token — silently skip sync (sub-account tokens can't write locations).
      return { synced: false };
    }

    try {
      const res = await fetch(`${GHL_BASE}/locations/${locationId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Version: API_VERSION,
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message =
          (data as Record<string, string>).message ||
          (data as Record<string, string>).error ||
          `GHL API error (${res.status})`;
        return {
          synced: false,
          warning: `GHL sync failed: ${message}. Details saved locally.`,
        };
      }

      return { synced: true };
    } catch {
      return {
        synced: false,
        warning: 'GHL sync failed (network error). Details saved locally.',
      };
    }
  }
}

// ── Messages Sub-adapter ──

class GhlMessagesAdapter implements MessagesAdapter {
  readonly provider = 'ghl' as const;

  async sendMessageToContact(options: SendMessageOptions): Promise<SentMessage> {
    return sendMessageToContact(options) as Promise<SentMessage>;
  }
}

// ── Users Sub-adapter ──

class GhlUsersAdapter implements UsersAdapter {
  readonly provider = 'ghl' as const;

  async fetchLocationUsers(
    token: string,
    locationId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<EspUser[]> {
    return fetchLocationUsers(token, locationId, options) as Promise<EspUser[]>;
  }

  buildUserNameMap(users: EspUser[]): Map<string, string> {
    return buildUserNameMap(users as Parameters<typeof buildUserNameMap>[0]);
  }
}

// ── Webhook Sub-adapter ──

class GhlWebhookAdapter implements WebhookAdapter {
  readonly provider = 'ghl' as const;
  readonly signatureHeaderCandidates = ['x-wh-signature'] as const;

  verifySignature(input: WebhookVerifyInput): boolean {
    return verifyWebhookSignature(input.rawBody, input.signature);
  }
}

// ── Templates Sub-adapter ──

class GhlTemplatesAdapter implements TemplatesAdapter {
  readonly provider = 'ghl' as const;

  async fetchTemplates(
    token: string,
    locationId: string,
  ): Promise<EspEmailTemplate[]> {
    return fetchTemplates(token, locationId);
  }

  async fetchTemplateById(
    token: string,
    locationId: string,
    templateId: string,
  ): Promise<EspEmailTemplate | null> {
    return fetchTemplateById(token, locationId, templateId);
  }

  async createTemplate(
    token: string,
    locationId: string,
    input: CreateEspTemplateInput,
  ): Promise<EspEmailTemplate> {
    return createTemplate(token, locationId, input);
  }

  async updateTemplate(
    token: string,
    locationId: string,
    templateId: string,
    input: UpdateEspTemplateInput,
  ): Promise<EspEmailTemplate> {
    return updateTemplate(token, locationId, templateId, input);
  }

  async deleteTemplate(
    token: string,
    locationId: string,
    templateId: string,
  ): Promise<void> {
    return deleteTemplate(token, locationId, templateId);
  }
}

// ── Custom Values Sub-adapter ──

class GhlCustomValuesAdapter implements CustomValuesAdapter {
  readonly provider = 'ghl' as const;

  async fetchCustomValues(
    token: string,
    locationId: string,
  ): Promise<EspCustomValue[]> {
    return fetchCustomValues(token, locationId) as Promise<EspCustomValue[]>;
  }

  async createCustomValue(
    token: string,
    locationId: string,
    input: CustomValueInput,
  ): Promise<EspCustomValue> {
    return createCustomValue(token, locationId, input) as Promise<EspCustomValue>;
  }

  async updateCustomValue(
    token: string,
    locationId: string,
    customValueId: string,
    update: { name: string; value: string },
  ): Promise<EspCustomValue> {
    return updateCustomValue(token, locationId, customValueId, update) as Promise<EspCustomValue>;
  }

  async deleteCustomValue(
    token: string,
    locationId: string,
    customValueId: string,
  ): Promise<void> {
    return deleteCustomValue(token, locationId, customValueId);
  }

  async syncCustomValues(
    token: string,
    locationId: string,
    desired: CustomValueInput[],
    managedNames?: string[],
  ): Promise<SyncResult> {
    return syncCustomValues(token, locationId, desired, managedNames) as Promise<SyncResult>;
  }
}

// ── Media Sub-adapter ──

class GhlMediaAdapter implements MediaAdapter {
  readonly provider = 'ghl' as const;
  readonly mediaCapabilities: MediaCapabilities = {
    canUpload: true,
    canDelete: true,
    canRename: false,
    canCreateFolders: true,
    canNavigateFolders: true,
  };

  async listMedia(
    token: string,
    locationId: string,
    options?: { cursor?: string; limit?: number; parentId?: string },
  ): Promise<MediaListResult> {
    return listGhlMedia(token, locationId, options);
  }

  async listFolders(
    token: string,
    locationId: string,
    parentId?: string,
  ): Promise<MediaFolderListResult> {
    return listGhlFolders(token, locationId, parentId);
  }

  async createFolder(
    token: string,
    locationId: string,
    input: CreateMediaFolderInput,
  ): Promise<EspMediaFolder> {
    return createGhlFolder(token, locationId, input);
  }

  async uploadMedia(
    token: string,
    locationId: string,
    input: MediaUploadInput,
  ): Promise<EspMedia> {
    return uploadGhlMedia(token, locationId, input);
  }

  async deleteMedia(
    token: string,
    locationId: string,
    mediaId: string,
  ): Promise<void> {
    return deleteGhlMedia(token, locationId, mediaId);
  }
  // renameMedia is intentionally undefined — GHL does not support it
}

// ── Composite GHL Adapter ──

export class GhlAdapter implements EspAdapter {
  readonly provider = 'ghl' as const;

  readonly capabilities: EspCapabilities = {
    auth: 'oauth',
    contacts: true,
    campaigns: true,
    workflows: true,
    messages: true,
    users: true,
    webhooks: true,
    customValues: true,
    templates: true,
    media: true,
  };

  async resolveCredentials(accountKey: string): Promise<EspCredentials | null> {
    return this.contacts.resolveCredentials(accountKey);
  }

  readonly oauth = new GhlOAuthAdapter();
  readonly validation = new GhlValidationAdapter();
  readonly contacts = new GhlContactsAdapter();
  readonly contactDetail = new GhlContactDetailAdapter();
  readonly contactMessaging = new GhlContactMessagingAdapter();
  readonly campaigns = new GhlCampaignsAdapter();
  readonly campaignScreenshots = new GhlCampaignScreenshotAdapter();
  readonly locationProvisioning = new GhlLocationProvisioningAdapter();
  readonly accountDetailsSync = new GhlAccountDetailsSyncAdapter();
  readonly messages = new GhlMessagesAdapter();
  readonly users = new GhlUsersAdapter();
  readonly webhook = new GhlWebhookAdapter();
  readonly webhookFamilies = {
    'email-stats': ghlEmailStatsWebhookHandler,
  };
  readonly customValues = new GhlCustomValuesAdapter();
  readonly templates = new GhlTemplatesAdapter();
  readonly media = new GhlMediaAdapter();
}
