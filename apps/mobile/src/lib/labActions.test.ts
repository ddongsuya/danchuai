import { describe, expect, it } from 'vitest';

import { DECLINE_NOTE_MAX, declineBody, joinBody } from './labActions';

describe('기관 참여·불참 본문', () => {
  it('참여는 동의와 본 약관 판', () => {
    expect(joinBody('pilot-2026-12-11')).toEqual({ agree: true, terms: 'pilot-2026-12-11' });
  });

  it('불참 사유는 선택, 다듬고 자른다', () => {
    expect(declineBody('   ')).toEqual({ mode: 'decline' });
    expect(declineBody('  일정이 맞지 않음 ')).toEqual({ mode: 'decline', reason: '일정이 맞지 않음' });
    expect((declineBody('가'.repeat(900)).reason as string).length).toBe(DECLINE_NOTE_MAX);
  });
});
