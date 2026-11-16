import { EMPTY_SHEET } from '@danchuai/core';
import { describe, expect, it } from 'vitest';

import { buildPayload, fillFromChat, guessCategories, nextMissing, type SendChoices } from './danchuRequest';

const sheet = { ...EMPTY_SHEET, testType: '독성', substance: 'DC-101', species: '랫드', route: '경구', duration: '4주', glp: 'GLP', dueDate: '미정' };
const full: SendChoices = { purpose: '허가자료 제출용', intent: '비교 견적', confid: '일반', categories: ['일반독성'], replyBy: '', agreed: true };

describe('단추 요청서로 옮기기', () => {
  it('시험 종류는 확실한 것만 고른다', () => {
    expect(guessCategories('독성')).toEqual(['일반독성']);
    expect(guessCategories('4주 반복투여 독성, TK 포함')).toEqual(['일반독성', 'PK/TK/ADME·생체시료분석']);
    expect(guessCategories('기타')).toEqual([]);
  });

  it('대화에 근거가 있는 값만 채우고, 동의는 채우지 않는다', () => {
    const c = fillFromChat({ ...sheet, glp: null }, ['랫드 4주 독성 견적 여러 곳에서 받아 보고 싶어요. IND 제출용이에요.']);
    expect(c).toMatchObject({ purpose: '허가자료 제출용', intent: '비교 견적', confid: '일반', categories: ['일반독성'], agreed: false });
    expect(fillFromChat({ ...sheet, glp: null }, ['견적 주세요']).purpose).toBeNull();
    expect(fillFromChat(sheet, ['CDA 먼저 맺고 싶어요']).confid).toBe('CDA 필요 (단추 표준 CDA)');
  });

  it('빈 값을 하나씩 묻고, 동의가 마지막이다', () => {
    expect(nextMissing(sheet, { ...full, purpose: null })).toBe('purpose');
    expect(nextMissing(sheet, { ...full, agreed: false })).toBe('agreed');
    expect(nextMissing(sheet, full)).toBeNull();
  });

  it('받을 견적 수는 묻지 않고 참여 기관 전체로 보낸다. 회사명·연락처는 없다', () => {
    const p = buildPayload(sheet, '4주 반복투여 견적 부탁해요.', full);
    expect(p.croCount).toBe('전체');
    expect(p).not.toHaveProperty('company');
    expect(p).not.toHaveProperty('email');
    expect(p).not.toHaveProperty('replyBy');
    expect(p.notes).toBe('4주 반복투여 견적 부탁해요.\n\n시험 종류: 독성\n동물 종: 랫드\n투여 경로: 경구\n투여 기간: 4주\nGLP: GLP');
  });
});
