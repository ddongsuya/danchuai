// 요청함 한 줄. 의뢰자와 기관이 같은 틀을 쓰고 상태 이름만 다르다. 서버 목록 순서(최근 순)는 바꾸지 않는다.
import { dayLabel } from './format';
import type { LabInboxItem, RequesterListItem } from './marketClient';

export type InboxStatus = 'new' | 'viewed' | 'waiting' | 'drafting' | 'sent' | 'replied' | 'selected' | 'not_selected' | 'closed';

export interface InboxItem {
  id: string;
  title: string;
  sub: string;
  status: InboxStatus;
  when: string;
  icon: 'flask' | 'dna' | 'drop';
}

/** 제목으로 아이콘만 고른다(분류·순위와 무관) */
export function iconOf(title: string): InboxItem['icon'] {
  if (/돌연변이|유전독성|소핵|염색체/.test(title)) return 'dna';
  if (/약동학|PK|TK/i.test(title)) return 'drop';
  return 'flask';
}

export function requesterItem(r: RequesterListItem, now = new Date()): InboxItem {
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
