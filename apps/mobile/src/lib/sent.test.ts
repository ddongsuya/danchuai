import { describe, expect, it } from 'vitest';

import { needsLook, sentHref, sentLabel, sentMeta, type SentItem } from './sent';

const base: SentItem = { id: 'a', action: 'contract_report', rfqNo: 'DC-2026-0010', status: 'sent', at: '2026-11-24T01:31:00Z', mine: true, reason: null };

describe('보낸 것 기록', () => {
  it('동작 이름과 둘째 줄', () => {
    expect(sentLabel('contract_report')).toBe('계약 체결 보고');
    expect(sentLabel('new_thing')).toBe('단추 동작');
    expect(sentMeta(base, () => '11.24 10:31')).toBe('11.24 10:31, 요청 DC-2026-0010, 내가 승인');
    expect(sentMeta({ ...base, rfqNo: null, mine: false }, () => 't')).toBe('t, 다른 담당자 승인');
  });
  it('역할에 맞는 요청 화면으로, 번호가 없으면 가지 않는다', () => {
    expect(sentHref('cro', base)).toEqual({ pathname: '/lab/[id]', params: { id: 'DC-2026-0010' } });
    expect(sentHref('requester', base)).toEqual({ pathname: '/requester/[id]', params: { id: 'DC-2026-0010' } });
    expect(sentHref('cro', { ...base, rfqNo: null })).toBeNull();
  });
  it('확인할 줄 수', () => {
    expect(needsLook([base, { ...base, status: 'unknown' }, { ...base, status: 'failed' }])).toBe(2);
  });
});
