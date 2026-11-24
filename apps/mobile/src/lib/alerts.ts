// 알림(2026-11-24, Muse 피드의 사건 카드 패턴). 단추 notifications 를 그대로 읽는다(최근 30개, 단추가 만든 문장).
// 순서는 단추가 준 시간순 그대로이고, 앱이 고르거나 강조하지 않는다. 요청 번호가 있으면 그 요청 화면으로 간다.
import type { AgentRole } from '@/lib/agentClient';

export interface AlertItem {
  id: string;
  /** 단추 알림 종류: 접수·배포·견적·비교·선정·계약·기관·시스템 */
  kind: string;
  title: string;
  body: string;
  /** 단추 웹 경로 */
  href: string | null;
  read: boolean;
  at: string;
}

const NO = /DC-\d{4}-\d{4,6}/;

/** 알림이 가리키는 요청 번호(없으면 null) */
export const alertRfqNo = (a: Pick<AlertItem, 'href'>): string | null => a.href?.match(NO)?.[0] ?? null;

/** 앱 안에서 열 곳. 요청 번호가 없으면 null(단추 웹으로 연다) */
export function alertHref(role: AgentRole, a: Pick<AlertItem, 'href'>) {
  const no = alertRfqNo(a);
  if (!no) return null;
  return role === 'cro' ? ({ pathname: '/lab/[id]', params: { id: no } } as const) : ({ pathname: '/requester/[id]', params: { id: no } } as const);
}

/** 날짜 묶음 이름: 오늘, 어제, 11월 20일 (기기 시간) */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 864e5);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 날짜별로 묶는다. 단추가 준 순서를 그대로 둔다 */
export function groupByDay(items: AlertItem[], now = new Date()): { day: string; items: AlertItem[] }[] {
  const out: { day: string; items: AlertItem[] }[] = [];
  for (const it of items) {
    const day = dayLabel(it.at, now);
    const last = out.at(-1);
    if (last && last.day === day) last.items.push(it);
    else out.push({ day, items: [it] });
  }
  return out;
}

export const unreadCount = (items: AlertItem[]) => items.filter((i) => !i.read).length;
