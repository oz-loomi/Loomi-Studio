export function isYagRollupAccount(key: string, dealer?: string | null): boolean {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedDealer = String(dealer || '').toLowerCase();

  if (normalizedDealer.includes('young automotive group')) return true;

  return (
    normalizedKey.includes('youngautomotivegroup') ||
    normalizedKey === 'yag' ||
    normalizedKey === 'youngag'
  );
}
