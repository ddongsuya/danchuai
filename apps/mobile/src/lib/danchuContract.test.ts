import { describe, expect, it } from 'vitest';

import { confirmBody, digitsOnly, gapLine, needsGapReason, reportBody, resultBody, type ContractView } from './danchuContract';

const v: ContractView = {
  lab: '가 기관', awardedAt: '2026-11-01T00:00:00Z', quoteAmount: 50_000_000, state: 'awaiting_report', report: null, gap: null,
  confirmDueAt: null, confirmedAt: null, confirmedVia: null, sponsor: null, sponsorSaysSigned: false,
  can: { report: true, correct: false, confirm: false, tellResult: false },
  gapRule: { ratio: 0.1, reasons: [{ id: 'scope', label: '시험 범위 변경' }, { id: 'price', label: '단가·할인 조정' }, { id: 'schedule', label: '일정 변경' }, { id: 'other', label: '기타' }] },
};

describe('계약 체결 보고 본문 (단추 app/api/awards/[id]/contract 와 같은 규칙)', () => {
  it('금액은 사람이 적은 숫자만, 문자열로', () => {
    expect(digitsOnly('44,000,000원')).toBe('44000000');
    expect(reportBody(v, { date: '2026-11-21', amount: '48,000,000', gapReason: null, note: '' })).toEqual({ ok: true, body: { date: '2026-11-21', amount: '48000000' } });
  });
  it('선정 견적과 10% 이상 다르면 사유가 있어야 한다(경계 포함)', () => {
    expect(needsGapReason(50_000_000, 45_000_000)).toBe(true);
    expect(needsGapReason(50_000_000, 45_000_001)).toBe(false);
    expect(reportBody(v, { date: '2026-11-21', amount: '44000000', gapReason: null, note: '' }).ok).toBe(false);
    expect(reportBody(v, { date: '2026-11-21', amount: '44000000', gapReason: 'scope', note: '회복군 제외' })).toEqual({ ok: true, body: { date: '2026-11-21', amount: '44000000', gapReason: 'scope', note: '회복군 제외' } });
  });
  it('기타 사유는 비고가 필요하고, 차이가 작으면 사유를 보내지 않는다', () => {
    expect(reportBody(v, { date: '2026-11-21', amount: '30000000', gapReason: 'other', note: ' ' }).ok).toBe(false);
    expect(reportBody(v, { date: '2026-11-21', amount: '49000000', gapReason: 'price', note: '' })).toEqual({ ok: true, body: { date: '2026-11-21', amount: '49000000' } });
  });
  it('날짜·금액이 틀리면 막는다', () => {
    expect(reportBody(v, { date: '2026-02-30', amount: '1000', gapReason: null, note: '' }).ok).toBe(false);
    expect(reportBody(v, { date: '2026-11-21', amount: '0', gapReason: null, note: '' }).ok).toBe(false);
  });
});

describe('의뢰자 확인·결과 알림 본문', () => {
  it('이의는 다른 점을 적어야 한다', () => {
    expect(confirmBody('confirm', '')).toEqual({ ok: true, body: { action: 'confirm' } });
    expect(confirmBody('dispute', '  ').ok).toBe(false);
    expect(confirmBody('dispute', '금액이 달라요')).toEqual({ ok: true, body: { action: 'dispute', note: '금액이 달라요' } });
  });
  it('계약했을 때만 금액·계약일을 싣는다', () => {
    expect(resultBody('signed', '48,000,000', '2026-11-09', '')).toEqual({ ok: true, body: { status: 'signed', amount: '48000000', date: '2026-11-09' } });
    expect(resultBody('negotiating', '48000000', '2026-11-09', '')).toEqual({ ok: true, body: { status: 'negotiating' } });
    expect(resultBody('signed', '', '11/9', '').ok).toBe(false);
  });
  it('차이 한 줄', () => {
    expect(gapLine({ gap: { diff: -6_000_000, ratio: -0.12 } })).toBe('6,000,000원 낮아요(12%)');
    expect(gapLine({ gap: { diff: 0, ratio: 0 } })).toBeNull();
  });
});
