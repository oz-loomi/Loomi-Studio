export type IconColorCategory = 'contacts' | 'campaigns' | 'flows' | 'general';

export function iconColorHex(category: IconColorCategory): string {
  if (category === 'contacts') return '#a78bfa';
  if (category === 'campaigns') return '#60a5fa';
  if (category === 'flows') return '#fb923c';
  return 'hsl(var(--primary))';
}

export function iconColorClass(category: IconColorCategory): string {
  if (category === 'contacts') return 'text-violet-400';
  if (category === 'campaigns') return 'text-blue-400';
  if (category === 'flows') return 'text-orange-400';
  return 'text-[var(--primary)]';
}

export function iconColorHexForLabel(label: string): string {
  const value = label.trim().toLowerCase();
  if (value.includes('contact')) return iconColorHex('contacts');
  if (value.includes('campaign')) return iconColorHex('campaigns');
  if (value.includes('flow')) return iconColorHex('flows');
  return iconColorHex('general');
}

export function iconColorClassForLabel(label: string): string {
  const value = label.trim().toLowerCase();
  if (value.includes('contact')) return iconColorClass('contacts');
  if (value.includes('campaign')) return iconColorClass('campaigns');
  if (value.includes('flow')) return iconColorClass('flows');
  return iconColorClass('general');
}
