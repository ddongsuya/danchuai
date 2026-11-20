import { applyQuotePatch, quoteDraftFromBrief, type DanchuQuoteBrief } from '@danchuai/core';
import { describe, expect, it } from 'vitest';

import { blockedLabel, buildQuoteBody, docBlockedLabel, docLines, docQuoteBody, formatWonInput, reviewLines, sameAsSubmitted, type QuoteSubmitPreview } from './danchuQuote';

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

// 단추 제출 미리보기 모양 그대로의 예시 값(실제 기관 단가 아님)
const PREVIEW: QuoteSubmitPreview = {
  docId: 'd1', docNo: 'Q-1', updatedAt: '2026-11-20T01:00:00Z', path: '/cro/docs/d1/fill', discount: 0, mismatched: [], unlinked: [],
  rows: [
    { seq: 1, amount: 47_000_000, weeks: 15, extra: { exp_groups: '대조 1군, 시험 3군', cost_animal: '9000000', other: 'x' }, tests: [{ uid: 'ta', title: '랫드 4주 반복투여독성', total: 47_000_000, manual: false }] },
    { seq: 2, amount: null, weeks: null, extra: {}, tests: [{ uid: 'tb', title: 'TK 분석', total: 0, manual: true }] },
    { seq: 3, amount: null, weeks: null, extra: {}, tests: [] },
  ],
};

describe('견적서 기준 제출(단추 제출 미리보기)', () => {
  const ready = () => applyQuotePatch(quoteDraftFromBrief(BRIEF), { items: [{ seq: 3, avail: '불가' }], common: { startDate: '2026-12-01' } }).draft;

  it('줄 금액·기간은 미리보기 그대로, 사람이 넣을 줄과 견적서에 없는 줄을 나눈다', () => {
    const lines = docLines(ready(), PREVIEW);
    expect(lines.map((l) => [l.seq, l.state, l.amount, l.weeks])).toEqual([
      [1, 'priced', 47_000_000, 15],
      [2, 'manual', null, 6],
      [3, 'off', null, null],
    ]);
    expect(lines[0]!.extra).toEqual([['군 구성', '대조 1군, 시험 3군'], ['동물·모델 유발', '9,000,000원']]);
    expect(lines[1]!.manual).toEqual([{ uid: 'tb', title: 'TK 분석' }]);
    const open = applyQuotePatch(quoteDraftFromBrief(BRIEF), { items: [{ seq: 3, avail: '가능' }] }).draft;
    expect(docLines(open, PREVIEW)[2]!.state).toBe('no_test');
  });

  it('단추 초안 금액이 아니라 견적서 금액으로 보내고, 제출 때만 견적서 판을 붙인다', () => {
    const p: QuoteSubmitPreview = { ...PREVIEW, rows: PREVIEW.rows.map((r) => (r.seq === 2 ? { ...r, amount: 5_000_000 } : r)) };
    const b = docQuoteBody(ready(), p, true);
    if (!b.ok) throw new Error('blocked');
    expect(b.body.items.map((it) => [it.seq, it.amount, it.weeks])).toEqual([[1, '47000000', '15'], [2, '5000000', '6'], [3, '', '']]);
    expect(b.total).toBe(52_000_000);
    expect(b.body.docUpdatedAt).toBe('2026-11-20T01:00:00Z');
    const save = docQuoteBody(ready(), p, false);
    expect(save.ok && 'docUpdatedAt' in save.body).toBe(false);
  });

  it('금액 없는 줄·이름이 달라진 줄은 제출을 막는다', () => {
    const b = docQuoteBody(ready(), PREVIEW, true);
    expect(b.ok).toBe(false);
    expect(docBlockedLabel(b)).toBe('금액 1줄 남음');
    const bad = docQuoteBody(ready(), { ...PREVIEW, mismatched: [1], rows: PREVIEW.rows.map((r) => (r.seq === 2 ? { ...r, amount: 5_000_000 } : r)) }, true);
    expect(docBlockedLabel(bad)).toBe('시험 이름 1줄 다름');
  });

  it('제출한 금액과 지금 견적서 금액이 같은지', () => {
    const d = ready();
    expect(sameAsSubmitted(d, PREVIEW)).toBe(false);
    const p: QuoteSubmitPreview = { ...PREVIEW, rows: PREVIEW.rows.map((r) => (r.seq === 1 ? { ...r, amount: 48_500_000 } : r.seq === 2 ? { ...r, amount: 6_200_000 } : r)) };
    expect(sameAsSubmitted(d, p)).toBe(true);
  });
});
