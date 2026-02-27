const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'trashmail.com',
  'yopmail.com',
]);

export function normalizeEmailAddress(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

export function isLikelyDeliverableEmail(value: string | null | undefined): boolean {
  const email = normalizeEmailAddress(value);
  if (!email) return false;
  if (!EMAIL_REGEX.test(email)) return false;

  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return false;

  return true;
}

export function normalizePhoneNumber(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const hasPlus = raw.startsWith('+');
  const digitsOnly = raw.replace(/\D+/g, '');
  if (!digitsOnly) return '';

  return hasPlus ? `+${digitsOnly}` : digitsOnly;
}

export function isLikelyDialablePhone(value: string | null | undefined): boolean {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return false;

  const digits = normalized.startsWith('+')
    ? normalized.slice(1)
    : normalized;

  return digits.length >= 10 && digits.length <= 15;
}
