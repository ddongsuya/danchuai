import { describe, expect, it } from 'vitest';

import { daysFrom, detailReplyBody, detailRequestBody, type CroDetailView, type RequesterDetailView } from './danchuDetail';

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
  it('고친 견적은 줄 번호만(금액은 단추가 견적서에서)', () => {
    expect(detailReplyBody(d, 'revise', '')).toEqual({ ok: true, body: { mode: 'revise', items: [{ seq: 1 }] } });
    expect(detailReplyBody(d, 'keep', ' 1차와 같아요 ')).toEqual({ ok: true, body: { mode: 'keep', note: '1차와 같아요' } });
  });
  it('회신할 수 없으면 막는다', () => {
    expect(detailReplyBody({ ...d, canReply: false }, 'keep', '').ok).toBe(false);
  });
});
