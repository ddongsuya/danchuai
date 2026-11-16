import { EMPTY_SHEET } from '@danchuai/core';
import { describe, expect, it } from 'vitest';

import { buildPayload, EMPTY_CHOICES, guessCategories, missing, summaryLines, type SendChoices } from './danchuRequest';

const sheet = { ...EMPTY_SHEET, testType: '독성', substance: 'DC-101', species: '랫드', route: '경구', duration: '4주', glp: 'GLP', dueDate: '미정' };
const full: SendChoices = {
  ...EMPTY_CHOICES,
  purpose: '허가자료 제출용',
  intent: '비교 견적',
  croCount: '5곳',
  confid: '일반',
  categories: ['일반독성'],
  agreed: { agreePrivacy: true, agreeTerms: true, agreeShare: true },
};

describe('단추 요청서로 옮기기', () => {
  it('시험 종류는 확실한 것만 고른다', () => {
    expect(guessCategories('독성')).toEqual(['일반독성']);
    expect(guessCategories('4주 반복투여 독성, TK 포함')).toEqual(['일반독성', 'PK/TK/ADME·생체시료분석']);
    expect(guessCategories('기타')).toEqual([]);
  });

  it('빠진 것을 순서대로 알려 주고, 동의 셋이 다 있어야 보낸다', () => {
    expect(missing(sheet, EMPTY_CHOICES)).toBe('의뢰 목적');
    expect(missing(sheet, { ...full, agreed: { ...full.agreed, agreeShare: false } })).toBe('동의');
    expect(missing(sheet, { ...full, replyBy: '12월 1일' })).toBe('회신 희망일');
    expect(missing(sheet, full)).toBeNull();
  });

  it('본문에 회사명·연락처 칸이 없고, 대화의 시험 조건은 추가 내용으로 간다', () => {
    const p = buildPayload(sheet, '4주 반복투여 견적 부탁해요.', full);
    expect(Object.keys(p)).not.toEqual(expect.arrayContaining(['company']));
    expect(p).not.toHaveProperty('email');
    expect(p.notes).toBe('4주 반복투여 견적 부탁해요.\n\n시험 종류: 독성\n동물 종: 랫드\n투여 경로: 경구\n투여 기간: 4주\nGLP: GLP');
    expect(p).not.toHaveProperty('replyBy');
    expect(summaryLines(p).find(([k]) => k === '회신 희망일')?.[1]).toBe('7영업일 뒤');
  });
});
