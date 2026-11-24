import { describe, expect, it } from 'vitest';

import { alertHref, alertRfqNo, dayLabel, groupByDay, unreadCount, type AlertItem } from './alerts';

const now = new Date(2026, 10, 24, 11, 0);
const a = (id: string, at: Date, href: string | null = null, read = false): AlertItem => ({ id, kind: '견적', title: 't', body: '', href, read, at: at.toISOString() });

describe('알림', () => {
  it('단추 웹 경로에서 요청 번호를 찾아 역할에 맞는 화면으로', () => {
    expect(alertRfqNo({ href: '/app/r/DC-2026-0142' })).toBe('DC-2026-0142');
    expect(alertHref('cro', { href: '/cro/quotes/DC-2026-0142?tab=qna' })).toEqual({ pathname: '/lab/[id]', params: { id: 'DC-2026-0142' } });
    expect(alertHref('requester', { href: '/app/r/DC-2026-0142' })).toEqual({ pathname: '/requester/[id]', params: { id: 'DC-2026-0142' } });
    expect(alertHref('cro', { href: '/cro/billing' })).toBeNull();
    expect(alertHref('cro', { href: null })).toBeNull();
  });
  it('날짜 묶음은 오늘·어제·월일, 순서는 그대로', () => {
    expect(dayLabel(new Date(2026, 10, 24, 8).toISOString(), now)).toBe('오늘');
    expect(dayLabel(new Date(2026, 10, 23, 23).toISOString(), now)).toBe('어제');
    expect(dayLabel(new Date(2026, 10, 20, 9).toISOString(), now)).toBe('11월 20일');
    const g = groupByDay([a('1', new Date(2026, 10, 24, 9)), a('2', new Date(2026, 10, 24, 8)), a('3', new Date(2026, 10, 22, 8), null, true)], now);
    expect(g.map((x) => [x.day, x.items.map((i) => i.id)])).toEqual([['오늘', ['1', '2']], ['11월 22일', ['3']]]);
    expect(unreadCount(g.flatMap((x) => x.items))).toBe(2);
  });
});
