import type { OutboundDraft } from "@danchuai/core";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import type { Session } from "../src/auth";
import { sha256 } from "../src/hash";
import { MemoryOutboundRepo } from "../src/repo";

const TEXT = "반복투여 4주 외 3건 견적 요청드립니다.";
const draft = (over: Partial<OutboundDraft> = {}): OutboundDraft => ({
  id: "d1",
  orgId: "req-org",
  counterpartyOrgId: "cro-org",
  kind: "request",
  text: TEXT,
  textHash: sha256(TEXT),
  epoch: 1,
  status: "drafted",
  ...over,
});
const sessions: Record<string, Session> = {
  "Bearer req": { userId: "u1", orgId: "req-org", role: "requester" },
  "Bearer cro": { userId: "u2", orgId: "cro-org", role: "cro" },
};

function setup(deliver: () => Promise<"sent" | "unknown"> = async () => "sent") {
  const repo = new MemoryOutboundRepo();
  repo.seed(draft());
  const transport = { deliver: vi.fn(deliver) };
  const app = createApp({ auth: { resolve: async (h) => (h ? sessions[h] ?? null : null) }, outbound: repo, transport });
  const post = (path: string, auth: string | null, body?: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  return { repo, transport, post };
}
const approveBody = { decision: "approve", epoch: 1, textHash: sha256(TEXT) };

describe("보내기 API", () => {
  it("로그인 없으면 401", async () => {
    const { post } = setup();
    expect((await post("/v1/outbound/d1/decision", null, approveBody)).status).toBe(401);
  });

  it("AC-02 승인 전 발송은 409이고 전달하지 않는다", async () => {
    const { post, transport } = setup();
    expect((await post("/v1/outbound/d1/dispatch", "Bearer req")).status).toBe(409);
    expect(transport.deliver).not.toHaveBeenCalled();
  });

  it("승인 뒤 한 번 발송하고, 두 번째 발송은 막는다 (AC-04)", async () => {
    const { post, transport } = setup();
    expect((await post("/v1/outbound/d1/decision", "Bearer req", approveBody)).status).toBe(200);
    const first = await post("/v1/outbound/d1/dispatch", "Bearer req");
    expect(await first.json()).toEqual({ status: "sent" });
    expect((await post("/v1/outbound/d1/dispatch", "Bearer req")).status).toBe(409);
    expect(transport.deliver).toHaveBeenCalledTimes(1);
  });

  it("AC-03 본 적 없는 본문 해시로는 승인할 수 없다", async () => {
    const { post } = setup();
    const res = await post("/v1/outbound/d1/decision", "Bearer req", { ...approveBody, textHash: sha256("다른 본문") });
    expect(res.status).toBe(409);
  });

  it("AC-08 다른 조직은 초안이 있는지도 모른다", async () => {
    const { post } = setup();
    expect((await post("/v1/outbound/d1/decision", "Bearer cro", approveBody)).status).toBe(404);
    expect((await post("/v1/outbound/d1/dispatch", "Bearer cro")).status).toBe(404);
  });

  it("AC-04 전달 중 오류는 결과 불명으로 남기고 다시 보내지 않는다", async () => {
    const { post, transport, repo } = setup(async () => {
      throw new Error("timeout");
    });
    await post("/v1/outbound/d1/decision", "Bearer req", approveBody);
    expect(await (await post("/v1/outbound/d1/dispatch", "Bearer req")).json()).toEqual({ status: "unknown" });
    expect((await post("/v1/outbound/d1/dispatch", "Bearer req")).status).toBe(409);
    expect(transport.deliver).toHaveBeenCalledTimes(1);
    expect((await repo.get("d1"))?.status).toBe("unknown");
  });

  it("잘못된 본문은 400", async () => {
    const { post } = setup();
    expect((await post("/v1/outbound/d1/decision", "Bearer req", { decision: "yes" })).status).toBe(400);
  });

  it("AI 공급사 설정이 없으면 에이전트 대화는 503", async () => {
    const { post } = setup();
    expect((await post("/v1/agent/turn", "Bearer req", {})).status).toBe(503);
  });
});
