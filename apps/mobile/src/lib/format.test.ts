import { describe, expect, it } from 'vitest';

import { daysLeft, localDay, shortDate } from './format';

describe('shortDate', () => {
  it('월.일(요일)로 줄인다', () => {
    expect(shortDate('2026-11-26')).toBe('11.26(목)');
    expect(shortDate('2026-11-20T09:00:00+09:00')).toBe('11.20(금)');
  });
  it('값이 없으면 미정', () => {
    expect(shortDate(null)).toBe('미정');
    expect(shortDate('')).toBe('미정');
  });
});

describe('daysLeft', () => {
  const now = new Date(2026, 10, 17, 15, 0);
  it('남은 날을 센다', () => {
    expect(daysLeft('2026-11-20', now)).toBe(3);
    expect(daysLeft('2026-11-17', now)).toBe(0);
    expect(daysLeft('2026-11-16', now)).toBe(-1);
  });
  it('못 읽으면 null', () => {
    expect(daysLeft(null, now)).toBeNull();
    expect(daysLeft('미정', now)).toBeNull();
  });
});

describe('localDay', () => {
  it('기기 날짜로 바꾼다', () => {
    const d = new Date(2026, 10, 12, 1, 0);
    expect(localDay(d.toISOString())).toBe('2026-11-12');
  });
});
