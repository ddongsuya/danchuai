// 사람이 시트에서 승인한 본문을 단추로 한 번 보낸다(보내기 장부: 초안 → 승인 → 실행).
// 실패 문구는 단추가 준 한국어만 그대로 보여 준다. 영어 코드는 사람에게 보이지 않는다.
import { approveDanchuAction, draftDanchuAction, type AgentRole, type DanchuActionName } from '@/lib/agentClient';

/** 보낸 결과. code 는 단추가 준 오류 코드(changed 등). 화면에는 text 만 보인다 */
export type SendOutcome = { ok: true } | { ok: false; code: string | null; text: string };

export async function sendApprovedResult(role: AgentRole, action: DanchuActionName, body: Record<string, unknown>, no: string): Promise<SendOutcome> {
  try {
    const d = await draftDanchuAction(role, action, body, no);
    const r = await approveDanchuAction(role, d);
    if (r.status === 'sent') return { ok: true };
    const code = typeof r.result?.error === 'string' ? r.result.error : null;
    const reason = code && /[가-힣]/.test(code) ? code : null;
    return { ok: false, code, text: r.status === 'failed' ? (reason ?? '단추가 받지 않았어요') : '결과 확인 필요' };
  } catch {
    return { ok: false, code: null, text: '연결이 끊겼어요' };
  }
}

/** 보냈으면 null, 아니면 보여 줄 문구 */
export async function sendApproved(role: AgentRole, action: DanchuActionName, body: Record<string, unknown>, no: string): Promise<string | null> {
  const r = await sendApprovedResult(role, action, body, no);
  return r.ok ? null : r.text;
}
