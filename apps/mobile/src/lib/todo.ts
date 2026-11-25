// 할 일 탭(시안 원본 m07) 줄 만들기. "지켜보는 중"은 기한이 있거나 움직이는 요청, "목표"는 기관의 이번 달 수주 목표.
// 문장은 단추가 준 다음 할 일·기한에서만 만든다. 숫자는 단추 보고(코드 계산) 그대로.
import type { InboxItem } from './inbox';
import type { DanchuLabItem } from './marketClient';

export interface WatchRow {
  id: string;
  title: string;
  sub: string;
}

const md = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`;

/** 기관: 할 일·결정·작업·선정 묶음. 기한 이른 순(기한 없는 것은 뒤), 같은 기한은 단추 순서 */
export function labWatch(items: DanchuLabItem[]): WatchRow[] {
  const open = items.filter((x) => x.group === 'todo' || x.group === 'decide' || x.group === 'work' || x.group === 'won');
  const sorted = open.map((x, i) => ({ x, i })).sort((a, b) => (a.x.due ?? '9999').localeCompare(b.x.due ?? '9999') || a.i - b.i);
  return sorted.map(({ x }) => ({
    id: x.no,
    title: `${x.no} ${x.next}`.trim(),
    sub: x.due ? `${md(x.due)}까지예요. ${x.stage}이에요.` : `${x.stage}이에요. 기한은 아직 없어요.`,
  }));
}

const REQ_SUB: Partial<Record<InboxItem['status'], string>> = {
  drafting: '요청서를 쓰는 중이에요.',
  waiting: '보낼 본문이 준비됐어요. 허용하면 보내요.',
  sent: '회신을 기다리는 중이에요.',
  replied: '회신이 도착했어요.',
};

/** 의뢰자: 선정·닫힘 전 요청. 요청함 순서 그대로 */
export function requesterWatch(items: InboxItem[]): WatchRow[] {
  return items
    .filter((x) => REQ_SUB[x.status])
    .map((x) => ({ id: x.id, title: x.title, sub: `${REQ_SUB[x.status]} ${x.sub}`.trim() }));
}

export interface ReportView {
  won: number;
  funnel: { stage: string; label: string; count: number }[];
}

/** 목표 줄 설명: "지금 2건. 회신 대기 4건, 협의 중 2건이에요." */
export function goalSub(r: ReportView | null): string {
  if (!r) return '이번 달 수를 세는 중이에요.';
  const rest = r.funnel.filter((f) => f.count > 0).slice(0, 2);
  return rest.length ? `지금 ${r.won}건. ${rest.map((f) => `${f.label} ${f.count}건`).join(', ')}이에요.` : `지금 ${r.won}건이에요.`;
}

/** 이번 달 1일과 오늘(한국 시각, YYYY-MM-DD) */
export function monthRange(now = new Date()): { from: string; to: string; month: number } {
  const k = new Date(now.getTime() + 9 * 3600e3);
  const y = k.getUTCFullYear();
  const m = k.getUTCMonth() + 1;
  const d = k.getUTCDate();
  const p = (n: number) => String(n).padStart(2, '0');
  return { from: `${y}-${p(m)}-01`, to: `${y}-${p(m)}-${p(d)}`, month: m };
}
