import { Hono } from "hono";
import { z } from "zod";
import type { Session } from "./auth";
import type { MarketRepo } from "./db/market";

// 요청·회신·선정 API. 조직과 역할은 세션에서만 가져온다(본문·주소의 조직 값은 믿지 않는다).
type Env = { Variables: { session: Session } };

const SelectBody = z.object({ labOrgId: z.string().uuid() }).strict();

export function marketRoutes(repo: MarketRepo) {
  const app = new Hono<Env>();
  const requesterOnly = (s: Session) => s.role === "requester";
  const labOnly = (s: Session) => s.role === "cro";

  // 받는 기관 고르기: 가입한 기관 전체, 가나다순(추천·순위 없음)
  app.get("/labs", async (c) => {
    if (!requesterOnly(c.get("session"))) return c.json({ error: "forbidden" }, 403);
    return c.json({ labs: await repo.labs() });
  });

  app.get("/requests", async (c) => {
    const s = c.get("session");
    if (!requesterOnly(s)) return c.json({ error: "forbidden" }, 403);
    return c.json({ items: await repo.requesterList(s.orgId) });
  });

  app.get("/requests/:id", async (c) => {
    const s = c.get("session");
    if (!requesterOnly(s)) return c.json({ error: "forbidden" }, 403);
    const d = await repo.requesterDetail(s.orgId, c.req.param("id"));
    return d ? c.json(d) : c.json({ error: "not_found" }, 404);
  });

  // 선정: 사람이 시트에서 승인한 뒤 한 번만. 회신한 기관만 고를 수 있다.
  app.post("/requests/:id/select", async (c) => {
    const s = c.get("session");
    if (!requesterOnly(s)) return c.json({ error: "forbidden" }, 403);
    const parsed = SelectBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const r = await repo.select({ orgId: s.orgId, userId: s.userId, requestId: c.req.param("id"), labOrgId: parsed.data.labOrgId });
    if (r === "ok") return c.json({ status: "selected" });
    return c.json({ error: r }, r === "not_found" ? 404 : 409);
  });

  app.get("/lab/requests", async (c) => {
    const s = c.get("session");
    if (!labOnly(s)) return c.json({ error: "forbidden" }, 403);
    return c.json({ items: await repo.labInbox(s.orgId) });
  });

  app.get("/lab/requests/:id", async (c) => {
    const s = c.get("session");
    if (!labOnly(s)) return c.json({ error: "forbidden" }, 403);
    const d = await repo.labDetail(s.orgId, c.req.param("id"));
    return d ? c.json(d) : c.json({ error: "not_found" }, 404);
  });

  app.post("/lab/requests/:id/viewed", async (c) => {
    const s = c.get("session");
    if (!labOnly(s)) return c.json({ error: "forbidden" }, 403);
    await repo.markViewed(s.orgId, c.req.param("id"));
    return c.body(null, 204);
  });

  return app;
}
