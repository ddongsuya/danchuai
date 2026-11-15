import { describe, expect, it } from "vitest";
import {
  ApprovalError,
  beginDispatch,
  decide,
  finishDispatch,
  reconcileUnknown,
  reviseDraft,
  type ApprovalDecision,
  type OutboundDraft,
} from "../src/approval";

const base: OutboundDraft = {
  id: "d1",
  orgId: "req-org",
  counterpartyOrgId: "cro-org",
  kind: "request",
  text: "견적 요청드립니다.",
  textHash: "h1",
  epoch: 1,
  status: "drafted",
};
const approve = (over: Partial<ApprovalDecision> = {}): ApprovalDecision => ({
  draftId: "d1",
  decidedBy: "u1",
  decision: "approve",
  epoch: 1,
  textHash: "h1",
  ...over,
});
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as ApprovalError).code;
  }
  return "no-error";
};

describe("보내기 장부", () => {
  it("AC-02 승인 전에는 발송을 시작할 수 없다", () => {
    expect(code(() => beginDispatch(base, approve()))).toBe("not_approved");
  });

  it("승인 → 발송 중 → 발송 완료", () => {
    const a = decide(base, approve(), "req-org");
    expect(a.status).toBe("approved");
    const d = beginDispatch(a, approve());
    expect(d.status).toBe("dispatching");
    expect(finishDispatch(d, "sent").status).toBe("sent");
  });

  it("AC-03 승인 뒤 초안을 고치면 이전 승인으로 보낼 수 없다", () => {
    const a = decide(base, approve(), "req-org");
    const revised = reviseDraft(a, "고친 본문", "h2");
    expect(revised.status).toBe("drafted");
    expect(revised.epoch).toBe(2);
    expect(code(() => beginDispatch(revised, approve()))).toBe("not_approved");
    // 다시 승인하려 해도 옛 판·해시로는 안 된다
    expect(code(() => decide(revised, approve(), "req-org"))).toBe("stale_epoch");
    expect(code(() => decide(revised, approve({ epoch: 2 }), "req-org"))).toBe("hash_mismatch");
    expect(decide(revised, approve({ epoch: 2, textHash: "h2" }), "req-org").status).toBe("approved");
  });

  it("AC-04 한 승인으로 두 번 발송을 시작할 수 없다", () => {
    const d = beginDispatch(decide(base, approve(), "req-org"), approve());
    expect(code(() => beginDispatch(d, approve()))).toBe("not_approved");
  });

  it("AC-04 결과 불명은 다시 보내지 않고 사람이 정리한다", () => {
    const u = finishDispatch(beginDispatch(decide(base, approve(), "req-org"), approve()), "unknown");
    expect(u.status).toBe("unknown");
    expect(code(() => beginDispatch(u, approve()))).toBe("not_approved");
    expect(code(() => reviseDraft(u, "x", "h3"))).toBe("wrong_status");
    expect(reconcileUnknown(u).status).toBe("sent");
  });

  it("AC-08 다른 조직은 승인할 수 없다", () => {
    expect(code(() => decide(base, approve(), "cro-org"))).toBe("wrong_org");
  });

  it("거절된 초안은 보낼 수 없다", () => {
    const r = decide(base, approve({ decision: "reject" }), "req-org");
    expect(r.status).toBe("rejected");
    expect(code(() => beginDispatch(r, approve()))).toBe("not_approved");
  });
});
