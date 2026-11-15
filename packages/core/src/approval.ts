// 보내기 장부: 초안 → 사람 확인 → 승인/거절 → 발송 중 → 발송 완료 / 결과 불명.
// 승인은 초안 본문 해시와 초안 판(epoch)에 묶인다. 초안이 바뀌면 이전 승인은 아무것도 내보내지 못한다.

export type OutboundStatus =
  | "drafted"
  | "approved"
  | "rejected"
  | "dispatching"
  | "sent"
  | "unknown";

export interface OutboundDraft {
  id: string;
  orgId: string;
  /** 받는 쪽 조직 */
  counterpartyOrgId: string;
  kind: "request" | "reply" | "question";
  text: string;
  /** 본문 sha256 (서버가 계산) */
  textHash: string;
  /** 초안이 바뀔 때마다 1씩 오른다 */
  epoch: number;
  status: OutboundStatus;
}

export interface ApprovalDecision {
  draftId: string;
  decidedBy: string;
  decision: "approve" | "reject";
  /** 결정 당시 본 초안 판 */
  epoch: number;
  /** 결정 당시 본 본문 해시 */
  textHash: string;
}

export class ApprovalError extends Error {
  constructor(
    readonly code:
      | "stale_epoch"
      | "hash_mismatch"
      | "wrong_status"
      | "wrong_org"
      | "not_approved",
    message: string,
  ) {
    super(message);
  }
}

const NEXT: Record<OutboundStatus, readonly OutboundStatus[]> = {
  drafted: ["approved", "rejected", "drafted"],
  approved: ["dispatching", "drafted"],
  rejected: ["drafted"],
  dispatching: ["sent", "unknown"],
  unknown: ["sent"],
  sent: [],
};

export function canTransition(from: OutboundStatus, to: OutboundStatus): boolean {
  return NEXT[from].includes(to);
}

/** 초안 본문을 고친다. 판이 오르고 상태는 drafted로 돌아가, 이전 승인은 무효가 된다. */
export function reviseDraft(draft: OutboundDraft, text: string, textHash: string): OutboundDraft {
  if (!canTransition(draft.status, "drafted")) {
    throw new ApprovalError("wrong_status", `${draft.status} 상태에서는 고칠 수 없어요`);
  }
  return { ...draft, text, textHash, epoch: draft.epoch + 1, status: "drafted" };
}

/** 사람의 결정을 적용한다. 결정자가 본 판·해시가 지금 초안과 같아야 한다. */
export function decide(draft: OutboundDraft, d: ApprovalDecision, deciderOrgId: string): OutboundDraft {
  if (deciderOrgId !== draft.orgId) throw new ApprovalError("wrong_org", "다른 조직의 초안이에요");
  if (draft.status !== "drafted") {
    throw new ApprovalError("wrong_status", `${draft.status} 상태는 결정할 수 없어요`);
  }
  if (d.epoch !== draft.epoch) throw new ApprovalError("stale_epoch", "초안이 바뀌어서 다시 확인해야 해요");
  if (d.textHash !== draft.textHash) throw new ApprovalError("hash_mismatch", "확인한 본문과 지금 본문이 달라요");
  return { ...draft, status: d.decision === "approve" ? "approved" : "rejected" };
}

/** 발송 직전 검사. 통과하면 dispatching으로 바뀐 초안을 돌려준다. 한 승인에 한 번만 통과한다. */
export function beginDispatch(draft: OutboundDraft, approval: ApprovalDecision): OutboundDraft {
  if (draft.status !== "approved" || approval.decision !== "approve") {
    throw new ApprovalError("not_approved", "승인된 초안만 보낼 수 있어요");
  }
  if (approval.epoch !== draft.epoch) throw new ApprovalError("stale_epoch", "승인 뒤 초안이 바뀌었어요");
  if (approval.textHash !== draft.textHash) throw new ApprovalError("hash_mismatch", "승인한 본문과 달라요");
  return { ...draft, status: "dispatching" };
}

/** 발송 결과를 적는다. 결과를 모르면 unknown이며 자동으로 다시 보내지 않는다. */
export function finishDispatch(draft: OutboundDraft, outcome: "sent" | "unknown"): OutboundDraft {
  if (draft.status !== "dispatching") {
    throw new ApprovalError("wrong_status", `${draft.status} 상태에서는 결과를 적을 수 없어요`);
  }
  return { ...draft, status: outcome };
}

/** 결과 불명을 사람이 확인해 발송 완료로 정리한다. 다시 보내는 길은 없다. */
export function reconcileUnknown(draft: OutboundDraft): OutboundDraft {
  if (draft.status !== "unknown") throw new ApprovalError("wrong_status", "결과 불명 상태만 정리할 수 있어요");
  return { ...draft, status: "sent" };
}
