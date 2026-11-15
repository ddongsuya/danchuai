import { describe, expect, it } from 'vitest';

import { authErrorText, digitsOnly, formatInviteInput, isEmail, joinErrorText, passwordOk } from './authRules';

describe('로그인 규칙', () => {
  it('이메일·비밀번호·코드 입력', () => {
    expect(isEmail(' a@b.kr ')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(passwordOk('1234567')).toBe(false);
    expect(passwordOk('12345678')).toBe(true);
    expect(digitsOnly('48 1-9a77')).toBe('481977');
    expect(formatInviteInput('k7q2m9xd')).toBe('K7Q2-M9XD');
    expect(formatInviteInput('k7q')).toBe('K7Q');
  });

  it('오류 문구는 계정 유무를 밝히지 않고, 복구 방법을 준다', () => {
    expect(authErrorText({ code: 'invalid_credentials' })).toBe(authErrorText({ code: 'email_not_confirmed' }));
    expect(authErrorText({ status: 429 })).toContain('잠시 뒤');
    expect(joinErrorText('expired')).toContain('새 코드');
    expect(joinErrorText('???')).toContain('다시');
  });
});
