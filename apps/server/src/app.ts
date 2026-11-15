import {
  ApprovalError,
  beginDispatch,
  decide,
  finishDispatch,
  type LlmProvider,
} from "@danchuai/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AuthResolver, Session } from "./auth";
import type { OutboundRepo } from "./repo";
import type { Transport } from "./transport";
import { agentRoutes } from "./agent/routes";
import { accountRoutes, type AccountRepo } from "./account";
import type { IdentityResolver } from "./supabaseAuth";
import { MemoryConversationRepo, MemoryRequestDirectory, type ConversationRepo, type RequestDirectory } from "./agent/store";

export interface Deps {
  auth: AuthResolver;
  outbound: OutboundRepo;
  transport: Transport;
  /** 없으면 에이전트 대화는 503 */
  provider?: LlmProvider;
  conversations?: ConversationRepo;
  requests?: RequestDirectory;
  /** 둘 다 있어야 /account(가입·초대)를 연다. 조직이 없어도 들어오는 경로라 /v1과 분리한다. */
  identity?: IdentityResolver;
  accounts?: AccountRepo;
}

type Env = { Variables: { session: Session } };

const DecisionBody = z.object({
  decision: z.enum(["approve", "reject"]),
  epoch: z.number().int().positive(),
  textHash: z.string().regex(/^[0-9a-f]{64}$/),
});

const STATUS_BY_CODE: Record<ApprovalError["code"], 403 | 409> = {
  wrong_org: 403,
  stale_epoch: 409,
  hash_mismatch: 409,
  wrong_status: 409,
  not_approved: 409,
};

export function createApp(deps: Deps) {
  const app = new Hono<Env>();

  app.get("/health", (c) => c.json({ ok: true }));

  if (deps.identity && deps.accounts) {
    app.route("/account", accountRoutes({ identity: deps.identity, repo: deps.accounts }));
  } else {
    app.all("/account/*", (c) => c.json({ error: "not_configured" }, 503));
  }

  app.use("/v1/*", async (c, next) => {
    const session = await deps.auth.resolve(c.req.header("authorization"));
    if (!session) return c.json({ error: "unauthorized" }, 401);
    c.set("session", session);
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof ApprovalError) return c.json({ error: err.code, message: err.message }, STATUS_BY_CODE[err.code]);
    console.error("unhandled", err instanceof Error ? err.name : "unknown"); // 본문·프롬프트는 로그에 남기지 않는다
    return c.json({ error: "internal" }, 500);
  });

  // 사람의 승인/거절. 결정자가 본 판·해시가 지금 초안과 같아야 한다.
  app.post("/v1/outbound/:id/decision", async (c) => {
    const s = c.get("session");
    const parsed = DecisionBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const draft = await deps.outbound.get(c.req.param("id"));
    // 다른 조직의 초안은 있는지 없는지도 알려 주지 않는다
    if (!draft || draft.orgId !== s.orgId) return c.json({ error: "not_found" }, 404);
    const decision = { draftId: draft.id, decidedBy: s.userId, ...parsed.data };
    const next = decide(draft, decision, s.orgId);
    if (!(await deps.outbound.saveIf(next, { epoch: draft.epoch, status: draft.status }))) {
      return c.json({ error: "conflict" }, 409);
    }
    await deps.outbound.saveDecision(decision);
    return c.json({ status: next.status });
  });

  // 발송. 승인 한 건에 한 번만 시도하고, 결과를 모르면 unknown으로 남긴다.
  app.post("/v1/outbound/:id/dispatch", async (c) => {
    const s = c.get("session");
    const draft = await deps.outbound.get(c.req.param("id"));
    if (!draft || draft.orgId !== s.orgId) return c.json({ error: "not_found" }, 404);
    const approval = await deps.outbound.latestApproval(draft.id);
    if (!approval) return c.json({ error: "not_approved" }, 409);
    const dispatching = beginDispatch(draft, approval);
    if (!(await deps.outbound.saveIf(dispatching, { epoch: draft.epoch, status: "approved" }))) {
      return c.json({ error: "conflict" }, 409);
    }
    let outcome: "sent" | "unknown";
    try {
      outcome = await deps.transport.deliver(dispatching);
    } catch {
      outcome = "unknown";
    }
    const done = finishDispatch(dispatching, outcome);
    await deps.outbound.saveIf(done, { epoch: dispatching.epoch, status: "dispatching" });
    return c.json({ status: done.status });
  });

  app.route(
    "/v1/agent",
    agentRoutes({
      provider: deps.provider,
      conversations: deps.conversations ?? new MemoryConversationRepo(),
      requests: deps.requests ?? new MemoryRequestDirectory(),
      outbound: deps.outbound,
    }),
  );

  return app;
}
