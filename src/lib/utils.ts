import { format, formatDistanceToNow, parseISO } from 'date-fns';

export function formatDate(dateStr: string | null | undefined, fmt = 'dd MMM yyyy'): string {
  if (!dateStr) return '—';
  try { return format(parseISO(dateStr), fmt); } catch { return '—'; }
}

export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try { return formatDistanceToNow(parseISO(dateStr), { addSuffix: true }); } catch { return '—'; }
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function truncate(str: string, len = 80): string {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

export function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export const PLATFORM_ICONS: Record<string, string> = {
  android: '🤖', ios: '🍎', web: '🌐', desktop: '🖥️', backend: '⚙️', cross_platform: '📱',
};

export const PLATFORM_LABELS: Record<string, string> = {
  android: 'Android', ios: 'iOS', web: 'Web', desktop: 'Desktop', backend: 'Backend', cross_platform: 'Cross-Platform',
};
