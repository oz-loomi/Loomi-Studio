import {
  resolveGhlCredentials,
} from './contacts';
import { API_VERSION, GHL_BASE } from './constants';
import { withConcurrencyLimit } from '@/lib/esp/utils';

type MessageChannel = 'EMAIL' | 'SMS' | 'MMS' | 'CALL' | 'VOICEMAIL' | 'CHAT' | 'UNKNOWN';

export interface ContactMessagingSummary {
  hasReceivedMessage: boolean;
  hasReceivedEmail: boolean;
  hasReceivedSms: boolean;
  lastMessageDate: string;
}

export interface ContactConversationPayload {
  conversations: Array<{
    id: unknown;
    type: unknown;
    lastMessageDate: unknown;
    unreadCount: unknown;
  }>;
  messages: Array<{
    id: string;
    channel: MessageChannel;
    type: unknown;
    direction: unknown;
    body: unknown;
    dateAdded: unknown;
    status: string;
    contentType: unknown;
    subject: unknown;
  }>;
  stats: {
    totalMessages: number;
    smsCount: number;
    emailCount: number;
    lastMessageDate: string | null;
    lastMessageDirection: string | null;
  };
  error?: string;
}

const summaryCache = new Map<string, { summary: ContactMessagingSummary; fetchedAt: number }>();
const SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000;

export class GhlMessagingError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'GhlMessagingError';
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === 'object',
  );
}

function toSafeString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
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
    const directArray = asRecordArray(root[key]);
    if (directArray.length > 0) return directArray;

    const nested = asRecord(root[key]);
    if (!nested) continue;
    const nestedCandidates = [
      nested[key],
      nested.items,
      nested.results,
      nested.messages,
      nested.conversations,
      nested.data,
    ];
    for (const candidate of nestedCandidates) {
      const nestedArray = asRecordArray(candidate);
      if (nestedArray.length > 0) return nestedArray;
    }
  }

  const dataArray = asRecordArray(root.data);
  if (dataArray.length > 0) return dataArray;

  const valuesArray = asRecordArray(Object.values(root));
  if (valuesArray.length > 0) return valuesArray;

  return [];
}

function detectMessageChannel(msg: Record<string, unknown>): MessageChannel {
  const signals = [
    msg.channel,
    msg.channelType,
    msg.messageType,
    msg.type,
    msg.contentType,
    msg.provider,
    msg.providerType,
    msg.sourceType,
  ]
    .map((value) => toSafeString(value).toUpperCase())
    .join(' ');

  if (signals.includes('EMAIL')) return 'EMAIL';
  if (signals.includes('MMS')) return 'MMS';
  if (signals.includes('SMS') || signals.includes('TEXT')) return 'SMS';
  if (signals.includes('VOICEMAIL')) return 'VOICEMAIL';
  if (signals.includes('CALL')) return 'CALL';
  if (signals.includes('CHAT')) return 'CHAT';

  const toField = toSafeString(msg.to);
  const fromField = toSafeString(msg.from);
  if (/@/.test(toField) || /@/.test(fromField)) return 'EMAIL';

  const digitsTo = toField.replace(/\D/g, '');
  const digitsFrom = fromField.replace(/\D/g, '');
  if (digitsTo.length >= 7 || digitsFrom.length >= 7) return 'SMS';

  return 'UNKNOWN';
}

function normalizeDate(value: unknown): string {
  const text = toSafeString(value);
  if (!text) return '';
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

function latestDate(currentIso: string, candidate: unknown): string {
  const nextIso = normalizeDate(candidate);
  if (!nextIso) return currentIso;
  if (!currentIso) return nextIso;
  return new Date(nextIso).getTime() > new Date(currentIso).getTime()
    ? nextIso
    : currentIso;
}

function emptySummary(): ContactMessagingSummary {
  return {
    hasReceivedMessage: false,
    hasReceivedEmail: false,
    hasReceivedSms: false,
    lastMessageDate: '',
  };
}

function resolveAccountKey(accountKeyRaw?: string): string {
  const accountKey = (accountKeyRaw || '').trim();
  if (!accountKey) {
    throw new GhlMessagingError('accountKey is required', 400);
  }
  return accountKey;
}

async function fetchMessagingSummaryForContact(
  token: string,
  locationId: string,
  contactId: string,
): Promise<ContactMessagingSummary> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Version: API_VERSION,
    Accept: 'application/json',
  };

  const summary = emptySummary();
  const searchParams = new URLSearchParams({
    locationId,
    contactId,
    limit: '25',
  });

  const convoRes = await fetch(
    `${GHL_BASE}/conversations/search?${searchParams.toString()}`,
    { headers },
  );

  if (!convoRes.ok) {
    return summary;
  }

  const convoData = await convoRes.json();
  const conversations = extractList(convoData, ['conversations', 'items', 'results']);
  if (conversations.length === 0) return summary;

  summary.hasReceivedMessage = true;

  const conversationIds: string[] = [];
  for (const convo of conversations) {
    const channel = detectMessageChannel(convo);
    if (channel === 'EMAIL') summary.hasReceivedEmail = true;
    if (channel === 'SMS' || channel === 'MMS') summary.hasReceivedSms = true;

    summary.lastMessageDate = latestDate(
      summary.lastMessageDate,
      convo.lastMessageDate ??
        convo.last_message_date ??
        convo.dateUpdated ??
        convo.updatedAt ??
        convo.dateAdded,
    );

    const id = toSafeString(convo.id);
    if (id) conversationIds.push(id);
  }

  if (
    (!summary.hasReceivedEmail || !summary.hasReceivedSms) &&
    conversationIds.length > 0
  ) {
    const firstConversationId = conversationIds[0];
    const msgRes = await fetch(
      `${GHL_BASE}/conversations/${firstConversationId}/messages`,
      { headers },
    );
    if (msgRes.ok) {
      const msgData = await msgRes.json();
      const messages = extractList(msgData, ['messages', 'items', 'results']).slice(0, 30);
      for (const msg of messages) {
        const channel = detectMessageChannel(msg);
        if (channel === 'EMAIL') summary.hasReceivedEmail = true;
        if (channel === 'SMS' || channel === 'MMS') summary.hasReceivedSms = true;

        summary.lastMessageDate = latestDate(
          summary.lastMessageDate,
          msg.dateAdded ?? msg.createdAt,
        );
      }
    }
  }

  summary.hasReceivedMessage =
    summary.hasReceivedMessage ||
    summary.hasReceivedEmail ||
    summary.hasReceivedSms ||
    Boolean(summary.lastMessageDate);
  return summary;
}

export async function fetchGhlMessagingSummaryByContactIds(params: {
  accountKey: string;
  contactIds: string[];
}): Promise<{ summaryByContactId: Record<string, ContactMessagingSummary> }> {
  const { contactIds } = params;
  const accountKey = resolveAccountKey(params.accountKey);
  const credentials = await resolveGhlCredentials(accountKey);
  if (!credentials) {
    throw new GhlMessagingError('No GHL connection', 400);
  }

  const summaryByContactId: Record<string, ContactMessagingSummary> = {};
  const uncachedContactIds: string[] = [];

  for (const contactId of contactIds) {
    const cacheKey = `${accountKey}:${contactId}`;
    const cached = summaryCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < SUMMARY_CACHE_TTL_MS) {
      summaryByContactId[contactId] = cached.summary;
      continue;
    }
    uncachedContactIds.push(contactId);
  }

  const tasks = uncachedContactIds.map((contactId) => async () => {
    const summary = await fetchMessagingSummaryForContact(
      credentials.token,
      credentials.locationId,
      contactId,
    );
    summaryByContactId[contactId] = summary;
    summaryCache.set(`${accountKey}:${contactId}`, {
      summary,
      fetchedAt: Date.now(),
    });
  });

  await withConcurrencyLimit(tasks, 5);
  return { summaryByContactId };
}

export async function fetchGhlContactConversations(params: {
  accountKey: string;
  contactId: string;
}): Promise<ContactConversationPayload> {
  const { contactId } = params;
  const accountKey = resolveAccountKey(params.accountKey);
  const credentials = await resolveGhlCredentials(accountKey);
  if (!credentials) {
    throw new GhlMessagingError('No GHL connection', 400);
  }

  const headers = {
    Authorization: `Bearer ${credentials.token}`,
    Version: API_VERSION,
    Accept: 'application/json',
  };

  const searchParams = new URLSearchParams({
    locationId: credentials.locationId,
    contactId,
  });

  const convoRes = await fetch(
    `${GHL_BASE}/conversations/search?${searchParams.toString()}`,
    { headers },
  );

  if (!convoRes.ok) {
    if (convoRes.status === 403 || convoRes.status === 401) {
      return {
        conversations: [],
        messages: [],
        stats: {
          totalMessages: 0,
          smsCount: 0,
          emailCount: 0,
          lastMessageDate: null,
          lastMessageDirection: null,
        },
        error: 'Conversations scope not authorized. Re-connect GHL to enable.',
      };
    }
    throw new GhlMessagingError(`GHL API error (${convoRes.status})`, convoRes.status);
  }

  const convoData = await convoRes.json();
  const conversations = extractList(convoData, ['conversations', 'items', 'results']);
  const messages: ContactConversationPayload['messages'] = [];

  if (conversations.length > 0) {
    const conversationId = toSafeString(conversations[0]?.id);
    if (conversationId) {
      const msgRes = await fetch(
        `${GHL_BASE}/conversations/${conversationId}/messages`,
        { headers },
      );
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        const rawMessages = extractList(msgData, ['messages', 'items', 'results']);
        for (const msg of rawMessages.slice(0, 20)) {
          const id = toSafeString(msg.id) || `${conversationId}-${messages.length + 1}`;
          messages.push({
            id,
            channel: detectMessageChannel(msg),
            type: msg.type ?? msg.messageType ?? msg.contentType ?? '',
            direction: msg.direction ?? '',
            body: msg.body ?? msg.text ?? msg.message ?? '',
            dateAdded: msg.dateAdded ?? msg.createdAt ?? '',
            status: toSafeString(msg.status),
            contentType: msg.contentType ?? '',
            subject: msg.subject ?? '',
          });
        }
      }
    }
  }

  const smsCount = messages.filter((m) => m.channel === 'SMS' || m.channel === 'MMS').length;
  const emailCount = messages.filter((m) => m.channel === 'EMAIL').length;
  const lastMessage = messages.length > 0 ? messages[0] : null;

  return {
    conversations: conversations.map((c) => ({
      id: c.id,
      type: c.type,
      lastMessageDate: c.lastMessageDate,
      unreadCount: c.unreadCount,
    })),
    messages,
    stats: {
      totalMessages: messages.length,
      smsCount,
      emailCount,
      lastMessageDate: lastMessage ? toSafeString(lastMessage.dateAdded) : null,
      lastMessageDirection: lastMessage ? toSafeString(lastMessage.direction) : null,
    },
  };
}
