import { checkSentence } from '@danchuai/core';

/** 보낼 본문 점검: 순위·추천 표현, AI가 쓴 금액, 연락처. 코드가 넣은 금액만 있는 본문은 allowMoney. */
export function bodyPasses(body: string, opts: { allowMoney?: boolean } = {}): boolean {
  return checkSentence(body, opts).length === 0;
}
