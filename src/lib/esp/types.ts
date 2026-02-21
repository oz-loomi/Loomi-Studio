import type { ProviderWebhookFamilyMap } from '@/lib/esp/webhooks/types';

// ── ESP Provider Identifiers ──

export type EspProvider = string;

// ── Credentials ──

/** ESP-agnostic resolved credentials */
export interface EspCredentials {
  provider: EspProvider;
  /** Opaque provider credential (OAuth access token, API key, etc.) */
  token: string;
  /** Provider-specific location/account identifier */
  locationId: string;
}

/** OAuth token set returned by providers that use OAuth */
export interface OAuthTokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  locationId: string;
  userId?: string;
}

// ── Auth Capabilities ──

export interface EspOAuthAdapter {
  readonly provider: EspProvider;
  readonly requiredScopes: string[];
  getAuthorizationUrl(accountKey: string): string;
  exchangeCodeForTokens(code: string): Promise<OAuthTokenSet>;
  refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet>;
  getValidToken(accountKey: string): Promise<string | null>;
  fetchLocationDetails(accessToken: string, locationId: string): Promise<Record<string, string>>;
  storeConnection(params: {
    accountKey: string;
    locationId: string;
    locationName?: string;
    tokens: OAuthTokenSet;
  }): Promise<void>;
  removeConnection(accountKey: string): Promise<boolean>;
  getConnection(accountKey: string): Promise<EspConnectionRecord | null>;
  signState(accountKey: string): string;
  verifyState(state: string): { accountKey: string } | null;
  encryptToken(plaintext: string): string;
  decryptToken(encrypted: string): string;
}

/** Connection record — kept generic enough for both OAuth and API key storage */
export interface EspConnectionRecord {
  accountKey: string;
  locationId: string;
  locationName?: string | null;
  scopes?: string;
  tokenExpiresAt?: Date;
  installedAt?: Date;
}

// ── Contacts ──

export interface NormalizedContact {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  tags: string[];
  dateAdded: string;
  source: string;
  // Vehicle-specific (domain-specific to automotive dealers)
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleVin: string;
  vehicleMileage: string;
  lastServiceDate: string;
  nextServiceDate: string;
  leaseEndDate: string;
  warrantyEndDate: string;
  purchaseDate: string;
  // Messaging engagement
  hasReceivedMessage: boolean;
  hasReceivedEmail: boolean;
  hasReceivedSms: boolean;
  lastMessageDate: string;
}

export interface ContactsAdapter {
  readonly provider: EspProvider;
  resolveCredentials(accountKey: string): Promise<EspCredentials | null>;
  fetchContactCount(token: string, locationId: string): Promise<number>;
  fetchAllContacts(token: string, locationId: string): Promise<Record<string, unknown>[]>;
  normalizeContact(raw: Record<string, unknown>): NormalizedContact;
  requestContacts(params: {
    token: string;
    locationId: string;
    limit: number;
    search: string;
  }): Promise<{ contacts: Record<string, unknown>[]; total: number }>;
  getCachedContactCount(accountKey: string): number | null;
  setCachedContactCount(accountKey: string, total: number): void;
}

// ── Campaigns ──

export interface EspCampaign {
  id: string;
  campaignId?: string;
  scheduleId?: string;
  name: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  scheduledAt?: string;
  sentAt?: string;
  sentCount?: number;
  deliveredCount?: number;
  openedCount?: number;
  clickedCount?: number;
  repliedCount?: number;
  bouncedCount?: number;
  failedCount?: number;
  unsubscribedCount?: number;
  openRate?: number;
  clickRate?: number;
  replyRate?: number;
  locationId: string;
  accountKey?: string;
  dealer?: string;
  bulkRequestId?: string;
  parentId?: string;
}

export interface EspCampaignAnalytics {
  sentCount?: number;
  deliveredCount?: number;
  openedCount?: number;
  clickedCount?: number;
  repliedCount?: number;
  bouncedCount?: number;
  failedCount?: number;
  unsubscribedCount?: number;
  openRate?: number;
  clickRate?: number;
  replyRate?: number;
  source?: string;
}

export interface EspWorkflow {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  locationId: string;
  accountKey?: string;
  dealer?: string;
}

export interface ScheduleEmailCampaignInput {
  token: string;
  locationId: string;
  name: string;
  subject: string;
  previewText?: string;
  html: string;
  sendAt: string;
  contactIds: string[];
}

export interface ScheduledEmailCampaignResult {
  id: string;
  scheduleId: string;
  campaignId: string;
  status: string;
  endpoint: string;
  response: Record<string, unknown> | null;
}

export interface CampaignsAdapter {
  readonly provider: EspProvider;
  fetchCampaigns(token: string, locationId: string, options?: { forceRefresh?: boolean }): Promise<EspCampaign[]>;
  fetchCampaignAnalytics(
    token: string,
    locationId: string,
    identifiers: { scheduleId?: string; campaignId?: string; recordId?: string },
  ): Promise<EspCampaignAnalytics>;
  fetchWorkflows(token: string, locationId: string): Promise<EspWorkflow[]>;
  fetchCampaignPreviewHtml(token: string, locationId: string, scheduleId: string): Promise<{ previewUrl: string; html: string }>;
  scheduleEmailCampaign(input: ScheduleEmailCampaignInput): Promise<ScheduledEmailCampaignResult>;
}

// ── Messages ──

export type OutboundMessageChannel = 'SMS' | 'MMS';

export interface SentMessage {
  id: string;
  conversationId: string;
  channel: string;
  type: string;
  direction: string;
  body: string;
  dateAdded: string;
  raw: Record<string, unknown> | null;
}

export interface SendMessageOptions {
  token: string;
  locationId: string;
  contactId: string;
  message: string;
  channel?: OutboundMessageChannel;
  mediaUrls?: string[];
}

export interface MessagesAdapter {
  readonly provider: EspProvider;
  sendMessageToContact(options: SendMessageOptions): Promise<SentMessage>;
}

// ── Users ──

export interface EspUser {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  type: string;
}

export interface UsersAdapter {
  readonly provider: EspProvider;
  fetchLocationUsers(token: string, locationId: string, options?: { forceRefresh?: boolean }): Promise<EspUser[]>;
  buildUserNameMap(users: EspUser[]): Map<string, string>;
}

// ── Webhooks ──

export interface WebhookVerifyInput {
  rawBody: string;
  signature: string;
  headers?: Record<string, string | undefined>;
}

export interface WebhookAdapter {
  readonly provider: EspProvider;
  readonly signatureHeaderCandidates?: readonly string[];
  verifySignature(input: WebhookVerifyInput): boolean;
}

// ── Custom Values ──

export interface EspCustomValue {
  id: string;
  name: string;
  fieldKey: string;
  value: string;
}

export interface CustomValueInput {
  name: string;
  fieldKey: string;
  value: string;
}

export interface SyncResult {
  created: string[];
  updated: string[];
  deleted: string[];
  skipped: string[];
  errors: Array<{ fieldKey: string; error: string }>;
}

export interface CustomValuesAdapter {
  readonly provider: EspProvider;
  fetchCustomValues(token: string, locationId: string): Promise<EspCustomValue[]>;
  createCustomValue(token: string, locationId: string, input: CustomValueInput): Promise<EspCustomValue>;
  updateCustomValue(token: string, locationId: string, customValueId: string, update: { name: string; value: string }): Promise<EspCustomValue>;
  deleteCustomValue(token: string, locationId: string, customValueId: string): Promise<void>;
  syncCustomValues(token: string, locationId: string, desired: CustomValueInput[], managedNames?: string[]): Promise<SyncResult>;
}

// ── Templates ──

export interface EspEmailTemplate {
  id: string;
  name: string;
  subject?: string;
  previewText?: string;
  html: string;
  status?: string;
  editorType?: string;
  thumbnailUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateEspTemplateInput {
  name: string;
  subject?: string;
  previewText?: string;
  html: string;
  editorType?: string;
}

export interface UpdateEspTemplateInput {
  name?: string;
  subject?: string;
  previewText?: string;
  html?: string;
}

export interface TemplatesAdapter {
  readonly provider: EspProvider;
  fetchTemplates(token: string, locationId: string): Promise<EspEmailTemplate[]>;
  fetchTemplateById(token: string, locationId: string, templateId: string): Promise<EspEmailTemplate | null>;
  createTemplate(token: string, locationId: string, input: CreateEspTemplateInput): Promise<EspEmailTemplate>;
  updateTemplate(token: string, locationId: string, templateId: string, input: UpdateEspTemplateInput): Promise<EspEmailTemplate>;
  deleteTemplate(token: string, locationId: string, templateId: string): Promise<void>;
}

// ── Contact Detail + Messaging Extensions ──

export interface EspContactCapabilities {
  dnd: boolean;
  conversations: boolean;
  messaging: boolean;
}

export interface ContactDetailAdapter {
  readonly provider: EspProvider;
  readonly capabilities: EspContactCapabilities;
  fetchContactDetail(params: {
    accountKey: string;
    contactId: string;
    credentials: EspCredentials;
  }): Promise<{
    contact: unknown;
    account?: unknown;
  }>;
  updateContactDnd?(params: {
    accountKey: string;
    contactId: string;
    body: unknown;
    credentials: EspCredentials;
  }): Promise<{
    contact: unknown;
  }>;
}

export interface ContactMessagingSummary {
  hasReceivedMessage: boolean;
  hasReceivedEmail: boolean;
  hasReceivedSms: boolean;
  lastMessageDate: string;
}

export interface ContactConversationsResult {
  conversations: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  stats: {
    totalMessages: number;
    smsCount: number;
    emailCount: number;
    lastMessageDate: string | null;
    lastMessageDirection: string | null;
  };
  error?: string;
}

export interface ContactMessagingAdapter {
  readonly provider: EspProvider;
  fetchMessagingSummary(params: {
    accountKey: string;
    contactIds: string[];
    credentials: EspCredentials;
  }): Promise<{
    summaryByContactId: Record<string, ContactMessagingSummary>;
  }>;
  fetchContactConversations(params: {
    accountKey: string;
    contactId: string;
    credentials: EspCredentials;
  }): Promise<ContactConversationsResult>;
}

// ── Campaign Screenshots ──

export interface CampaignScreenshotResult {
  image: Buffer;
  contentType: string;
  filename: string;
}

export interface CampaignScreenshotAdapter {
  readonly provider: EspProvider;
  generateCampaignScreenshot(params: {
    accountKey: string;
    identifier: string;
    credentials: EspCredentials;
  }): Promise<CampaignScreenshotResult>;
}

// ── Account/Location Provisioning ──

export interface LocationProvisioningInput {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  website?: string;
  timezone?: string;
}

export interface ProvisionedLocation {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  website: string;
  timezone: string;
}

export interface LocationProvisioningAdapter {
  readonly provider: EspProvider;
  createLocation(input: LocationProvisioningInput): Promise<ProvisionedLocation>;
}

// ── Account Details Sync ──

export interface BusinessDetailsInput {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  website?: string;
  timezone?: string;
}

export interface BusinessDetailsSyncResult {
  synced: boolean;
  warning?: string;
}

export interface AccountDetailsSyncAdapter {
  readonly provider: EspProvider;
  syncBusinessDetails(
    accountKey: string,
    locationId: string,
    details: BusinessDetailsInput,
  ): Promise<BusinessDetailsSyncResult>;
}

// ── Connection Management ──

export interface EspConnectInput {
  accountKey: string;
  apiKey?: string;
}

export interface EspConnectResult {
  accountId?: string;
  accountName?: string;
}

export interface EspConnectionAdapter {
  readonly provider: EspProvider;
  connect(input: EspConnectInput): Promise<EspConnectResult>;
  disconnect(accountKey: string): Promise<boolean>;
}

export interface EspValidationInput {
  accountKey?: string;
  apiKey?: string;
}

export interface EspValidationResult {
  provider: EspProvider;
  mode: 'oauth' | 'api-key' | (string & {});
  location?: Record<string, string>;
  account?: { id: string; name: string };
}

export class EspValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'EspValidationError';
    this.status = status;
  }
}

export interface EspValidationAdapter {
  readonly provider: EspProvider;
  validate(input: EspValidationInput): Promise<EspValidationResult>;
}

// ── Composite Adapter ──

export interface EspCapabilities {
  auth: 'oauth' | 'api-key' | 'both';
  contacts: boolean;
  campaigns: boolean;
  workflows: boolean;
  messages: boolean;
  users: boolean;
  webhooks: boolean;
  customValues: boolean;
  templates: boolean;
}

export interface EspAdapter {
  readonly provider: EspProvider;
  readonly capabilities: EspCapabilities;
  resolveCredentials?(accountKey: string): Promise<EspCredentials | null>;
  readonly webhookFamilies?: ProviderWebhookFamilyMap;
  readonly oauth?: EspOAuthAdapter;
  readonly connection?: EspConnectionAdapter;
  readonly validation?: EspValidationAdapter;
  readonly contacts?: ContactsAdapter;
  readonly contactDetail?: ContactDetailAdapter;
  readonly contactMessaging?: ContactMessagingAdapter;
  readonly campaigns?: CampaignsAdapter;
  readonly campaignScreenshots?: CampaignScreenshotAdapter;
  readonly locationProvisioning?: LocationProvisioningAdapter;
  readonly accountDetailsSync?: AccountDetailsSyncAdapter;
  readonly messages?: MessagesAdapter;
  readonly users?: UsersAdapter;
  readonly webhook?: WebhookAdapter;
  readonly customValues?: CustomValuesAdapter;
  readonly templates?: TemplatesAdapter;
}

// ── Account-level stored record (ESP-agnostic) ──

export interface StoredAccount {
  dealer?: string;
  espProvider?: EspProvider;
}
