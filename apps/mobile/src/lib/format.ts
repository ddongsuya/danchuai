// 화면 표시 도우미(순수 함수).

/** 오늘·어제·M월 D일 (기기 시간대) */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 기관 이름 첫 글자(아바타) */
export const initialOf = (name: string) => Array.from(name.trim())[0] ?? '?';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string | undefined): v is string => typeof v === 'string' && UUID.test(v);

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-11-26 → 11.26(목). 날짜 글자 그대로 요일을 계산한다(시간대 영향 없음). 값이 없으면 "미정" */
export function shortDate(s: string | null | undefined): string {
  if (!s) return '미정';
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return s;
  return `${m}.${d}(${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

/** 기한까지 남은 날(기기 날짜 기준). 오늘이 기한이면 0, 지났으면 음수. 날짜를 못 읽으면 null */
export function daysLeft(s: string | null | undefined, now = new Date()): number | null {
  if (!s) return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
}

/** 시각(ISO)을 기기 날짜 YYYY-MM-DD로. shortDate와 함께 쓴다 */
export function localDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
