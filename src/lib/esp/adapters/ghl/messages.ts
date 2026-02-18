import crypto from 'crypto';
import { API_VERSION, GHL_BASE } from './constants';

interface SendAttempt {
  label: string;
  url: string;
  payload: Record<string, unknown>;
}

export type OutboundMessageChannel = 'SMS' | 'MMS';

export interface SendMessageToContactOptions {
  token: string;
  locationId: string;
  contactId: string;
  message: string;
  channel?: OutboundMessageChannel;
  mediaUrls?: string[];
}

export interface SentSmsMessage {
  id: string;
  conversationId: string;
  channel: string;
  type: string;
  direction: string;
  body: string;
  dateAdded: string;
  raw: Record<string, unknown> | null;
}

export class GhlSmsSendError extends Error {
  status: number;
  details: string;

  constructor(message: string, status = 500, details = '') {
    super(message);
    this.name = 'GhlSmsSendError';
    this.status = status;
    this.details = details;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
}

function toSafeString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((entry) => toSafeString(entry)).filter(Boolean).join(' ').trim();
  }
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return toSafeString(
      row.value ??
      row.text ??
      row.message ??
      row.label ??
      row.name ??
      row.type ??
      row.id,
    );
  }
  return '';
}

function extractList(data: unknown, keys: string[]): Record<string, unknown>[] {
  const root = asRecord(data);
  if (!root) return [];

  for (const key of keys) {
    const direct = asRecordArray(root[key]);
    if (direct.length > 0) return direct;

    const nested = asRecord(root[key]);
    if (!nested) continue;
    const nestedCandidates = [
      nested[key],
      nested.items,
      nested.results,
      nested.messages,
      nested.data,
    ];
    for (const candidate of nestedCandidates) {
      const nestedArray = asRecordArray(candidate);
      if (nestedArray.length > 0) return nestedArray;
    }
  }

  const dataArray = asRecordArray(root.data);
  if (dataArray.length > 0) return dataArray;
  return [];
}

function parseErrorText(status: number, rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return `GHL API error (${status})`;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const message =
      toSafeString(parsed.message) ||
      toSafeString(parsed.error) ||
      toSafeString(parsed.msg) ||
      toSafeString(parsed.detail) ||
      toSafeString(parsed.error_description);
    if (message) return message;
  } catch {
    // Return plain text fallback below.
  }

  return trimmed.length > 220 ? `${trimmed.slice(0, 220)}...` : trimmed;
}

function normalizeChannel(value: unknown): OutboundMessageChannel {
  const raw = toSafeString(value).toUpperCase();
  return raw === 'MMS' ? 'MMS' : 'SMS';
}

function normalizeMediaUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const urls = raw
    .map((entry) => toSafeString(entry))
    .filter(Boolean)
    .filter((url) => /^https?:\/\/\S+$/i.test(url));
  return [...new Set(urls)];
}

function applyMediaPayload(
  basePayload: Record<string, unknown>,
  mediaUrls: string[],
): Record<string, unknown> {
  if (mediaUrls.length === 0) return basePayload;
  return {
    ...basePayload,
    mediaUrls,
    media: mediaUrls,
    attachments: mediaUrls,
    files: mediaUrls,
  };
}

async function findConversationId(
  token: string,
  locationId: string,
  contactId: string,
): Promise<string> {
  const searchParams = new URLSearchParams({
    locationId,
    contactId,
    limit: '1',
  });

  const res = await fetch(`${GHL_BASE}/conversations/search?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Version: API_VERSION,
      Accept: 'application/json',
    },
  });

  if (!res.ok) return '';

  const payload = await res.json().catch(() => ({}));
  const conversations = extractList(payload, ['conversations', 'items', 'results']);
  if (conversations.length === 0) return '';
  return toSafeString(conversations[0]?.id);
}

function buildAttempts(
  locationId: string,
  contactId: string,
  channel: OutboundMessageChannel,
  message: string,
  mediaUrls: string[],
  conversationId: string,
): SendAttempt[] {
  const attempts: SendAttempt[] = [
    {
      label: 'conversations/messages (type+message)',
      url: `${GHL_BASE}/conversations/messages`,
      payload: applyMediaPayload({ locationId, contactId, type: channel, message }, mediaUrls),
    },
    {
      label: 'conversations/messages (messageType+body)',
      url: `${GHL_BASE}/conversations/messages`,
      payload: applyMediaPayload({ locationId, contactId, messageType: channel, body: message }, mediaUrls),
    },
    {
      label: 'conversations/messages/outbound',
      url: `${GHL_BASE}/conversations/messages/outbound`,
      payload: applyMediaPayload({ locationId, contactId, type: channel, message }, mediaUrls),
    },
    {
      label: 'contacts/{id}/messages',
      url: `${GHL_BASE}/contacts/${encodeURIComponent(contactId)}/messages`,
      payload: applyMediaPayload({ locationId, type: channel, message }, mediaUrls),
    },
  ];

  if (conversationId) {
    attempts.unshift(
      {
        label: 'conversations/{id}/messages (type+message)',
        url: `${GHL_BASE}/conversations/${encodeURIComponent(conversationId)}/messages`,
        payload: applyMediaPayload({ type: channel, message, locationId, contactId }, mediaUrls),
      },
      {
        label: 'conversations/{id}/messages (messageType+body)',
        url: `${GHL_BASE}/conversations/${encodeURIComponent(conversationId)}/messages`,
        payload: applyMediaPayload({ messageType: channel, body: message, locationId, contactId }, mediaUrls),
      },
    );
  }

  return attempts;
}

function extractMessageRecord(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload);
  if (!root) return null;

  const directCandidates = [
    asRecord(root.message),
    asRecord(root.data),
    asRecord(root.result),
  ].filter(Boolean) as Record<string, unknown>[];
  if (directCandidates.length > 0) return directCandidates[0];

  const messages = extractList(payload, ['messages', 'items', 'results']);
  if (messages.length > 0) return messages[0];
  return root;
}

function normalizeSentMessage(
  channel: OutboundMessageChannel,
  message: string,
  conversationId: string,
  payload: unknown,
): SentSmsMessage {
  const record = extractMessageRecord(payload);
  const id = toSafeString(record?.id) || crypto.randomUUID();
  const responseConversationId =
    toSafeString(record?.conversationId) ||
    toSafeString(record?.conversation_id) ||
    conversationId;
  const responseChannel = toSafeString(record?.channel).toUpperCase() || channel;
  const type = toSafeString(record?.type) || toSafeString(record?.messageType) || channel;
  const direction = toSafeString(record?.direction) || 'outbound';
  const body = toSafeString(record?.body) || toSafeString(record?.text) || toSafeString(record?.message) || message;
  const dateAdded = toSafeString(record?.dateAdded) || toSafeString(record?.createdAt) || new Date().toISOString();

  return {
    id,
    conversationId: responseConversationId,
    channel: responseChannel,
    type,
    direction,
    body,
    dateAdded,
    raw: record,
  };
}

export async function sendMessageToContact(options: SendMessageToContactOptions): Promise<SentSmsMessage> {
  const channel = normalizeChannel(options.channel);
  const mediaUrls = normalizeMediaUrls(options.mediaUrls);
  const message = options.message.trim();
  if (!message && mediaUrls.length === 0) {
    throw new GhlSmsSendError(`${channel} body cannot be empty`, 400);
  }

  const headers = {
    Authorization: `Bearer ${options.token}`,
    Version: API_VERSION,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  let conversationId = '';
  try {
    conversationId = await findConversationId(options.token, options.locationId, options.contactId);
  } catch {
    // Conversation lookup is best-effort. Sending may still work without this ID.
  }

  const attempts = buildAttempts(options.locationId, options.contactId, channel, message, mediaUrls, conversationId);
  let lastStatus = 500;
  const errors: string[] = [];

  for (const attempt of attempts) {
    const res = await fetch(attempt.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(attempt.payload),
    });

    const text = await res.text();
    if (!res.ok) {
      lastStatus = res.status;
      const detail = parseErrorText(res.status, text);
      errors.push(`${attempt.label}: ${detail}`);
      continue;
    }

    let payload: unknown = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }

    return normalizeSentMessage(channel, message, conversationId, payload);
  }

  const details = errors.join(' | ');
  const messageText = details
    ? `Failed to send ${channel}. ${details}`
    : `Failed to send ${channel}.`;
  throw new GhlSmsSendError(messageText, lastStatus, details);
}

export interface SendSmsToContactOptions {
  token: string;
  locationId: string;
  contactId: string;
  message: string;
}

export async function sendSmsToContact(options: SendSmsToContactOptions): Promise<SentSmsMessage> {
  return sendMessageToContact({
    ...options,
    channel: 'SMS',
  });
}
