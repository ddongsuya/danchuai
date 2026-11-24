import { describe, expect, it } from 'vitest';

import { daysFrom, detailReplyBody, detailRequestBody, reviseCheck, type CroDetailView, type RequesterDetailView } from './danchuDetail';

const now = new Date(2026, 10, 21);
const v: RequesterDetailView = {
  canSend: true, maxTargets: 3, sent: null,
  targets: [{ quoteId: 'q1', lab: '가 기관' }, { quoteId: 'q2', lab: '나 기관' }],
  fields: [
    { key: '일반독성.recovery', group: '일반독성', label: '회복시험', type: 'select', options: ['없음', '2주', '4주', '기타', '미정'], current: '없음', private: false },
    { key: '일반독성.species', group: '일반독성', label: '동물종', type: 'chips', options: ['마우스', '랫드'], current: '랫드', private: false },
    { key: 'detail.vehicle', group: '시험물질', label: '조제 방법', type: 'text', current: null, private: false },
  ],
};

describe('2차 상세 요청 본문 (단추 app/api/rfq/[no]/detail 규칙)', () => {
  it('바꾼 조건만, 선택지 안의 값만', () => {
    const r = detailRequestBody(v, { quoteIds: ['q1', 'q1', 'x'], detail: { '일반독성.recovery': '4주', '일반독성.species': ['랫드'], 'detail.vehicle': ' 0.5% MC ', '모르는.칸': 'a' }, replyBy: daysFrom(7, now), note: '' }, now);
    expect(r).toEqual({ ok: true, body: { quoteIds: ['q1'], detail: { '일반독성.recovery': '4주', 'detail.vehicle': '0.5% MC' }, replyBy: '2026-11-28' } });
  });
  it('기관 수·기한·내용을 막는다', () => {
    expect(detailRequestBody(v, { quoteIds: [], detail: {}, replyBy: daysFrom(7, now), note: 'a' }, now).ok).toBe(false);
    expect(detailRequestBody(v, { quoteIds: ['q1'], detail: {}, replyBy: daysFrom(0, now), note: 'a' }, now).ok).toBe(false);
    expect(detailRequestBody(v, { quoteIds: ['q1'], detail: {}, replyBy: daysFrom(61, now), note: 'a' }, now).ok).toBe(false);
    expect(detailRequestBody(v, { quoteIds: ['q1'], detail: { '일반독성.recovery': '없음' }, replyBy: daysFrom(7, now), note: '' }, now)).toEqual({ ok: false, error: '바꿀 조건이나 메모를 적어 주세요' });
    expect(detailRequestBody(v, { quoteIds: ['q1'], detail: {}, replyBy: daysFrom(7, now), note: '조제 방법 확인 부탁해요' }, now).ok).toBe(true);
  });
});

describe('2차 회신 본문', () => {
  const d: CroDetailView = { status: 'sent', replyBy: '2026-11-28', expired: false, closed: false, changed: [], added: [], first: { total: 50_000_000, weeks: 12, items: [{ seq: 1, name: '반복투여 4주', amount: 50_000_000, weeks: 12, avail: '가능' }] }, reply: null, canReply: true };
  const d2: CroDetailView = { ...d, first: { ...d.first, items: [...d.first.items, { seq: 2, name: '유전독성', amount: null, weeks: null, avail: '불가' }] } };
  const pv = { updatedAt: '2026-11-24T01:00:00Z', rows: [{ seq: 1, amount: 46_000_000, weeks: 11 }], mismatched: [] as number[] };
  it('고친 견적은 사람이 본 견적서 판과 줄 금액을 함께 보낸다', () => {
    expect(detailReplyBody(d2, 'revise', '', pv)).toEqual({
      ok: true,
      body: { mode: 'revise', items: [{ seq: 1, avail: '가능', amount: '46000000', weeks: '11' }, { seq: 2, avail: '불가', amount: '', weeks: '' }], docUpdatedAt: '2026-11-24T01:00:00Z' },
    });
    expect(reviseCheck(d2, pv).total).toBe(46_000_000);
  });
  it('견적서를 아직 못 읽었거나 금액이 빈 줄·이름이 다른 줄이 있으면 보내지 않는다', () => {
    expect(detailReplyBody(d, 'revise', '').ok).toBe(false);
    expect(detailReplyBody(d, 'revise', '', { ...pv, rows: [{ seq: 1, amount: null, weeks: null }] })).toEqual({ ok: false, error: '금액 없는 줄이 1개 있어요' });
    expect(detailReplyBody(d, 'revise', '', { ...pv, mismatched: [1] })).toEqual({ ok: false, error: '요청서와 시험 이름이 다른 줄이 1개 있어요' });
  });
  it('1차 그대로·안 함은 견적서 없이 보낸다', () => {
    expect(detailReplyBody(d, 'keep', ' 1차와 같아요 ')).toEqual({ ok: true, body: { mode: 'keep', note: '1차와 같아요' } });
  });
  it('회신할 수 없으면 막는다', () => {
    expect(detailReplyBody({ ...d, canReply: false }, 'keep', '').ok).toBe(false);
  });
});
