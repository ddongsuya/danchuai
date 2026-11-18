// 단추 연동 모드의 계정·읽기 API (연동 2단계).
// - /account: 내 정보(단추 계정·역할·기관)와 국외 이전·AI 처리 동의. 가입·조직·초대는 단추 웹에서 한다.
// - /v1/requests, /v1/lab/requests: 단추에서 읽는다. 에이전트 DB에는 아직 보내지 않은 대화(작성 중)만 있다.
// 공개 규칙은 단추가 이미 적용해 보낸다(선정 전 의뢰자 신원 숨김, 비교표 열리기 전 기관명·금액 숨김). 여기서 더 붙이지 않는다.
import { Hono } from "hono";
import { z } from "zod";
import type { Session } from "./auth";
import { BEARER, CONSENT_VERSION, type DanchuIdentity, type WorkspaceRepo } from "./danchuAuth";
import { RFQ_NO, type DanchuApi, type DanchuError } from "./danchu";
import type { MarketRepo, RequesterListItem } from "./db/market";
import { randomUUID } from "node:crypto";
import { checkAction } from "./danchuActions";
import { sha256 } from "./hash";
import type { OutboundRepo } from "./repo";

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

export function danchuAccountRoutes(deps: { lookup: Lookup; workspaces: WorkspaceRepo; api: DanchuApi }) {
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

  // 가입·조직·초대·이름은 단추 계정에서 관리한다
  app.all("*", (c) => c.json({ error: "managed_by_danchu" }, 404));
  return app;
}

/** AI를 부르는 경로 앞에 둔다. 이번 판 동의가 없으면 403 consent_required */
export function requireConsent(workspaces: WorkspaceRepo) {
  return async (c: { get: (k: "session") => Session; json: (b: unknown, s: 403) => Response }, next: () => Promise<void>) => {
    const s = c.get("session");
    if (!(await workspaces.consent(s.userId))) return c.json({ error: "consent_required" }, 403);
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
export function danchuActionRoutes(deps: { outbound: OutboundRepo }) {
  const app = new Hono<{ Variables: { session: Session } }>();
  app.post("/actions", async (c) => {
    const s = c.get("session");
    if (s.role !== "requester" && s.role !== "cro") return c.json({ error: "forbidden" }, 403);
    const r = checkAction(s.role, await c.req.json().catch(() => null));
    if (!r.ok) return c.json({ error: r.error }, r.error === "forbidden" ? 403 : r.error === "too_long" ? 413 : 400);
    const draft = { id: randomUUID(), orgId: s.orgId, counterpartyOrgId: s.orgId, kind: "danchu" as const, text: r.text, textHash: sha256(r.text), epoch: 1, status: "drafted" as const };
    await deps.outbound.insertBatch([draft]);
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
