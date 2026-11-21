import { describe, expect, it } from 'vitest';

import { answerBody, askBody } from './danchuQna';

describe('질의응답 본문 (단추 qna 라우트와 같은 칸)', () => {
  it('의뢰자 질의는 기관·주제·내용, 시험 행은 고른 때만', () => {
    expect(askBody('requester', { inviteId: null, topic: 'quote', body: '회복군 단가요' }).ok).toBe(false);
    expect(askBody('requester', { inviteId: 'i1', topic: 'quote', testSeq: 2, body: ' 회복군 단가요 ' })).toEqual({ ok: true, body: { inviteId: 'i1', topic: 'quote', testSeq: 2, body: '회복군 단가요' } });
  });
  it('기관 질의에는 inviteId 를 싣지 않는다(단추가 우리 초대로 정한다)', () => {
    expect(askBody('cro', { inviteId: 'x', topic: 'substance', body: '보유량은요?' })).toEqual({ ok: true, body: { topic: 'substance', body: '보유량은요?' } });
    expect(askBody('cro', { topic: null, body: 'a' }).ok).toBe(false);
    expect(askBody('cro', { topic: 'other', body: 'a'.repeat(1001) })).toEqual({ ok: false, error: '1000자까지 적을 수 있어요' });
  });
  it('의뢰자 답변은 공개 범위가 필요하고, 기관 답변은 없다', () => {
    expect(answerBody('requester', { questionId: 'q1', answer: '경구예요', scope: null }).ok).toBe(false);
    expect(answerBody('requester', { questionId: 'q1', answer: '경구예요', scope: 'all' })).toEqual({ ok: true, body: { questionId: 'q1', answer: '경구예요', scope: 'all' } });
    expect(answerBody('cro', { questionId: 'q1', answer: '네', scope: 'all' })).toEqual({ ok: true, body: { questionId: 'q1', answer: '네' } });
    expect(answerBody('cro', { questionId: 'q1', answer: '  ' }).ok).toBe(false);
  });
});
