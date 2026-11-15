import { describe, expect, it } from 'vitest';

import { labItem, requesterItem } from './inbox';
import { dayLabel, initialOf } from './format';

const now = new Date('2026-11-16T10:00:00');
const base = { conversationId: 'c1', requestId: 'r1', title: '랫드 4주 반복투여독성', recipients: 3, replies: 0, updatedAt: '2026-11-16T09:00:00' };

describe('요청함 줄', () => {
  it('보낸 요청은 회신이 오면 회신 도착, 아니면 보냄. 요청 화면으로 간다', () => {
    expect(requesterItem({ ...base, status: 'sent' }, now)).toMatchObject({ id: 'r1', status: 'sent', sub: '회신 0/3', when: '오늘' });
    expect(requesterItem({ ...base, status: 'sent', replies: 2 }, now)).toMatchObject({ status: 'replied', sub: '회신 2/3' });
  });
  it('보내기 전 대화는 대화로 이어 쓴다', () => {
    expect(requesterItem({ ...base, requestId: null, status: 'drafting' }, now)).toMatchObject({ id: 'c:c1', status: 'drafting' });
    expect(requesterItem({ ...base, status: 'waiting' }, now)).toMatchObject({ id: 'c:c1', status: 'waiting', sub: '보낼 본문 준비됨' });
  });
  it('기관 줄: 받음은 새 요청, 회신은 보냄, 선정 결과 표시', () => {
    const l = { requestId: 'r1', title: '복귀돌연변이시험', dueDate: '11월 29일', receivedAt: '2026-11-15T09:00:00', conversationId: null };
    expect(labItem({ ...l, status: 'received' }, now)).toMatchObject({ status: 'new', sub: '회신 기한 11월 29일', when: '어제', icon: 'dna' });
    expect(labItem({ ...l, status: 'replied' }, now)).toMatchObject({ status: 'sent', sub: '회신 완료' });
    expect(labItem({ ...l, status: 'not_selected' }, now)).toMatchObject({ status: 'not_selected', sub: '미선정' });
  });
});

describe('표시 도우미', () => {
  it('날짜는 오늘·어제·M월 D일', () => {
    expect(dayLabel('2026-11-16T00:10:00', now)).toBe('오늘');
    expect(dayLabel('2026-11-15T23:50:00', now)).toBe('어제');
    expect(dayLabel('2026-11-02T12:00:00', now)).toBe('11월 2일');
  });
  it('기관 첫 글자', () => {
    expect(initialOf(' 가 기관')).toBe('가');
    expect(initialOf('')).toBe('?');
  });
});
