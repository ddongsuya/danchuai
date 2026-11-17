// 기관 선정 사유와 단추에 보낼 선정 본문. 화면 밖에서 시험할 수 있게 따로 둔다.
// 사유 목록은 단추 lib/select-reasons.ts 와 같다(기획 인계본 "사유 입력과 공유"). 바꾸면 단추도 함께 바꾼다.
// 고르지 않아도 선정한다. 단추는 사유를 진행 기록에만 남기고 기관에는 보내지 않는다.

export const SELECT_REASONS = ['시험 범위 적합', '일정', '견적 조건', '기술 검토 내용', '기존 거래 경험', '기타'] as const;
export type SelectReason = (typeof SELECT_REASONS)[number];
export const SELECT_NOTE_MAX = 200;

/** 고른 사유를 켜고 끈다. 목록 순서를 지킨다. */
export function toggleReason(picked: readonly SelectReason[], r: SelectReason): SelectReason[] {
  const on = picked.includes(r) ? picked.filter((x) => x !== r) : [...picked, r];
  return SELECT_REASONS.filter((x) => on.includes(x));
}

/**
 * 단추 선정 동작 본문. 견적 id·판은 사람이 확인한 칸 그대로.
 * 사유가 없으면 칸을 넣지 않는다. 상세 설명은 "기타"를 골랐을 때만, 다듬고 길이를 자른다.
 */
export function selectBody(col: { quoteId: string; revision: number }, reasons: readonly SelectReason[], note: string): Record<string, unknown> {
  const body: Record<string, unknown> = { quoteId: col.quoteId, revision: col.revision };
  const rs = SELECT_REASONS.filter((x) => reasons.includes(x));
  if (rs.length) body.reasons = rs;
  const n = rs.includes('기타') ? note.trim().slice(0, SELECT_NOTE_MAX) : '';
  if (n) body.reasonNote = n;
  return body;
}
