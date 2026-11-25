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

/** 2026-11-26 → 11.26. 목록 줄의 날짜(시안 A05·A06·A09). 값이 없으면 "미정" */
export function monthDay(s: string | null | undefined): string {
  if (!s) return '미정';
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return s;
  return `${m}.${String(d).padStart(2, '0')}`;
}

/** 시각(ISO) → 기기 날짜 기준 11.17. 요청함 줄 날짜(시안 A05, 사용자 선택 2026-11-17 "시안대로") */
export function dayMD(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
}

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

/** 부를 때 붙는 말: "비비라고", "몽글이라고"(받침이 있으면 "이라고") */
const hasBatchim = (name: string) => {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
};

export const callName = (name: string) => (hasBatchim(name) ? `${name}이라고` : `${name}라고`);

/** 비서 이름 + 주격 조사("비비가", "몽글이"). 확인 카드 제목에 쓴다 */
export const subjName = (name: string) => (hasBatchim(name) ? `${name}이` : `${name}가`);
