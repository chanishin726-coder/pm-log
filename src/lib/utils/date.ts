import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

export function formatLogDate(dateStr: string): string {
  return format(parseISO(dateStr), 'yyyy-MM-dd (EEE)', { locale: ko });
}

export function formatRelative(dateStr: string): string {
  return formatDistanceToNow(parseISO(dateStr), { addSuffix: true, locale: ko });
}

export function toYYYYMMDD(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}
