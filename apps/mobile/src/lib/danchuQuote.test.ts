import { applyQuotePatch, quoteDraftFromBrief, type DanchuQuoteBrief } from '@danchuai/core';
import { describe, expect, it } from 'vitest';

import { blockedLabel, buildQuoteBody, formatWonInput, reviewLines } from './danchuQuote';

const BRIEF: DanchuQuoteBrief = {
  no: 'DC-2026-0142',
  state: 'open',
  closedReason: null,
  request: {
    full: true, substance: '후보물질 A', categories: ['일반독성'], overview: [], common: [], situation: [], ask: [], replyBy: '2026-11-30', authorities: [], translation: false, files: [],
    rows: [
      { seq: 1, category: '일반독성', name: '랫드 4주 반복투여독성', cond: '' },
      { seq: 2, category: '일반독성', name: 'TK 분석', cond: '' },
      { seq: 3, category: '효력', name: '대장염(DSS) 효력시험', cond: '' },
    ],
  },
  draft: {
    status: 'draft', prefilled: true, note: '', steps: [], pdfName: '',
    common: { validUntil: '', startDate: '', payTerms: '', substanceQty: '', reportLang: '', includes: [] },
    items: [
      { seq: 1, avail: '가능', amount: '48500000', weeks: '14', source: 'catalog' },
      { seq: 2, avail: '가능', amount: '6200000', weeks: '6', source: 'manual' },
    ],
  },
};

describe('단추 견적 확인 카드', () => {
  it('금액 출처: 단추 계산·저장된 금액·직접 입력', () => {
    const lines = reviewLines(quoteDraftFromBrief(BRIEF));
    expect(lines.map((l) => [l.seq, l.source, l.amount])).toEqual([
      [1, 'danchu', 48_500_000],
      [2, 'saved', 6_200_000],
      [3, 'manual', null],
    ]);
    expect(lines[2]!.name).toBe('대장염(DSS) 효력시험');
  });

  it('남은 것을 차례로 알려 주고, 다 채우면 부가세 없이 합계', () => {
    let d = quoteDraftFromBrief(BRIEF);
    expect(blockedLabel(d, {})).toBe('가능 여부 1개 미정');
    d = applyQuotePatch(d, { items: [{ seq: 3, avail: '조건부 가능' }] }).draft;
    expect(blockedLabel(d, {})).toBe('금액 1줄 남음');
    expect(blockedLabel(d, { 3: '32000000' })).toBe('착수 가능일 미정');
    d = applyQuotePatch(d, { common: { startDate: '2026-12-01' } }).draft;
    expect(blockedLabel(d, { 3: '32000000' })).toBeNull();
    const b = buildQuoteBody(d, { 3: '32,000,000' }, true);
    expect(b.ok && b.total).toBe(86_700_000);
    // 단추 회신 구조 그대로(items/note/common/steps), 레거시 quoteLines·부가세 칸 없음
    expect(b.ok && Object.keys(b.body).sort()).toEqual(['common', 'items', 'note', 'steps']);
  });

  it('입력 표시는 세 자리 쉼표', () => {
    expect(formatWonInput('32000000')).toBe('32,000,000');
    expect(formatWonInput('없음')).toBe('');
  });
});
