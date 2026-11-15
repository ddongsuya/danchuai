import { describe, expect, it } from 'vitest';

import { groupDigits, parseWeeks, parseWon, readQuote } from './quoteForm';

describe('견적 입력', () => {
  it('금액은 원 단위 정수만', () => {
    expect(parseWon('82,000,000')).toBe(82_000_000);
    expect(parseWon('8200만')).toBeNull();
    expect(parseWon('1.5')).toBeNull();
    expect(parseWon('')).toBeNull();
    expect(parseWon('1000000000001')).toBeNull();
  });
  it('입력 중 쉼표', () => {
    expect(groupDigits('0082000000')).toBe('82,000,000');
    expect(groupDigits('abc')).toBe('');
  });
  it('기간은 1~520주', () => {
    expect(parseWeeks('14')).toBe(14);
    expect(parseWeeks('0')).toBeNull();
    expect(parseWeeks('521')).toBeNull();
    expect(parseWeeks('4주')).toBeNull();
  });
  it('빈 줄은 건너뛰고, 틀린 줄이 있으면 보내지 않는다', () => {
    const ok = readQuote([
      { key: 'a', label: '반복투여 4주', amount: '82,000,000' },
      { key: 'b', label: '', amount: '' },
    ]);
    expect(ok.lines).toEqual([{ label: '반복투여 4주', amountWon: 82_000_000 }]);
    const bad = readQuote([
      { key: 'a', label: '회복 2주', amount: '' },
      { key: 'b', label: '', amount: '5000' },
    ]);
    expect(bad.lines).toBeNull();
    expect(bad.errors).toEqual({ a: 'amount', b: 'label' });
    expect(readQuote([{ key: 'a', label: '', amount: '' }]).lines).toBeNull();
  });
});
