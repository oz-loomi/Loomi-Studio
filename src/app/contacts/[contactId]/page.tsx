'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from 'react';
import { useAccount } from '@/contexts/account-context';
import { providerUnsupportedMessage } from '@/lib/esp/provider-display';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  PaperAirplaneIcon,
  EnvelopeIcon,
  DevicePhoneMobileIcon,
  PhoneIcon,
  MapPinIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';

interface ContactDetail {
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
  profilePhoto?: string;
  dnd?: boolean;
  dndSettings?: unknown;
  _accountKey?: string;
}

interface AccountSummary {
  key: string;
  dealer: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  logos?: Record<string, unknown> | null;
}

interface ConvoMessage {
  id: string;
  channel?: unknown;
  type: unknown;
  direction: unknown;
  body: unknown;
  dateAdded: unknown;
  subject?: unknown;
  contentType?: unknown;
}

interface ConvoStats {
  totalMessages: number;
  smsCount: number;
  emailCount: number;
  lastMessageDate: string | null;
  lastMessageDirection: string | null;
}

interface ContactCapabilities {
  dnd: boolean;
  conversations: boolean;
  messaging: boolean;
}

type DndChannelKey = 'SMS' | 'Email' | 'Call' | 'Voicemail' | 'WhatsApp' | 'FB' | 'GMB';
type ComposeMessageChannel = 'SMS' | 'MMS';
interface DndChannelState {
  enabled: boolean;
  status: string;
  message: string;
  code: string;
}
type DndSettings = Record<DndChannelKey, DndChannelState>;

const DND_CHANNELS: Array<{
  key: DndChannelKey;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}> = [
  { key: 'Email', label: 'Email', icon: EnvelopeIcon },
  { key: 'SMS', label: 'SMS', icon: DevicePhoneMobileIcon },
  { key: 'Call', label: 'Call', icon: PhoneIcon },
  { key: 'Voicemail', label: 'Voicemail', icon: PhoneIcon },
  { key: 'WhatsApp', label: 'WhatsApp', icon: DevicePhoneMobileIcon },
  { key: 'FB', label: 'Facebook', icon: ChatBubbleLeftRightIcon },
  { key: 'GMB', label: 'Google Business', icon: MapPinIcon },
];

const DND_CHANNEL_KEYS: DndChannelKey[] = DND_CHANNELS.map((channel) => channel.key);

function emptyDndSettings(): DndSettings {
  return {
    SMS: { enabled: false, status: 'inactive', message: '', code: '' },
    Email: { enabled: false, status: 'inactive', message: '', code: '' },
    Call: { enabled: false, status: 'inactive', message: '', code: '' },
    Voicemail: { enabled: false, status: 'inactive', message: '', code: '' },
    WhatsApp: { enabled: false, status: 'inactive', message: '', code: '' },
    FB: { enabled: false, status: 'inactive', message: '', code: '' },
    GMB: { enabled: false, status: 'inactive', message: '', code: '' },
  };
}

function normalizeDndSettings(value: unknown): DndSettings {
  const base = emptyDndSettings();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base;

  const row = value as Record<string, unknown>;
  for (const key of DND_CHANNEL_KEYS) {
    const candidate = row[key];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const channel = candidate as Record<string, unknown>;
    const enabled = Boolean(channel.enabled);
    const status = toText(channel.status) || (enabled ? 'active' : 'inactive');
    base[key] = {
      enabled,
      status,
      message: toText(channel.message),
      code: toText(channel.code),
    };
  }

  return base;
}

function dndDraftFromSettings(settings: DndSettings): Record<DndChannelKey, boolean> {
  return {
    SMS: Boolean(settings.SMS.enabled),
    Email: Boolean(settings.Email.enabled),
    Call: Boolean(settings.Call.enabled),
    Voicemail: Boolean(settings.Voicemail.enabled),
    WhatsApp: Boolean(settings.WhatsApp.enabled),
    FB: Boolean(settings.FB.enabled),
    GMB: Boolean(settings.GMB.enabled),
  };
}

function dndSettingsFromDraft(draft: Record<DndChannelKey, boolean>): DndSettings {
  const settings = emptyDndSettings();
  for (const key of DND_CHANNEL_KEYS) {
    const enabled = Boolean(draft[key]);
    settings[key] = {
      enabled,
      status: enabled ? 'active' : 'inactive',
      message: '',
      code: '',
    };
  }
  return settings;
}

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatRelativeDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean).join(' ').trim();
  }

  if (typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return toText(
      row.value ??
      row.text ??
      row.message ??
      row.body ??
      row.subject ??
      row.url ??
      row.link ??
      row.label ??
      row.name ??
      row.type ??
      row.id,
    );
  }

  return '';
}

function isUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

function collectTextValues(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextValues(item));
  }

  if (typeof value === 'object') {
    const row = value as Record<string, unknown>;
    const prioritized = [
      row.body,
      row.text,
      row.message,
      row.subject,
      row.url,
      row.link,
      row.href,
      row.urls,
      row.attachments,
      row.files,
      row.media,
    ];
    const picked = prioritized.flatMap((item) => collectTextValues(item));
    if (picked.length > 0) return picked;
    return Object.values(row).flatMap((item) => collectTextValues(item));
  }

  return [];
}

function parseMessageContent(rawBody: unknown): { text: string; links: string[] } {
  let textParts: string[] = [];
  let links: string[] = [];

  if (typeof rawBody !== 'string') {
    const values = collectTextValues(rawBody).map((value) => value.trim()).filter(Boolean);
    for (const value of values) {
      if (isUrl(value)) links.push(value);
      else textParts.push(value);
    }
  } else {
    const initial = rawBody.trim();
    if (!initial) return { text: '', links: [] };

    if (initial.startsWith('[') || initial.startsWith('{')) {
      try {
        const parsed = JSON.parse(initial);
        const values = collectTextValues(parsed).map((value) => value.trim()).filter(Boolean);
        for (const value of values) {
          if (isUrl(value)) links.push(value);
          else textParts.push(value);
        }
      } catch {
        // Not valid JSON — continue with text parsing below.
      }
    }

    if (textParts.length === 0) textParts.push(initial);
  }

  if (textParts.length === 0 && links.length === 0) {
    const fallback = toText(rawBody).trim();
    if (!fallback) return { text: '', links: [] };
    textParts.push(fallback);
  }

  const fallbackLinks = textParts
    .flatMap((value) => value.match(/https?:\/\/[^\s\]'",)]+/gi) ?? [])
    .map((value) => value.trim())
    .filter(Boolean);

  if (links.length === 0 && fallbackLinks.length > 0) {
    links = fallbackLinks;
  }

  const dedupedLinks = [...new Set(links)];
  const cleanedText = textParts
    .join(' ')
    .replace(/https?:\/\/[^\s\]'",)]+/gi, '')
    .replace(/[\[\]{}"']/g, ' ')
    .replace(/[,;|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hasReadableText = /[a-z0-9]/i.test(cleanedText);

  return {
    text: hasReadableText ? cleanedText : '',
    links: dedupedLinks,
  };
}

function parseMediaUrlInput(raw: string): string[] {
  if (!raw.trim()) return [];
  const tokens = raw
    .split(/[\n,\s]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => /^https?:\/\/\S+$/i.test(item));
  return [...new Set(tokens)];
}

function normalizeMessageType(rawChannel: string, rawType: string, hasLinks: boolean, rawContentType: string): string {
  const channel = rawChannel.trim().toUpperCase();
  if (channel === 'EMAIL') return 'EMAIL';
  if (channel === 'SMS') return 'SMS';
  if (channel === 'MMS') return 'SMS';

  const cleaned = rawType.trim();
  if (cleaned) {
    const upper = cleaned.toUpperCase();
    if (['SMS', 'EMAIL', 'MMS', 'CALL', 'VOICEMAIL', 'CHAT'].includes(upper)) return upper;
    if (/^[a-z][a-z0-9 _-]*$/i.test(cleaned)) return upper;
  }

  const contentType = rawContentType.trim().toUpperCase();
  if (contentType.includes('EMAIL')) return 'EMAIL';
  if (contentType.includes('SMS')) return 'SMS';
  if (contentType.includes('MMS')) return 'MMS';

  return hasLinks ? 'MEDIA' : 'MESSAGE';
}

function normalizeAccountSummary(value: unknown): AccountSummary | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const key = toText(row.key);
  const dealer = toText(row.dealer);
  if (!key || !dealer) return null;

  const logos = row.logos && typeof row.logos === 'object'
    ? (row.logos as Record<string, unknown>)
    : null;

  return {
    key,
    dealer,
    address: toText(row.address),
    city: toText(row.city),
    state: toText(row.state),
    postalCode: toText(row.postalCode),
    logos,
  };
}

function accountLogoUrl(account: AccountSummary | null): string {
  if (!account?.logos) return '';
  const candidates = ['light', 'dark', 'white', 'black'] as const;
  for (const key of candidates) {
    const value = account.logos[key];
    const url = toText(value);
    if (url) return url;
  }
  return '';
}

function accountAddressLine(account: AccountSummary | null): string {
  if (!account) return '';
  const full = [account.address, account.city, account.state, account.postalCode]
    .filter(Boolean)
    .join(', ');
  if (!full) return '';
  return full.length > 64 ? `${full.slice(0, 64)}...` : full;
}

const DEFAULT_CONTACT_CAPABILITIES: ContactCapabilities = {
  dnd: false,
  conversations: false,
  messaging: false,
};

function normalizeContactCapabilities(value: unknown): ContactCapabilities {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    return {
      dnd: Boolean(row.dnd),
      conversations: Boolean(row.conversations),
      messaging: Boolean(row.messaging),
    };
  }

  return DEFAULT_CONTACT_CAPABILITIES;
}

export default function ContactDetailPage() {
  const { isAccount } = useAccount();
  const params = useParams<{ contactId: string | string[] }>();
  const searchParams = useSearchParams();
  const contactId = Array.isArray(params.contactId) ? params.contactId[0] : params.contactId;
  const accountKey = searchParams.get('accountKey') || '';

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [provider, setProvider] = useState('');
  const [capabilities, setCapabilities] = useState<ContactCapabilities>(DEFAULT_CONTACT_CAPABILITIES);
  const [contactLoading, setContactLoading] = useState(true);
  const [contactError, setContactError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ConvoMessage[]>([]);
  const [stats, setStats] = useState<ConvoStats | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [dndDraft, setDndDraft] = useState<Record<DndChannelKey, boolean>>(
    dndDraftFromSettings(emptyDndSettings()),
  );
  const [dndSaving, setDndSaving] = useState(false);
  const [dndError, setDndError] = useState<string | null>(null);
  const [dndSuccess, setDndSuccess] = useState<string | null>(null);
  const [smsChannel, setSmsChannel] = useState<ComposeMessageChannel>('SMS');
  const [smsMediaUrlsText, setSmsMediaUrlsText] = useState('');
  const [smsDraft, setSmsDraft] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsSuccess, setSmsSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!contactId || !accountKey) {
      setContactLoading(false);
      setMessagesLoading(false);
      setContactError('Missing contact identifier or account context.');
      setProvider('');
      setCapabilities(DEFAULT_CONTACT_CAPABILITIES);
      setAccount(null);
      return;
    }

    let active = true;

    async function load() {
      setContactLoading(true);
      setMessagesLoading(true);
      setContactError(null);
      setMessagesError(null);

      try {
        const contactRes = await fetch(
          `/api/esp/contacts/${encodeURIComponent(contactId)}?accountKey=${encodeURIComponent(accountKey)}`,
        );
        const contactData = await contactRes.json().catch(() => ({}));
        if (!contactRes.ok) {
          throw new Error(contactData.error || 'Failed to fetch contact');
        }

        const nextProvider = toText(contactData.provider).trim().toLowerCase();
        const nextCapabilities = normalizeContactCapabilities(contactData.capabilities);

        if (!active) return;

        setContact(contactData.contact || null);
        setAccount(normalizeAccountSummary(contactData.account));
        setProvider(nextProvider);
        setCapabilities(nextCapabilities);
        setContactLoading(false);

        if (!nextCapabilities.conversations) {
          setMessages([]);
          setStats(null);
          setMessagesError(providerUnsupportedMessage(nextProvider, 'conversation history'));
          setMessagesLoading(false);
          return;
        }

        const convoRes = await fetch(
          `/api/esp/contacts/${encodeURIComponent(contactId)}/conversations?accountKey=${encodeURIComponent(accountKey)}`,
        );
        const convoData = await convoRes.json().catch(() => ({}));
        if (!active) return;

        if (!convoRes.ok) {
          setMessagesError(convoData.error || 'Failed to fetch messages');
          setMessages([]);
          setStats(null);
        } else {
          setMessages(Array.isArray(convoData.messages) ? convoData.messages : []);
          setStats(convoData.stats || null);
          if (typeof convoData.error === 'string' && convoData.error) {
            setMessagesError(convoData.error);
          } else if (convoData.unsupported) {
            setMessagesError(providerUnsupportedMessage(nextProvider, 'conversation history'));
          } else {
            setMessagesError(null);
          }
        }
        setMessagesLoading(false);
      } catch (err) {
        if (!active) return;
        setContactError(err instanceof Error ? err.message : 'Failed to fetch contact');
        setProvider('');
        setCapabilities(DEFAULT_CONTACT_CAPABILITIES);
        setContactLoading(false);
        setMessagesLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [contactId, accountKey]);

  const fullName = useMemo(() => {
    if (!contact) return '';
    return contact.fullName || `${contact.firstName} ${contact.lastName}`.trim() || 'Unknown Contact';
  }, [contact]);

  const vehicleStr = useMemo(() => {
    if (!contact) return '';
    return [contact.vehicleYear, contact.vehicleMake, contact.vehicleModel].filter(Boolean).join(' ');
  }, [contact]);

  const contactAvatar = useMemo(() => toText(contact?.profilePhoto), [contact?.profilePhoto]);
  const addedDateLabel = useMemo(() => {
    if (!contact?.dateAdded) return '';
    return formatRelativeDate(contact.dateAdded) || formatDate(contact.dateAdded);
  }, [contact?.dateAdded]);
  const accountLogo = useMemo(() => accountLogoUrl(account), [account]);
  const accountAddress = useMemo(() => accountAddressLine(account), [account]);
  const currentDndSettings = useMemo(
    () => normalizeDndSettings(contact?.dndSettings),
    [contact?.dndSettings],
  );
  const dndDirty = useMemo(
    () =>
      DND_CHANNEL_KEYS.some((key) => Boolean(currentDndSettings[key]?.enabled) !== Boolean(dndDraft[key])),
    [currentDndSettings, dndDraft],
  );
  const dndEnabledCount = useMemo(
    () => DND_CHANNEL_KEYS.filter((key) => Boolean(dndDraft[key])).length,
    [dndDraft],
  );

  useEffect(() => {
    if (!contact) return;
    setDndDraft(dndDraftFromSettings(currentDndSettings));
    setDndError(null);
  }, [contact, currentDndSettings]);

  async function saveDndSettings() {
    if (!contactId || !accountKey) return;
    if (!capabilities.dnd) {
      setDndError(providerUnsupportedMessage(provider, 'channel-level DND settings'));
      return;
    }
    setDndSaving(true);
    setDndError(null);
    setDndSuccess(null);

    try {
      const payload: Record<string, boolean> = {};
      for (const key of DND_CHANNEL_KEYS) {
        payload[key] = Boolean(dndDraft[key]);
      }

      const res = await fetch(
        `/api/esp/contacts/${encodeURIComponent(contactId)}?accountKey=${encodeURIComponent(accountKey)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dndSettings: payload }),
        },
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to update DND settings');
      }

      const nextSettings = normalizeDndSettings(data?.contact?.dndSettings ?? dndSettingsFromDraft(dndDraft));
      setContact((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          dnd: Boolean(data?.contact?.dnd ?? DND_CHANNEL_KEYS.some((key) => nextSettings[key].enabled)),
          dndSettings: nextSettings,
        };
      });
      setDndDraft(dndDraftFromSettings(nextSettings));
      setDndSuccess('DND settings updated.');
    } catch (err) {
      setDndError(err instanceof Error ? err.message : 'Failed to update DND settings');
    } finally {
      setDndSaving(false);
    }
  }

  function resetDndSettings() {
    setDndDraft(dndDraftFromSettings(currentDndSettings));
    setDndError(null);
    setDndSuccess(null);
  }

  async function sendSmsMessage() {
    if (!contactId || !accountKey) return;
    if (!capabilities.messaging) {
      setSmsError(providerUnsupportedMessage(provider, 'direct 1:1 messaging'));
      return;
    }
    const message = smsDraft.trim();
    const mediaUrls = parseMediaUrlInput(smsMediaUrlsText);
    if (!message && mediaUrls.length === 0) {
      setSmsError(`Enter a ${smsChannel} message or at least one media URL.`);
      return;
    }
    if (message.length > 640) {
      setSmsError(`${smsChannel} must be 640 characters or fewer.`);
      return;
    }
    if (currentDndSettings.SMS.enabled) {
      setSmsError('This contact has SMS DND enabled. Unblock SMS first.');
      return;
    }

    setSmsSending(true);
    setSmsError(null);
    setSmsSuccess(null);

    try {
      const res = await fetch(
        `/api/esp/contacts/${encodeURIComponent(contactId)}/messages?accountKey=${encodeURIComponent(accountKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: smsChannel,
            message,
            mediaUrls,
          }),
        },
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to send message');
      }

      const sentMessage = (data?.message && typeof data.message === 'object') ? data.message as Record<string, unknown> : null;
      const normalized: ConvoMessage = {
        id: toText(sentMessage?.id) || `local-${Date.now()}`,
        channel: sentMessage?.channel ?? smsChannel,
        type: sentMessage?.type ?? smsChannel,
        direction: sentMessage?.direction ?? 'outbound',
        body: sentMessage?.body ?? message,
        dateAdded: sentMessage?.dateAdded ?? new Date().toISOString(),
        subject: sentMessage?.subject ?? '',
        contentType: sentMessage?.contentType ?? '',
      };

      setMessages((prev) => [normalized, ...prev]);
      setStats((prev) => {
        const channel = toText(normalized.channel).toUpperCase();
        const isEmail = channel === 'EMAIL';
        const isSms = channel === 'SMS' || channel === 'MMS';
        const totalMessages = (prev?.totalMessages ?? 0) + 1;
        const smsCount = (prev?.smsCount ?? 0) + (isSms ? 1 : 0);
        const emailCount = (prev?.emailCount ?? 0) + (isEmail ? 1 : 0);
        return {
          totalMessages,
          smsCount,
          emailCount,
          lastMessageDate: toText(normalized.dateAdded) || new Date().toISOString(),
          lastMessageDirection: toText(normalized.direction) || 'outbound',
        };
      });
      setSmsDraft('');
      setSmsMediaUrlsText('');
      setSmsSuccess(`${smsChannel} sent.`);
    } catch (err) {
      setSmsError(err instanceof Error ? err.message : `Failed to send ${smsChannel}`);
    } finally {
      setSmsSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="page-sticky-header">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/contacts"
              className="mt-0.5 p-2 rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--primary)]/40 transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </Link>

            <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center bg-[var(--primary)]/15 text-[var(--primary)] font-semibold flex-shrink-0">
              {contactAvatar ? (
                <img src={contactAvatar} alt={fullName || 'Contact avatar'} className="w-full h-full object-cover" />
              ) : (
                <span>{(contact?.firstName || fullName || '?').charAt(0).toUpperCase()}</span>
              )}
            </div>

            <div className="min-w-0">
              <h2 className="text-2xl font-bold truncate">{fullName || 'Contact Details'}</h2>
              <p className="text-[var(--muted-foreground)] mt-1">
                {contact ? `Added ${addedDateLabel || 'Unknown date'}` : 'Loading contact details...'}
              </p>
            </div>
          </div>

          {account && !isAccount && (
            <Link
              href={`/contacts?account=${encodeURIComponent(account.key)}`}
              className="glass-card rounded-xl border border-[var(--border)]/70 px-3 py-2 min-w-[280px] max-w-[360px] hover:border-[var(--primary)]/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center bg-[var(--muted)]/35 text-[var(--foreground)] font-semibold flex-shrink-0">
                  {accountLogo ? (
                    <img src={accountLogo} alt={account.dealer} className="w-full h-full object-contain" />
                  ) : (
                    <span>{account.dealer.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">Account</p>
                  <p className="text-sm font-medium truncate">{account.dealer}</p>
                  <p className="text-xs text-[var(--muted-foreground)] truncate">
                    {accountAddress || 'No address on file'}
                  </p>
                  <p className="text-[11px] text-[var(--primary)] mt-1 truncate">View account contacts</p>
                </div>
                <ArrowTopRightOnSquareIcon className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" />
              </div>
            </Link>
          )}
        </div>
      </div>

      {contactLoading && (
        <div className="glass-card rounded-xl p-8 text-center text-[var(--muted-foreground)]">
          <ArrowPathIcon className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading contact details...
        </div>
      )}

      {!contactLoading && contactError && (
        <div className="glass-card rounded-xl p-6 border border-red-500/20 text-red-300 text-sm">
          {contactError}
        </div>
      )}

      {!contactLoading && contact && (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-4">
              <section className="glass-card rounded-xl p-4 border border-[var(--border)]/70">
                <h3 className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-3">
                  Contact
                </h3>
                <div className="grid gap-2.5 sm:grid-cols-2 text-sm">
                  <InfoPill icon={<EnvelopeIcon className="w-4 h-4" />} label="Email" value={contact.email} />
                  <InfoPill icon={<PhoneIcon className="w-4 h-4" />} label="Phone" value={contact.phone} />
                  <InfoPill
                    icon={<MapPinIcon className="w-4 h-4" />}
                    label="Address"
                    value={[contact.address1, contact.city, contact.state, contact.postalCode].filter(Boolean).join(', ')}
                    className="sm:col-span-2"
                  />
                </div>
              </section>

              <section className="glass-card rounded-xl p-4 border border-[var(--border)]/70">
                <h3 className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1">
                  Do Not Disturb
                </h3>
                <p className="text-[11px] text-[var(--muted-foreground)] mb-3">
                  Manage channel opt-outs for this contact.
                </p>

                {capabilities.dnd ? (
                  <>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {DND_CHANNELS.map((channel) => (
                        <DndToggleTile
                          key={channel.key}
                          label={channel.label}
                          enabled={Boolean(dndDraft[channel.key])}
                          status={currentDndSettings[channel.key]?.status || (dndDraft[channel.key] ? 'active' : 'inactive')}
                          onToggle={() =>
                            setDndDraft((prev) => ({ ...prev, [channel.key]: !prev[channel.key] }))
                          }
                          icon={channel.icon}
                        />
                      ))}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-[11px] text-[var(--muted-foreground)]">
                        {dndEnabledCount} channel{dndEnabledCount === 1 ? '' : 's'} blocked
                      </p>
                      <div className="flex items-center gap-2">
                        {dndDirty && (
                          <button
                            type="button"
                            onClick={resetDndSettings}
                            disabled={dndSaving}
                            className="px-2.5 py-1.5 text-[11px] rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-60"
                          >
                            Reset
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={saveDndSettings}
                          disabled={!dndDirty || dndSaving}
                          className="px-2.5 py-1.5 text-[11px] rounded-lg border border-[var(--primary)] bg-[var(--primary)]/90 text-white hover:bg-[var(--primary)] disabled:opacity-60"
                        >
                          {dndSaving ? 'Saving...' : 'Save DND'}
                        </button>
                      </div>
                    </div>

                    {dndError && (
                      <p className="mt-2 text-[11px] text-red-300">{dndError}</p>
                    )}
                    {dndSuccess && !dndError && (
                      <p className="mt-2 text-[11px] text-emerald-300">{dndSuccess}</p>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    {providerUnsupportedMessage(provider, 'channel-level DND controls')}.
                  </p>
                )}
              </section>

              <section className="glass-card rounded-xl p-4 border border-[var(--border)]/70">
                <h3 className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-3">
                  Vehicle
                </h3>
                <div className="grid gap-3 sm:grid-cols-3 text-sm">
                  <StatTile label="Primary Vehicle" value={vehicleStr || 'No vehicle data'} />
                  <StatTile label="VIN" value={contact.vehicleVin || '—'} mono />
                  <StatTile label="Mileage" value={contact.vehicleMileage || '—'} />
                </div>
              </section>

              <section className="glass-card rounded-xl p-4 border border-[var(--border)]/70">
                <h3 className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-3 flex items-center gap-1.5">
                  <ClockIcon className="w-3.5 h-3.5" />
                  Lifecycle
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <LifecycleItem label="Last Service" dateStr={contact.lastServiceDate} type="past" />
                  <LifecycleItem label="Next Service" dateStr={contact.nextServiceDate} type="future" />
                  <LifecycleItem label="Purchase Date" dateStr={contact.purchaseDate} type="past" />
                  <LifecycleItem label="Lease End" dateStr={contact.leaseEndDate} type="future" />
                  <LifecycleItem label="Warranty End" dateStr={contact.warrantyEndDate} type="future" />
                </div>
              </section>
            </div>

            <section className="glass-card rounded-xl p-4 border border-[var(--border)]/70 h-fit">
              <h3 className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-3 flex items-center gap-1.5">
                <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />
                Messages
              </h3>

              {capabilities.messaging ? (
                <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-[11px] font-medium">Send 1:1 Message</p>
                    {capabilities.dnd && currentDndSettings.SMS.enabled && (
                      <span className="text-[10px] text-amber-300">SMS DND enabled</span>
                    )}
                  </div>

                  <div className="mb-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSmsChannel('SMS')}
                      disabled={smsSending}
                      className={`px-2 py-1 text-[10px] rounded border ${
                        smsChannel === 'SMS'
                          ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]'
                          : 'border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      SMS
                    </button>
                    <button
                      type="button"
                      onClick={() => setSmsChannel('MMS')}
                      disabled={smsSending}
                      className={`px-2 py-1 text-[10px] rounded border ${
                        smsChannel === 'MMS'
                          ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]'
                          : 'border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      MMS
                    </button>
                  </div>

                  <textarea
                    value={smsDraft}
                    onChange={(event) => {
                      setSmsDraft(event.target.value);
                      if (smsError) setSmsError(null);
                      if (smsSuccess) setSmsSuccess(null);
                    }}
                    placeholder={smsChannel === 'MMS' ? 'Write an MMS caption (optional if media URLs provided)...' : 'Write an SMS message...'}
                    rows={3}
                    maxLength={640}
                    className="w-full text-xs rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 focus:outline-none focus:border-[var(--primary)]"
                  />

                  {smsChannel === 'MMS' && (
                    <textarea
                      value={smsMediaUrlsText}
                      onChange={(event) => {
                        setSmsMediaUrlsText(event.target.value);
                        if (smsError) setSmsError(null);
                        if (smsSuccess) setSmsSuccess(null);
                      }}
                      placeholder="Media URLs (one per line)"
                      rows={2}
                      className="mt-2 w-full text-xs rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 focus:outline-none focus:border-[var(--primary)]"
                    />
                  )}

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      {smsDraft.trim().length}/640
                    </span>
                    <button
                      type="button"
                      onClick={sendSmsMessage}
                      disabled={smsSending || (capabilities.dnd && currentDndSettings.SMS.enabled) || (!smsDraft.trim() && (smsChannel !== 'MMS' || parseMediaUrlInput(smsMediaUrlsText).length === 0))}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-lg border border-[var(--primary)] bg-[var(--primary)]/90 text-white hover:bg-[var(--primary)] disabled:opacity-60"
                    >
                      {smsSending ? (
                        <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <PaperAirplaneIcon className="w-3.5 h-3.5" />
                      )}
                      {smsSending ? 'Sending...' : `Send ${smsChannel}`}
                    </button>
                  </div>

                  {smsError && <p className="mt-2 text-[11px] text-red-300">{smsError}</p>}
                  {smsSuccess && !smsError && <p className="mt-2 text-[11px] text-emerald-300">{smsSuccess}</p>}
                </div>
              ) : (
                <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 p-2.5">
                  <p className="text-[11px] font-medium">Send 1:1 Message</p>
                  <p className="text-[11px] text-[var(--muted-foreground)] mt-1">
                    {providerUnsupportedMessage(provider, 'direct 1:1 messaging')}.
                  </p>
                </div>
              )}

              {messagesLoading && (
                <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                  <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                  Loading conversation history...
                </div>
              )}

              {!messagesLoading && stats && stats.totalMessages > 0 && (
                <div className="flex items-center gap-3 text-[11px] text-[var(--muted-foreground)] mb-3">
                  <span>{stats.totalMessages} total</span>
                  {stats.smsCount > 0 && <span>{stats.smsCount} SMS</span>}
                  {stats.emailCount > 0 && <span>{stats.emailCount} email</span>}
                </div>
              )}

              {!messagesLoading && messagesError && messages.length === 0 && (
                <p className="text-xs text-[var(--muted-foreground)] italic">{messagesError}</p>
              )}

              {!messagesLoading && messagesError && messages.length > 0 && (
                <p className="text-[11px] text-amber-300/90 mb-2">{messagesError}</p>
              )}

              {!messagesLoading && !messagesError && messages.length === 0 && (
                <p className="text-xs text-[var(--muted-foreground)] italic">No messages found.</p>
              )}

              {messages.length > 0 && (
                <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
                  {messages.slice(0, 20).map((msg, idx) => {
                    const direction = toText(msg.direction).toLowerCase();
                    const content = parseMessageContent(msg.body);
                    const typeLabel = normalizeMessageType(
                      toText(msg.channel),
                      toText(msg.type),
                      content.links.length > 0,
                      toText(msg.contentType),
                    );
                    const subjectText = toText(msg.subject);
                    const dateLabel = formatRelativeDate(toText(msg.dateAdded));
                    const isInbound = direction.includes('inbound');
                    const isEmail = typeLabel === 'EMAIL';
                    const isSms = typeLabel === 'SMS' || typeLabel === 'MMS';
                    const itemKey = toText(msg.id) || `${toText(msg.dateAdded)}-${idx}`;
                    const bodyText = content.text || 'No text content';
                    const metaLabel = `${isInbound ? 'Inbound' : 'Outbound'}${typeLabel !== 'MESSAGE' ? ` • ${isEmail ? 'Email' : typeLabel}` : ''}`;
                    const channelIcon = isEmail
                      ? <EnvelopeIcon className="w-3.5 h-3.5" />
                      : isSms
                      ? <DevicePhoneMobileIcon className="w-3.5 h-3.5" />
                      : <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />;

                    return (
                      <div
                        key={itemKey}
                        className={`rounded-lg p-2.5 border ${
                          isInbound
                            ? 'bg-[var(--primary)]/6 border-[var(--primary)]/25'
                            : 'bg-[var(--muted)]/30 border-[var(--border)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] mb-1.5">
                          <span className="font-medium inline-flex items-center gap-1.5">
                            {channelIcon}
                            {metaLabel}
                          </span>
                          <span className="text-[var(--muted-foreground)]">{dateLabel}</span>
                        </div>
                        {subjectText && subjectText !== bodyText && (
                          <p className="text-[11px] font-medium mb-1 truncate">{subjectText}</p>
                        )}
                        <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-3">
                          {bodyText}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function InfoPill({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  if (!value) return null;
  return (
    <div className={`rounded-lg border border-[var(--border)] bg-[var(--muted)]/25 px-3 py-2 ${className || ''}`}>
      <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-1">{label}</p>
      <div className="flex items-start gap-2 text-[var(--foreground)]">
        <span className="text-[var(--muted-foreground)] mt-0.5">{icon}</span>
        <span className="break-words">{value}</span>
      </div>
    </div>
  );
}

function DndToggleTile({
  label,
  enabled,
  status,
  onToggle,
  icon: Icon,
}: {
  label: string;
  enabled: boolean;
  status: string;
  onToggle: () => void;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
        enabled
          ? 'border-[var(--primary)]/45 bg-[var(--primary)]/10'
          : 'border-[var(--border)] bg-[var(--muted)]/25 hover:border-[var(--primary)]/30'
      }`}
      aria-pressed={enabled}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" />
          <span className="text-sm truncate">{label}</span>
        </div>
        <span
          className={`inline-flex w-8 h-4 rounded-full border transition-colors ${
            enabled
              ? 'bg-[var(--primary)] border-[var(--primary)]'
              : 'bg-transparent border-[var(--border)]'
          }`}
        >
          <span
            className={`w-3 h-3 rounded-full bg-white mt-[1px] transition-transform ${
              enabled ? 'translate-x-4' : 'translate-x-[1px]'
            }`}
          />
        </span>
      </div>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
        {status || (enabled ? 'active' : 'inactive')}
      </p>
    </button>
  );
}

function StatTile({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/25 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">{label}</p>
      <p className={`mt-1 text-sm ${mono ? 'font-mono text-xs break-all' : ''}`}>{value}</p>
    </div>
  );
}

function LifecycleItem({
  label,
  dateStr,
  type,
}: {
  label: string;
  dateStr: string;
  type: 'past' | 'future';
}) {
  if (!dateStr) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/25 px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">{label}</p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">No data</p>
      </div>
    );
  }

  const days = daysUntil(dateStr);
  let status = '';
  let statusClass = 'text-[var(--muted-foreground)]';
  if (type === 'future' && days !== null) {
    if (days < 0) {
      status = `${Math.abs(days)}d overdue`;
      statusClass = 'text-red-400';
    } else if (days <= 30) {
      status = `${days}d`;
      statusClass = 'text-amber-400';
    } else {
      status = `${days}d`;
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/25 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-sm">{formatDate(dateStr)}</span>
        {status ? <span className={`text-[11px] font-medium ${statusClass}`}>{status}</span> : null}
      </div>
    </div>
  );
}
