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
import type { MarketRepo } from "./db/market";
import { marketRoutes } from "./market";
import type { DanchuApi } from "./danchu";
import type { DanchuIdentity, WorkspaceRepo } from "./danchuAuth";
import type { DanchuError } from "./danchu";
import { danchuAccountRoutes, danchuActionRoutes, danchuMarketRoutes, requireConsent } from "./danchuRoutes";
import { outcomeOf, parseActionText } from "./danchuActions";

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
  /** 요청·회신·선정. 없으면 /v1/labs·/v1/requests·/v1/lab은 503 */
  market?: MarketRepo;
  /** 단추 연동 모드(연동 2단계). 있으면 계정·역할·기관은 단추에서, 요청 읽기도 단추에서. auth는 이 신원으로 만든 것을 넘긴다. */
  danchu?: {
    api: DanchuApi;
    lookup: (authorization: string | undefined) => Promise<DanchuIdentity | DanchuError>;
    workspaces: WorkspaceRepo;
  };
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

  if (deps.danchu) {
    app.route("/account", danchuAccountRoutes({ lookup: deps.danchu.lookup, workspaces: deps.danchu.workspaces, api: deps.danchu.api }));
  } else if (deps.identity && deps.accounts) {
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

  // 국외 이전·AI 처리 동의 전에는 AI 대화를 열지 않는다(단추 연동 모드)
  if (deps.danchu) app.use("/v1/agent/*", requireConsent(deps.danchu.workspaces));

  app.onError((err, c) => {
    if (err instanceof ApprovalError) return c.json({ error: err.code, message: err.message }, STATUS_BY_CODE[err.code]);
    if (err instanceof Error && err.message === "unknown_recipient") return c.json({ error: "unknown_recipient" }, 400);
    // 주소의 id가 uuid 모양이 아니면 DB가 22P02로 거절한다. 없는 자료로 본다.
    if ((err as { code?: unknown }).code === "22P02") return c.json({ error: "not_found" }, 404);
    // 본문·프롬프트·접속 문자열은 남기지 않는다. 원인을 좁힐 수 있게 오류 이름과 코드(예: 28P01, ECONNREFUSED)만 남긴다.
    const code = (err as { code?: unknown }).code;
    console.error("unhandled", err instanceof Error ? err.name : "unknown", typeof code === "string" ? code : "");
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
    // 단추 동작은 단추 연동 모드에서만, 사용자의 단추 토큰으로 보낸다
    const action = draft.kind === "danchu" ? parseActionText(draft.text) : null;
    if (draft.kind === "danchu" && (!deps.danchu || !action)) return c.json({ error: "not_configured" }, 409);
    const dispatching = beginDispatch(draft, approval);
    if (!(await deps.outbound.saveIf(dispatching, { epoch: draft.epoch, status: "approved" }))) {
      return c.json({ error: "conflict" }, 409);
    }
    let outcome: "sent" | "unknown" | "failed";
    let result: unknown;
    if (action && deps.danchu) {
      const token = (c.req.header("authorization") ?? "").replace(/^Bearer /, "");
      const r = await deps.danchu.api.act(token, action);
      outcome = r.status === 0 ? "unknown" : outcomeOf(r.status);
      result = r.body;
      await deps.outbound.saveResult(draft.id, result ?? null).catch(() => undefined);
    } else {
      try {
        outcome = await deps.transport.deliver(dispatching);
      } catch {
        outcome = "unknown";
      }
    }
    const done = finishDispatch(dispatching, outcome);
    await deps.outbound.saveIf(done, { epoch: dispatching.epoch, status: "dispatching" });
    return c.json(action ? { status: done.status, result: result ?? null } : { status: done.status });
  });

  app.route(
    "/v1/agent",
    agentRoutes({
      provider: deps.provider,
      conversations: deps.conversations ?? new MemoryConversationRepo(),
      requests: deps.requests ?? new MemoryRequestDirectory(),
      outbound: deps.outbound,
      market: deps.market,
    }),
  );

  if (deps.danchu) {
    app.route("/v1/danchu", danchuActionRoutes({ outbound: deps.outbound }));
    app.route("/v1", danchuMarketRoutes({ api: deps.danchu.api, market: deps.market }));
  } else if (deps.market) {
    app.route("/v1", marketRoutes(deps.market));
  } else {
    for (const p of ["/v1/labs", "/v1/requests", "/v1/requests/*", "/v1/lab/*"]) app.all(p, (c) => c.json({ error: "not_configured" }, 503));
  }

  return app;
}
