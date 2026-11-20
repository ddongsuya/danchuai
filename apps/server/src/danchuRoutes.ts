// 단추 연동 모드의 계정·읽기 API (연동 2단계).
// - /account: 내 정보(단추 계정·역할·기관)와 국외 이전·AI 처리 동의. 가입·조직·초대는 단추 웹에서 한다.
// - /v1/requests, /v1/lab/requests: 단추에서 읽는다. 에이전트 DB에는 아직 보내지 않은 대화(작성 중)만 있다.
// 공개 규칙은 단추가 이미 적용해 보낸다(선정 전 의뢰자 신원 숨김, 비교표 열리기 전 기관명·금액 숨김). 여기서 더 붙이지 않는다.
import { Hono, type Context, type Next } from "hono";
import { z } from "zod";
import type { Session } from "./auth";
import { BEARER, CONSENT_VERSION, type DanchuIdentity, type WorkspaceRepo } from "./danchuAuth";
import { RFQ_NO, type DanchuApi, type DanchuError } from "./danchu";
import type { MarketRepo, RequesterListItem } from "./db/market";
import { randomUUID } from "node:crypto";
import { canLinkConversation, checkAction, checkCatalogAction, isKnownAction } from "./danchuActions";
import type { ConversationRepo } from "./agent/store";
import { sha256 } from "./hash";
import type { OutboundRepo } from "./repo";
import type { PurgeRepo } from "./purge";
import { runAuto, runView, type CatalogCache } from "./danchuAssist";
import type { RunRepo } from "./runs";

const STATUS: Record<DanchuError, 401 | 403 | 404 | 429 | 503> = {
  unauthorized: 401,
  forbidden: 403,
  org_not_ready: 403,
  plan_required: 403,
  not_found: 404,
  rate_limited: 429,
  unavailable: 503,
};

type Lookup = (authorization: string | undefined) => Promise<DanchuIdentity | DanchuError>;

const ConsentBody = z.object({ version: z.literal(CONSENT_VERSION) }).strict();

export function danchuAccountRoutes(deps: { lookup: Lookup; workspaces: WorkspaceRepo; api: DanchuApi; purge?: PurgeRepo }) {
  const app = new Hono<{ Variables: { id: DanchuIdentity } }>();
  app.use("*", async (c, next) => {
    const r = await deps.lookup(c.req.header("authorization"));
    if (typeof r === "string") return c.json({ error: r }, STATUS[r]);
    c.set("id", r);
    await next();
  });

  app.get("/me", async (c) => {
    const { me, session } = c.get("id");
    const consent = await deps.workspaces.consent(me.id);
    return c.json({
      source: "danchu",
      userId: me.id,
      email: me.email,
      org: { orgId: session.orgId, kind: me.role, name: me.org?.name ?? me.name ?? me.email, memberRole: "member", displayName: me.name },
      danchuOrg: me.org,
      consent: consent ?? null,
      consentVersion: CONSENT_VERSION,
    });
  });

  app.post("/consent", async (c) => {
    const parsed = ConsentBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    // 단추에 먼저 남긴다. 단추 기록이 안 되면 에이전트 쪽도 남기지 않는다(양쪽 기록이 같아야 한다)
    const token = BEARER.exec(c.req.header("authorization") ?? "")![1]!;
    const r = await deps.api.recordConsent(token, parsed.data.version);
    if (!r.ok) return c.json({ error: r.error }, STATUS[r.error]);
    await deps.workspaces.agree(c.get("id").me.id, parsed.data.version);
    return c.json({ consent: await deps.workspaces.consent(c.get("id").me.id) });
  });

  // 동의 철회(처리방침 3항). 단추에 먼저 철회를 남기고(단추는 기록을 3년 보관), 에이전트 쪽 동의를 철회로 표시한 뒤
  // 이 사람의 대화·초안·승인 기록을 지운다. 단추 철회가 안 되면 아무것도 바꾸지 않고 503(다시 시도)
  app.post("/consent/revoke", async (c) => {
    const parsed = ConsentBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const token = BEARER.exec(c.req.header("authorization") ?? "")![1]!;
    const r = await deps.api.revokeConsent(token, parsed.data.version);
    if (!r.ok) return c.json({ error: r.error }, STATUS[r.error]);
    const userId = c.get("id").me.id;
    await deps.workspaces.revoke(userId);
    const removed = deps.purge ? await deps.purge.purge(userId, "consent_revoked") : { conversations: 0, drafts: 0 };
    return c.json({ revoked: { version: parsed.data.version }, removed });
  });

  // 가입·조직·초대·이름은 단추 계정에서 관리한다
  app.all("*", (c) => c.json({ error: "managed_by_danchu" }, 404));
  return app;
}

/**
 * AI를 부르는 경로 앞에 둔다. 이번 판 동의가 없으면 403 consent_required.
 * 단추 연동이면 단추 동의 기록도 본다(계정별로 잠깐 기억, 기본 60초). 단추에서 철회됐으면 여기서도 철회로 표시하고
 * 대화·초안을 지운 뒤 403. 단추가 응답하지 않으면 에이전트 쪽 사본으로 판단한다(철회는 단추가 따로 알린다).
 */
export function requireConsent(workspaces: WorkspaceRepo, opts: { api?: DanchuApi; purge?: PurgeRepo; ttlMs?: number; now?: () => number } = {}) {
  const ttl = opts.ttlMs ?? 60_000;
  const now = opts.now ?? (() => Date.now());
  const checked = new Map<string, number>();
  return async (c: Context<{ Variables: { session: Session } }>, next: Next) => {
    const s = c.get("session");
    if (!(await workspaces.consent(s.userId))) return c.json({ error: "consent_required" }, 403);
    if (opts.api) {
      const t = now();
      if ((checked.get(s.userId) ?? 0) <= t) {
        const token = BEARER.exec(c.req.header("authorization") ?? "")?.[1];
        const r = token ? await opts.api.consents(token) : null;
        if (r?.ok) {
          if (!r.data.some((x) => x.version === CONSENT_VERSION)) {
            checked.delete(s.userId);
            await workspaces.revoke(s.userId);
            if (opts.purge) await opts.purge.purge(s.userId, "consent_revoked");
            return c.json({ error: "consent_required" }, 403);
          }
          if (checked.size > 5000) for (const [k, v] of checked) if (v <= t) checked.delete(k);
          checked.set(s.userId, t + ttl);
        }
      }
    }
    await next();
  };
}

export function danchuMarketRoutes(deps: { api: DanchuApi; market?: MarketRepo }) {
  const app = new Hono<{ Variables: { session: Session } }>();
  const token = (h: string | undefined) => BEARER.exec(h ?? "")?.[1] ?? "";

  // 의뢰자 요청함: 단추 요청(최근 순) + 아직 보내지 않은 에이전트 대화
  app.get("/requests", async (c) => {
    const s = c.get("session");
    if (s.role !== "requester") return c.json({ error: "forbidden" }, 403);
    const r = await deps.api.requesterList(token(c.req.header("authorization")));
    if (!r.ok) return c.json({ error: r.error }, STATUS[r.error]);
    const drafts = deps.market ? (await deps.market.requesterList(s.orgId)).filter((x) => x.status === "drafting" || x.status === "waiting") : [];
    const sent: RequesterListItem[] = r.data.map((x) => ({
      conversationId: "",
      requestId: x.no,
      title: x.title,
      status: x.selected ? "selected" : x.status === "closed" || x.status === "cancelled" ? "closed" : "sent",
      recipients: x.joined,
      replies: x.submitted,
      updatedAt: x.createdAt,
      compareOpen: x.compareOpen,
    }));
    const items = [...drafts, ...sent].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return c.json({ items });
  });

  app.get("/requests/:no", async (c) => {
    const s = c.get("session");
    if (s.role !== "requester") return c.json({ error: "forbidden" }, 403);
    const no = c.req.param("no");
    if (!RFQ_NO.test(no)) return c.json({ error: "not_found" }, 404);
    const r = await deps.api.requesterDetail(token(c.req.header("authorization")), no);
    if (!r.ok) return c.json({ error: r.error }, STATUS[r.error]);
    return c.json({ source: "danchu", ...r.data });
  });

  app.get("/lab/requests", async (c) => {
    const s = c.get("session");
    if (s.role !== "cro") return c.json({ error: "forbidden" }, 403);
    const r = await deps.api.croList(token(c.req.header("authorization")));
    if (!r.ok) return c.json({ error: r.error }, STATUS[r.error]);
    return c.json({ source: "danchu", items: r.data });
  });

  app.get("/lab/requests/:no", async (c) => {
    const s = c.get("session");
    if (s.role !== "cro") return c.json({ error: "forbidden" }, 403);
    const no = c.req.param("no");
    if (!RFQ_NO.test(no)) return c.json({ error: "not_found" }, 404);
    const r = await deps.api.croDetail(token(c.req.header("authorization")), no);
    if (!r.ok) return c.json({ error: r.error }, STATUS[r.error]);
    return c.json({ source: "danchu", item: r.data });
  });

  // 기관: 요청서 전체와 회신 초안(말로 맡기는 견적 1단계). 단추가 공개 규칙을 적용해 보낸다
  app.get("/lab/requests/:no/quote", async (c) => {
    const s = c.get("session");
    if (s.role !== "cro") return c.json({ error: "forbidden" }, 403);
    const no = c.req.param("no");
    if (!RFQ_NO.test(no)) return c.json({ error: "not_found" }, 404);
    const r = await deps.api.croQuote(token(c.req.header("authorization")), no);
    if (!r.ok) return c.json({ error: r.error }, STATUS[r.error]);
    return c.json({ source: "danchu", quote: r.data });
  });

  // 받는 기관 고르기·선정은 단추 규칙(단추가 기관에 보냄, 비교표 연 뒤 선정)으로 바뀐다. 선정은 5단계에서 단추 입구로 연다.
  app.all("/labs", (c) => c.json({ error: "gone" }, 410));
  app.all("/lab/requests/:id/viewed", (c) => c.body(null, 204));
  app.all("/requests/:no/select", (c) => c.json({ error: "not_yet" }, 501));
  return app;
}

/**
 * 단추에서 실행할 동작의 확인 카드 (연동 4·5단계).
 * POST /danchu/actions { action, rfqNo?, body } → 초안(drafted). 보내기는 기존 장부 흐름(decision → dispatch)을 그대로 쓴다.
 * GET /danchu/actions/:id → 상태와 단추 응답
 */
export function danchuActionRoutes(deps: { outbound: OutboundRepo; conversations?: ConversationRepo; catalogs?: CatalogCache }) {
  const app = new Hono<{ Variables: { session: Session } }>();
  app.post("/actions", async (c) => {
    const s = c.get("session");
    if (s.role !== "requester" && s.role !== "cro") return c.json({ error: "forbidden" }, 403);
    // conversationId 는 이 동작을 만든 대화(승인 뒤 상태를 맞춘다). 단추로 보내는 본문(text)에는 넣지 않는다.
    const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const { conversationId, ...input } = raw && typeof raw === "object" ? raw : { conversationId: undefined };
    if (conversationId !== undefined && (typeof conversationId !== "string" || !/^[0-9a-f-]{36}$/.test(conversationId))) return c.json({ error: "bad_request" }, 400);
    // 고정 목록 밖의 동작은 단추 액션 목록에서 승인(confirm) 동작인지 본다(등록부에 새로 생긴 승인 동작)
    const known = isKnownAction(s.role, (input as { action?: unknown }).action);
    const r = known || !deps.catalogs
      ? checkAction(s.role, raw ? input : null)
      : checkCatalogAction(s.role, raw ? input : null, await deps.catalogs.get(BEARER.exec(c.req.header("authorization") ?? "")?.[1] ?? "", s.orgId));
    if (!r.ok) return c.json({ error: r.error }, r.error === "forbidden" ? 403 : r.error === "too_long" ? 413 : 400);
    if (conversationId) {
      const conv = deps.conversations ? await deps.conversations.get(conversationId) : null;
      // 다른 조직·다른 요청의 대화는 있는지 없는지 알리지 않는다
      if (!canLinkConversation(conv, s, r.action)) return c.json({ error: "not_found" }, 404);
    }
    const draft = { id: randomUUID(), orgId: s.orgId, counterpartyOrgId: s.orgId, kind: "danchu" as const, text: r.text, textHash: sha256(r.text), epoch: 1, status: "drafted" as const };
    await deps.outbound.insertBatch([draft], conversationId ? { conversationId } : undefined);
    return c.json({ id: draft.id, action: r.action, text: draft.text, textHash: draft.textHash, epoch: draft.epoch, status: draft.status }, 201);
  });
  app.get("/actions/:id", async (c) => {
    const s = c.get("session");
    const d = await deps.outbound.get(c.req.param("id"));
    if (!d || d.orgId !== s.orgId || d.kind !== "danchu") return c.json({ error: "not_found" }, 404);
    return c.json({ id: d.id, text: d.text, textHash: d.textHash, epoch: d.epoch, status: d.status, result: await deps.outbound.getResult(d.id) });
  });
  return app;
}

/**
 * 단추 액션 바로 실행 (에이전트 액션 등록부, 2026-11-19).
 * GET  /danchu/catalog            이 사용자가 할 수 있는 액션 목록(단추가 정한다)
 * POST /danchu/run                읽기(read)·바로 실행(auto)만. 승인이 필요한 것은 409 needs_approval(확인 카드: POST /danchu/actions)
 * GET  /danchu/runs               최근 실행 기록
 * POST /danchu/runs/:id/undo      바로 실행한 기관 기록 되돌리기(시킨 사람만, 단추가 7일·변경 여부를 본다)
 */
export function danchuRunRoutes(deps: { api: DanchuApi; runs: RunRepo; catalogs: CatalogCache; conversations?: ConversationRepo }) {
  const app = new Hono<{ Variables: { session: Session } }>();
  const token = (h: string | undefined) => BEARER.exec(h ?? "")?.[1] ?? "";
  const RunBody = z
    .object({
      action: z.string().regex(/^[a-z][a-z_]{1,39}$/),
      rfqNo: z.string().regex(RFQ_NO).optional(),
      body: z.record(z.string(), z.unknown()).optional(),
      conversationId: z.string().uuid().optional(),
    })
    .strict();

  app.get("/catalog", async (c) => {
    const s = c.get("session");
    const cat = await deps.catalogs.get(token(c.req.header("authorization")), s.orgId);
    if (!cat) return c.json({ error: "unavailable" }, 503);
    return c.json(cat);
  });

  app.post("/run", async (c) => {
    const s = c.get("session");
    const p = RunBody.safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json({ error: "bad_request" }, 400);
    const t = token(c.req.header("authorization"));
    const cat = await deps.catalogs.get(t, s.orgId);
    if (!cat) return c.json({ error: "unavailable" }, 503);
    const a = cat.actions.find((x) => x.name === p.data.action);
    if (!a) return c.json({ error: "unknown_action" }, 404);
    if (a.level === "confirm") return c.json({ error: "needs_approval" }, 409);
    if (a.level === "human") return c.json({ error: "human_only" }, 403);
    if ((a.scope === "rfq") !== !!p.data.rfqNo) return c.json({ error: "bad_request" }, 400);
    if (p.data.conversationId) {
      const conv = deps.conversations ? await deps.conversations.get(p.data.conversationId) : null;
      if (!conv || conv.orgId !== s.orgId) return c.json({ error: "not_found" }, 404);
    }
    const body = p.data.body ?? {};
    if (a.level === "read") {
      const r = await deps.api.run(t, { action: a.name, rfqNo: p.data.rfqNo ?? null, body });
      if (r.status === 0) return c.json({ error: "unavailable" }, 503);
      return c.json({ result: r.body }, readStatus(r.status));
    }
    // 바로 실행은 요청 번호 없는 기관 기록과, 요청 단위 가운데 의뢰자에게 보이지 않는 것(RFQ_AUTO_RUN)만. 나머지 요청 단위 동작은 견적 확인 카드에서
    if (a.scope !== "org" && !RFQ_AUTO_RUN.has(a.name)) return c.json({ error: "needs_approval" }, 409);
    const done = await runAuto({ api: deps.api, runs: deps.runs }, s, t, a, body, p.data.conversationId ?? null, undefined, p.data.rfqNo ?? null);
    return c.json({ run: runView(done.run), result: done.result }, done.run.outcome === "done" ? 200 : done.run.outcome === "failed" ? 422 : 502);
  });

  app.get("/runs", async (c) => {
    const s = c.get("session");
    return c.json({ items: (await deps.runs.recent(s.orgId, s.userId, 30)).map(runView) });
  });

  app.post("/runs/:id/undo", async (c) => {
    const s = c.get("session");
    const run = await deps.runs.get(c.req.param("id"), s.orgId, s.userId);
    if (!run) return c.json({ error: "not_found" }, 404);
    if (run.undoneAt) return c.json({ error: "already_undone" }, 409);
    if (!run.undoable || !run.danchuLogId || run.outcome !== "done") return c.json({ error: "not_undoable" }, 409);
    if (!(await deps.runs.markUndone(run.id, new Date().toISOString()))) return c.json({ error: "already_undone" }, 409);
    const r = await deps.api.undo(token(c.req.header("authorization")), run.danchuLogId);
    if (r.status >= 200 && r.status < 300) return c.json({ run: runView({ ...run, undoneAt: new Date().toISOString() }) });
    const code = r.body && typeof r.body === "object" && typeof (r.body as { error?: unknown }).error === "string" ? (r.body as { error: string }).error : "unavailable";
    // 단추가 이미 되돌린 것으로 알면 표시를 둔다. 그 밖에는 표시를 푼다
    if (code !== "already_undone") await deps.runs.clearUndone(run.id);
    const known = ["already_undone", "not_undoable", "expired", "changed", "not_found"];
    return c.json({ error: known.includes(code) ? code : "unavailable" }, known.includes(code) ? 409 : 503);
  });
  return app;
}

/** 요청 번호가 있는 바로 실행 가운데 앱 버튼으로 바로 하는 것: 기관 견적서 툴 견적서 만들기(의뢰자에게 보이지 않는다) */
export const RFQ_AUTO_RUN: ReadonlySet<string> = new Set(["quote_doc"]);

/** 단추 읽기 응답 상태 → 앱에 돌려줄 상태 */
function readStatus(status: number): 200 | 400 | 401 | 403 | 404 | 503 {
  if (status >= 200 && status < 300) return 200;
  if (status === 401 || status === 403 || status === 404) return status;
  return status >= 500 ? 503 : 400;
}
