// 보낸 것 기록(2026-11-24, Muse 승인 이력 패턴). 우리 조직이 승인해 단추로 보낸 동작을 최근 것부터 보인다.
// 서버는 동작·요청 번호·결과만 준다(본문 원문 없음). 줄을 누르면 그 요청 화면에서 내용을 본다.
import type { AgentRole } from '@/lib/agentClient';

export type SentStatus = 'sent' | 'failed' | 'unknown' | 'rejected';

export interface SentItem {
  id: string;
  action: string;
  rfqNo: string | null;
  status: SentStatus;
  at: string;
  /** 내가 승인했는지(아니면 같은 조직의 다른 담당자) */
  mine: boolean;
  /** 단추가 거절한 까닭(한국어 문장일 때만) */
  reason: string | null;
}

/** 동작 이름. 목록에 없는 새 동작은 "단추 동작" */
export const SENT_LABEL: Record<string, string> = {
  create: '요청 접수',
  ask: '질의 보내기',
  answer: '질의 답변',
  select: '기관 선정',
  detail: '2차 상세 요청',
  contract_confirm: '계약 보고 확인',
  contract_result: '계약 결과 알리기',
  join: '참여',
  decline: '불참',
  quote_submit: '견적 제출',
  detail_reply: '2차 회신',
  contract_report: '계약 체결 보고',
  contract_draft_send: '계약서(안) 보내기',
};

export const STATUS_LABEL: Record<SentStatus, string> = {
  sent: '보냄',
  failed: '단추가 받지 않음',
  unknown: '결과 확인 필요',
  rejected: '보내지 않음',
};

export const sentLabel = (action: string) => SENT_LABEL[action] ?? '단추 동작';

/** 둘째 줄: "11.24 10:31, 요청 DC-2026-0010, 내가 승인" */
export function sentMeta(it: SentItem, when: (iso: string) => string): string {
  return [when(it.at), it.rfqNo ? `요청 ${it.rfqNo}` : null, it.mine ? '내가 승인' : '다른 담당자 승인'].filter(Boolean).join(', ');
}

/** 줄을 누르면 갈 곳(요청 번호가 없으면 null) */
export function sentHref(role: AgentRole, it: SentItem) {
  if (!it.rfqNo) return null;
  return role === 'cro' ? ({ pathname: '/lab/[id]', params: { id: it.rfqNo } } as const) : ({ pathname: '/requester/[id]', params: { id: it.rfqNo } } as const);
}

/** 확인할 것이 있는 줄 수(결과 확인 필요·받지 않음). 메뉴 숫자로 쓴다 */
export const needsLook = (items: SentItem[]) => items.filter((i) => i.status === 'unknown' || i.status === 'failed').length;
