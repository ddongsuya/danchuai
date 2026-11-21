// 선정 뒤 계약 진행(의뢰자·기관). 앱에서 견적 제출부터 계약 보고까지 끝낸다(성사 수수료 경로, 2026-11-21 사용자 결정).
// 상태와 할 수 있는 동작은 단추 contract_status(단추 lib/agent-contract.ts)가 준다. 여기서는 사람이 적은 값을 단추 본문으로만 옮긴다.
// 본문 규칙은 단추 라우트와 같다: 기관 보고 app/api/awards/[id]/contract, 의뢰자 확인 app/api/rfq/[no]/contract, 결과 알림 app/api/rfq/[no]/contract-result.
// 금액은 사람이 계약서에 적힌 대로 넣은 값이다. AI는 이 값을 만들지 않는다.

export type ContractState = 'awaiting_report' | 'to_confirm' | 'disputed' | 'confirmed' | 'not_signed';

/** 단추 contract_status 응답의 contract */
export interface ContractView {
  lab: string;
  awardedAt: string;
  quoteAmount: number | null;
  state: ContractState;
  report: { date: string; amount: number; gapReason: string | null; gapReasonLabel: string | null; note: string | null; reportedAt: string } | null;
  gap: { diff: number; ratio: number } | null;
  confirmDueAt: string | null;
  confirmedAt: string | null;
  confirmedVia: 'sponsor' | 'auto' | 'operator' | 'legacy' | null;
  sponsor: { status: string; label: string; amount: number | null; date: string | null; reportedAt: string } | null;
  sponsorSaysSigned: boolean;
  can: { report: boolean; correct: boolean; confirm: boolean; tellResult: boolean };
  gapRule: { ratio: number; reasons: { id: string; label: string }[] };
}

export const STATE_LABEL: Record<ContractState, string> = {
  awaiting_report: '계약 체결 보고 전',
  to_confirm: '의뢰자 확인 대기',
  disputed: '의뢰자 이의, 단추 확인 중',
  confirmed: '계약 확정',
  not_signed: '계약 안 함',
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => YMD.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
/** 숫자만 남긴다("44,000,000원" → "44000000") */
export const digitsOnly = (s: string) => s.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').slice(0, 13);

/** 선정 견적과 10% 이상 다르면 차이 사유가 필요하다(단추 0034, |차이| × 10 ≥ 견적) */
export function needsGapReason(quote: number | null, amount: number | null): boolean {
  if (!quote || quote <= 0 || amount == null) return false;
  return Math.abs(amount - quote) * 10 >= quote;
}

export interface ReportInput {
  date: string;
  amount: string;
  gapReason: string | null;
  note: string;
}

/** 기관 계약 체결 보고 본문. 막히면 이유 문구 */
export function reportBody(v: ContractView, i: ReportInput): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  if (!validDate(i.date)) return { ok: false, error: '체결일을 YYYY-MM-DD로 적어 주세요' };
  const amount = digitsOnly(i.amount);
  if (!amount || Number(amount) < 1) return { ok: false, error: '계약 금액을 적어 주세요' };
  const note = i.note.trim().slice(0, 300);
  const need = needsGapReason(v.quoteAmount, Number(amount));
  const reason = need ? i.gapReason : null;
  if (need && !v.gapRule.reasons.some((r) => r.id === reason)) return { ok: false, error: '선정 견적과 10% 이상 달라요. 차이 사유를 골라 주세요' };
  if (reason === 'other' && !note) return { ok: false, error: '기타 사유를 적어 주세요' };
  return { ok: true, body: { date: i.date, amount, ...(note ? { note } : {}), ...(reason ? { gapReason: reason } : {}) } };
}

/** 의뢰자 계약 보고 확인(맞아요)·이의(달라요) 본문 */
export function confirmBody(action: 'confirm' | 'dispute', note: string): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const n = note.trim();
  if (action === 'dispute' && !n) return { ok: false, error: '실제와 다른 부분을 적어 주세요' };
  if (n.length > 500) return { ok: false, error: '500자까지 적을 수 있어요' };
  return { ok: true, body: { action, ...(n ? { note: n } : {}) } };
}

export const RESULT_OPTIONS = [
  { id: 'signed', label: '계약했어요' },
  { id: 'negotiating', label: '협의 중이에요' },
  { id: 'not_signed', label: '계약하지 않기로 했어요' },
] as const;
export type ResultStatus = (typeof RESULT_OPTIONS)[number]['id'];

/** 의뢰자 계약 결과 알림 본문. 계약했으면 금액·계약일은 아는 만큼만(비워도 된다) */
export function resultBody(status: ResultStatus, amount: string, date: string, note: string): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const n = note.trim();
  if (n.length > 500) return { ok: false, error: '500자까지 적을 수 있어요' };
  const a = status === 'signed' ? digitsOnly(amount) : '';
  const d = status === 'signed' ? date.trim() : '';
  if (d && !validDate(d)) return { ok: false, error: '계약일을 YYYY-MM-DD로 적어 주세요' };
  return { ok: true, body: { status, ...(a && Number(a) > 0 ? { amount: a } : {}), ...(d ? { date: d } : {}), ...(n ? { note: n } : {}) } };
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
/** 상태 표시. 의뢰자에게는 확인 대기가 내 차례다 */
export const stateLabel = (role: 'requester' | 'cro', s: ContractState) => (role === 'requester' && s === 'to_confirm' ? '확인할 차례' : STATE_LABEL[s]);

/** "6,000,000원 낮아요(12%)" 같은 한 줄(선정 견적 대비). 같으면 null */
export function gapLine(v: Pick<ContractView, 'gap'>): string | null {
  if (!v.gap || v.gap.diff === 0) return null;
  const pct = Math.round(Math.abs(v.gap.ratio) * 100);
  return `${won(Math.abs(v.gap.diff))} ${v.gap.diff < 0 ? '낮아요' : '높아요'}(${pct}%)`;
}
