// 사람이 시트에서 승인한 본문을 단추로 한 번 보낸다(보내기 장부: 초안 → 승인 → 실행).
// 실패 문구는 단추가 준 한국어만 그대로 보여 준다. 영어 코드는 사람에게 보이지 않는다.
import { approveDanchuAction, draftDanchuAction, type AgentRole, type DanchuActionName } from '@/lib/agentClient';

/** 보냈으면 null, 아니면 보여 줄 문구 */
export async function sendApproved(role: AgentRole, action: DanchuActionName, body: Record<string, unknown>, no: string): Promise<string | null> {
  try {
    const d = await draftDanchuAction(role, action, body, no);
    const r = await approveDanchuAction(role, d);
    if (r.status === 'sent') return null;
    const reason = typeof r.result?.error === 'string' && /[가-힣]/.test(r.result.error) ? r.result.error : null;
    return r.status === 'failed' ? (reason ?? '단추가 받지 않았어요') : '결과 확인 필요';
  } catch {
    return '연결이 끊겼어요';
  }
}
