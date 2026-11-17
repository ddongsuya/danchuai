import { describe, expect, it } from 'vitest';

import { SELECT_NOTE_MAX, selectBody, toggleReason } from './selectReasons';

describe('선정 사유', () => {
  it('켜고 끄면 목록 순서를 지킨다', () => {
    expect(toggleReason(['일정'], '시험 범위 적합')).toEqual(['시험 범위 적합', '일정']);
    expect(toggleReason(['시험 범위 적합', '일정'], '일정')).toEqual(['시험 범위 적합']);
  });

  it('사유 없이도 선정 본문을 만든다', () => {
    expect(selectBody({ quoteId: 'q1', revision: 2 }, [], '메모')).toEqual({ quoteId: 'q1', revision: 2 });
  });

  it('상세 설명은 기타를 골랐을 때만, 다듬고 자른다', () => {
    expect(selectBody({ quoteId: 'q1', revision: 1 }, ['일정'], '무시')).toEqual({ quoteId: 'q1', revision: 1, reasons: ['일정'] });
    expect(selectBody({ quoteId: 'q1', revision: 1 }, ['기타'], '  담당 연구원 경험  ')).toEqual({ quoteId: 'q1', revision: 1, reasons: ['기타'], reasonNote: '담당 연구원 경험' });
    expect((selectBody({ quoteId: 'q1', revision: 1 }, ['기타'], '가'.repeat(500)).reasonNote as string).length).toBe(SELECT_NOTE_MAX);
    expect(selectBody({ quoteId: 'q1', revision: 1 }, ['기타'], '   ')).toEqual({ quoteId: 'q1', revision: 1, reasons: ['기타'] });
  });
});
