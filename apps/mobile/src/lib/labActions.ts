// 기관 참여·불참 동작 본문. 단추 웹(/api/quote/[token]/join·decline)과 같은 모양. 화면 밖에서 시험할 수 있게 따로 둔다.

export const DECLINE_NOTE_MAX = 500;

/** 참여: 사람이 본 동의 문장의 이용 조건 판 그대로. 판이 바뀌었으면 단추가 409로 다시 보게 한다 */
export function joinBody(terms: string): Record<string, unknown> {
  return { agree: true, terms };
}

/** 이번 요청 불참: 사유는 선택(단추 운영자에게만 전달). 비어 있으면 칸을 넣지 않는다 */
export function declineBody(reason: string): Record<string, unknown> {
  const r = reason.trim().slice(0, DECLINE_NOTE_MAX);
  return r ? { mode: 'decline', reason: r } : { mode: 'decline' };
}
