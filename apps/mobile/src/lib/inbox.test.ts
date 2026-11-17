import { describe, expect, it } from 'vitest';

import { labItem, requesterItem } from './inbox';
import { dayLabel, initialOf } from './format';

const now = new Date('2026-11-16T10:00:00');
const base = { conversationId: 'c1', requestId: 'r1', title: '랫드 4주 반복투여독성', recipients: 3, replies: 0, updatedAt: '2026-11-16T09:00:00' };

describe('요청함 줄', () => {
  it('보낸 요청은 회신이 오면 회신 도착, 아니면 보냄. 요청 화면으로 간다', () => {
    expect(requesterItem({ ...base, status: 'sent' }, now)).toMatchObject({ id: 'r1', status: 'sent', sub: '회신 0/3', when: '11.16' });
    expect(requesterItem({ ...base, status: 'sent', replies: 2 }, now)).toMatchObject({ status: 'replied', sub: '회신 2/3' });
  });
  it('보내기 전 대화는 대화로 이어 쓴다', () => {
    expect(requesterItem({ ...base, requestId: null, status: 'drafting' }, now)).toMatchObject({ id: 'c:c1', status: 'drafting' });
    expect(requesterItem({ ...base, status: 'waiting' }, now)).toMatchObject({ id: 'c:c1', status: 'waiting', sub: '보낼 본문 준비됨' });
  });
  it('기관 줄: 받음은 새 요청, 회신은 보냄, 선정 결과 표시', () => {
    const l = { requestId: 'r1', title: '복귀돌연변이시험', dueDate: '11월 29일', receivedAt: '2026-11-15T09:00:00', conversationId: null };
    expect(labItem({ ...l, status: 'received' }, now)).toMatchObject({ status: 'new', sub: '회신 기한 11월 29일', when: '11.15', icon: 'dna' });
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

describe('단추 받은 요청 한 줄', () => {
  it('묶음으로 상태를 정하고 다음 할 일·기한을 그대로 쓴다', async () => {
    const { danchuLabItem } = await import('./inbox');
    const it1 = danchuLabItem({ no: 'DC-2026-0001', title: '독성 요청', categories: '독성', client: null, clientHint: '바이오텍', group: 'decide', stage: '참여 결정 전', next: '참여할지 정하기', due: '2026-11-20', steps: [], money: [] });
    expect(it1).toMatchObject({ id: 'DC-2026-0001', title: 'DC-2026-0001 독성', status: 'new', sub: '참여할지 정하기, 11.20까지', when: '참여 결정 전', due: '참여 결정 11.20까지' });
    expect(danchuLabItem({ ...{ no: 'DC-2026-0002', title: 't', categories: '', client: '회사', clientHint: '', stage: '계약 진행', next: '계약 결과 보고', due: null, steps: [], money: [] }, group: 'won' }).status).toBe('selected');
  });
});

describe('단추 보낸 요청 한 줄', () => {
  it('비교표 열리기 전에는 제출 수만, 열린 뒤 회신 도착', () => {
    const base = { conversationId: '', requestId: 'DC-2026-0001', title: '물질', status: 'sent' as const, recipients: 4, replies: 2, updatedAt: '2026-11-12T00:00:00Z' };
    expect(requesterItem({ ...base, compareOpen: false })).toMatchObject({ id: 'DC-2026-0001', status: 'sent', sub: '제출 2/4곳' });
    expect(requesterItem({ ...base, compareOpen: true })).toMatchObject({ status: 'replied', sub: '비교표 열림' });
  });
});
