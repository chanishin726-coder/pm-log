import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

const KST = 'Asia/Seoul';

/** 서버/클라이언트 공통. 한국 시간(KST) 기준 오늘 날짜 YYYY-MM-DD */
export function getTodayKST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: KST });
}

export function formatLogDate(dateStr: string): string {
  return format(parseISO(dateStr), 'yyyy-MM-dd (EEE)', { locale: ko });
}

export function formatRelative(dateStr: string): string {
  return formatDistanceToNow(parseISO(dateStr), { addSuffix: true, locale: ko });
}

export function toYYYYMMDD(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}
