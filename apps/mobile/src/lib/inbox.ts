// 요청함 한 줄. 의뢰자와 기관이 같은 틀을 쓰고 상태 이름만 다르다. 서버 목록 순서(최근 순)는 바꾸지 않는다.
import { dayLabel } from './format';
import type { DanchuLabItem, LabInboxItem, RequesterListItem } from './marketClient';

export type InboxStatus = 'new' | 'viewed' | 'waiting' | 'drafting' | 'sent' | 'replied' | 'selected' | 'not_selected' | 'closed';

export interface InboxItem {
  id: string;
  title: string;
  sub: string;
  status: InboxStatus;
  when: string;
  /** 할 일 기한(기관 받은 요청). 있으면 목록에서 날짜 대신 보인다("참여 결정 11.20까지") */
  due?: string;
  icon: 'flask' | 'dna' | 'drop';
}

/** 제목으로 아이콘만 고른다(분류·순위와 무관) */
export function iconOf(title: string): InboxItem['icon'] {
  if (/돌연변이|유전독성|소핵|염색체/.test(title)) return 'dna';
  if (/약동학|PK|TK/i.test(title)) return 'drop';
  return 'flask';
}

export function requesterItem(r: RequesterListItem, now = new Date()): InboxItem {
  // 단추 요청: 비교표가 열리기 전에는 제출 수만, 열린 뒤에 회신 도착
  if (r.compareOpen !== undefined && r.status === 'sent') {
    return {
      id: r.requestId ?? `c:${r.conversationId}`,
      title: r.title,
      sub: r.compareOpen ? '비교표 열림' : `제출 ${r.replies}/${r.recipients}곳`,
      status: r.compareOpen ? 'replied' : 'sent',
      when: dayLabel(r.updatedAt, now),
      icon: iconOf(r.title),
    };
  }
  const status: InboxItem['status'] =
    r.status === 'sent' ? (r.replies > 0 ? 'replied' : 'sent') : r.status === 'selected' ? 'selected' : r.status === 'closed' ? 'closed' : r.status;
  const sub =
    r.status === 'drafting'
      ? '요청서 작성 중'
      : r.status === 'waiting'
        ? '보낼 본문 준비됨'
        : r.status === 'selected'
          ? '선정 완료'
          : r.status === 'closed'
            ? '닫힘'
            : `회신 ${r.replies}/${r.recipients}`;
  return { id: r.requestId && r.status !== 'drafting' && r.status !== 'waiting' ? r.requestId : `c:${r.conversationId}`, title: r.title, sub, status, when: dayLabel(r.updatedAt, now), icon: iconOf(r.title) };
}

const LAB_STATUS: Record<LabInboxItem['status'], InboxItem['status']> = {
  received: 'new',
  viewed: 'viewed',
  replied: 'sent',
  declined: 'closed',
  selected: 'selected',
  not_selected: 'not_selected',
};

export function labItem(r: LabInboxItem, now = new Date()): InboxItem {
  const sub =
    r.status === 'selected'
      ? '선정됨'
      : r.status === 'not_selected'
        ? '미선정'
        : r.status === 'replied'
          ? '회신 완료'
          : r.dueDate
            ? `회신 기한 ${r.dueDate}`
            : '회신 기한 미정';
  return { id: r.requestId, title: r.title, sub, status: LAB_STATUS[r.status], when: dayLabel(r.receivedAt, now), icon: iconOf(r.title) };
}

const DANCHU_LAB: Record<DanchuLabItem['group'], InboxItem['status']> = {
  todo: 'new',
  decide: 'new',
  work: 'viewed',
  sent: 'sent',
  won: 'selected',
  done: 'closed',
};

/** 단추 받은 요청 한 줄. 상태 이름·다음 할 일은 단추 진행판 값 그대로 */
export function danchuLabItem(r: DanchuLabItem): InboxItem {
  const md = r.due ? r.due.slice(5).replace('-', '.') : null;
  const sub = md ? `${r.next}, ${md}까지` : r.next;
  const todo = r.group === 'todo' || r.group === 'decide' || r.group === 'work';
  const due = todo && md ? `${r.stage.replace(/\s*전$/, '')} ${md}까지` : undefined;
  return { id: r.no, title: r.title, sub, status: DANCHU_LAB[r.group], when: r.stage, due, icon: iconOf(`${r.title} ${r.categories}`) };
}
