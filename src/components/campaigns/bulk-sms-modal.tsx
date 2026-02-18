'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Contact } from '@/components/contacts/contacts-table';
import {
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  PaperAirplaneIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

interface BulkSmsCampaignResponse {
  id: string;
  status: string;
  scheduledFor: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
}

type ComposeMessageChannel = 'SMS' | 'MMS';

interface BulkSmsModalProps {
  open: boolean;
  onClose: () => void;
  contacts: Contact[];
  activeAudienceId?: string | null;
}

function toLocalDateTimeInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function parseMediaUrlInput(raw: string): string[] {
  if (!raw.trim()) return [];
  const urls = raw
    .split(/[\n,\s]+/g)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => /^https?:\/\/\S+$/i.test(value));
  return [...new Set(urls)];
}

export function BulkSmsModal({
  open,
  onClose,
  contacts,
  activeAudienceId = null,
}: BulkSmsModalProps) {
  const [channel, setChannel] = useState<ComposeMessageChannel>('SMS');
  const [mediaUrlsText, setMediaUrlsText] = useState('');
  const [message, setMessage] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(toLocalDateTimeInputValue(new Date(Date.now() + 15 * 60_000)));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const recipients = useMemo(
    () =>
      contacts
        .filter((contact) => Boolean(contact.id && contact._accountKey && contact.phone))
        .map((contact) => ({
          contactId: contact.id,
          accountKey: contact._accountKey as string,
          phone: contact.phone,
          fullName: contact.fullName || `${contact.firstName} ${contact.lastName}`.trim(),
        })),
    [contacts],
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccess(null);
  }, [open, contacts.length]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !sending) {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, sending, onClose]);

  if (!open) return null;

  async function submit() {
    const trimmedMessage = message.trim();
    const mediaUrls = parseMediaUrlInput(mediaUrlsText);
    if (!trimmedMessage && mediaUrls.length === 0) {
      setError('Message or media URL is required.');
      return;
    }
    if (trimmedMessage.length > 640) {
      setError(`${channel} must be 640 characters or fewer.`);
      return;
    }
    if (recipients.length === 0) {
      setError('No sendable contacts in the current filtered list.');
      return;
    }

    let scheduledIso = '';
    if (scheduled) {
      const parsed = new Date(scheduledAt);
      if (Number.isNaN(parsed.getTime())) {
        setError('Choose a valid scheduled time.');
        return;
      }
      scheduledIso = parsed.toISOString();
    }

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const processNow = !scheduledIso || new Date(scheduledIso).getTime() <= Date.now();
      const res = await fetch('/api/esp/messages/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: activeAudienceId ? `Audience ${activeAudienceId}` : 'Filtered Contacts',
          message: trimmedMessage,
          channel,
          mediaUrls,
          recipients,
          scheduledFor: scheduledIso || null,
          processNow,
          audienceId: activeAudienceId || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to send bulk message');
      }

      const campaign = (data?.campaign || {}) as Partial<BulkSmsCampaignResponse>;
      const status = String(campaign.status || '').toLowerCase();
      if (status === 'scheduled' && campaign.scheduledFor) {
        setSuccess(
          `Scheduled ${campaign.totalRecipients || recipients.length} ${channel} messages for ${formatDateTime(campaign.scheduledFor)}.`,
        );
      } else {
        setSuccess(
          `Sent ${campaign.sentCount ?? 0} ${channel} message${(campaign.sentCount ?? 0) === 1 ? '' : 's'}${
            (campaign.failedCount ?? 0) > 0 ? ` (${campaign.failedCount} failed)` : ''
          }.`,
        );
      }
      setMessage('');
      setMediaUrlsText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send bulk message');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4"
      onClick={() => {
        if (!sending) onClose();
      }}
    >
      <div
        className="glass-modal w-full max-w-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <ChatBubbleLeftRightIcon className="w-4 h-4" />
              Bulk {channel}
            </h3>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              Send to the contacts currently visible in this filtered list.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">Filtered</p>
              <p className="text-sm font-medium mt-1">{contacts.length}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">Sendable</p>
              <p className="text-sm font-medium mt-1">{recipients.length}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2 col-span-2 sm:col-span-1">
              <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">Audience</p>
              <p className="text-sm font-medium mt-1 truncate">{activeAudienceId || 'Filtered list'}</p>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[var(--muted-foreground)] mb-1.5">
              Message
            </label>
            <div className="mb-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setChannel('SMS')}
                disabled={sending}
                className={`px-2 py-1 text-[10px] rounded border ${
                  channel === 'SMS'
                    ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]'
                    : 'border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                SMS
              </button>
              <button
                type="button"
                onClick={() => setChannel('MMS')}
                disabled={sending}
                className={`px-2 py-1 text-[10px] rounded border ${
                  channel === 'MMS'
                    ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]'
                    : 'border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                MMS
              </button>
            </div>
            <textarea
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                if (error) setError(null);
                if (success) setSuccess(null);
              }}
              placeholder={channel === 'MMS' ? 'Write an MMS caption (optional if media URLs provided)...' : 'Write your SMS...'}
              rows={5}
              maxLength={640}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--primary)]"
            />
            {channel === 'MMS' && (
              <textarea
                value={mediaUrlsText}
                onChange={(event) => {
                  setMediaUrlsText(event.target.value);
                  if (error) setError(null);
                  if (success) setSuccess(null);
                }}
                placeholder="Media URLs (one per line)"
                rows={2}
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs focus:outline-none focus:border-[var(--primary)]"
              />
            )}
            <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
              {message.trim().length}/640
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/15 px-3 py-2.5">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={scheduled}
                onChange={(event) => setScheduled(event.target.checked)}
                className="rounded border-[var(--border)]"
              />
              Schedule for later
            </label>
            {scheduled && (
              <div className="mt-2">
                <label className="block text-[11px] text-[var(--muted-foreground)] mb-1">Send at</label>
                <div className="flex items-center gap-2">
                  <ClockIcon className="w-4 h-4 text-[var(--muted-foreground)]" />
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    min={toLocalDateTimeInputValue(new Date())}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-300">{error}</p>
          )}
          {success && !error && (
            <p className="text-xs text-emerald-300">{success}</p>
          )}
        </div>

        <div className="p-4 border-t border-[var(--border)] flex items-center justify-between gap-2">
          <p className="text-[10px] text-[var(--muted-foreground)]">
            Contacts without phone numbers are skipped automatically.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="px-3 py-2 text-xs rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={sending || recipients.length === 0 || (!message.trim() && (channel !== 'MMS' || parseMediaUrlInput(mediaUrlsText).length === 0))}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-[var(--primary)] bg-[var(--primary)]/90 text-white hover:bg-[var(--primary)] disabled:opacity-50"
            >
              {sending ? (
                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <PaperAirplaneIcon className="w-3.5 h-3.5" />
              )}
              {sending ? 'Sending...' : scheduled ? `Schedule ${channel}` : `Send ${channel}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
