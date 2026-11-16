import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { danchuApi, type DanchuApi, type DanchuMe } from "../src/danchu";
import { CONSENT_VERSION, danchuIdentity, MemoryWorkspaceRepo, workspaceKey } from "../src/danchuAuth";
import { MemoryOutboundRepo } from "../src/repo";

/* 단추 계정 연동(연동 2단계): 신원은 단추에서만, 동의 전 AI 금지, 읽기는 단추에서 */
const T_REQ = "tok-requester-aaaaaaaaaaaa";
const T_CRO = "tok-cro-bbbbbbbbbbbbbbbbbbbb";
const T_PENDING = "tok-cro-pending-cccccccccccc";

const ME: Record<string, DanchuMe> = {
  [T_REQ]: { id: "11111111-1111-4111-8111-111111111111", role: "requester", name: "가", email: "a@example.test", org: null },
  [T_CRO]: { id: "22222222-2222-4222-8222-222222222222", role: "cro", name: "나", email: "b@example.test", org: { id: "33333333-3333-4333-8333-333333333333", name: "나기관", plan: "plus" } },
};

function fakeApi(): DanchuApi & { calls: string[]; consentDown: boolean } {
  const calls: string[] = [];
  const me = async (t: string) => {
    calls.push(`me:${t}`);
    if (t === T_PENDING) return { ok: false as const, error: "org_not_ready" as const };
    return ME[t] ? { ok: true as const, data: ME[t]! } : { ok: false as const, error: "unauthorized" as const };
  };
  const api: DanchuApi & { calls: string[]; consentDown: boolean } = {
    calls,
    consentDown: false,
    me,
    requesterList: async () => ({
      ok: true,
      data: [{ no: "DC-2026-0010", title: "물질 A", categories: ["독성"], status: "open", createdAt: "2026-11-10T00:00:00Z", joinBy: null, replyBy: "2026-11-20", sent: 5, joined: 3, submitted: 1, compareOpen: false, selected: false }],
    }),
    requesterDetail: async (_t, no) =>
      no === "DC-2026-0010"
        ? { ok: true, data: { request: { no, title: "물질 A", categories: [], status: "open", createdAt: "2026-11-10", joinBy: null, replyBy: null, sent: 5, joined: 3, submitted: 1, compareOpen: false, selected: false }, compare: { open: false, joined: 3, submitted: 1, replyBy: null } } }
        : { ok: false, error: "not_found" },
    croList: async () => ({ ok: true, data: [] }),
    croDetail: async () => ({ ok: false as const, error: "not_found" as const }),
    recordConsent: async (t: string, version: string) => {
      calls.push(`consent:${t}:${version}`);
      return api.consentDown ? { ok: false as const, error: "unavailable" as const } : { ok: true as const, data: { version } };
    },
  };
  return api;
}

function setup() {
  const api = fakeApi();
  const workspaces = new MemoryWorkspaceRepo();
  const id = danchuIdentity(api, workspaces);
  const app = createApp({ auth: id.resolver, outbound: new MemoryOutboundRepo(), transport: { deliver: async () => "unknown" }, danchu: { api, lookup: id.lookup, workspaces } });
  const call = (method: string, path: string, token: string | null, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { api, call, workspaces };
}

describe("단추 신원", () => {
  it("작업 공간 열쇠: 기관은 단추 기관, 의뢰자는 단추 계정", () => {
    expect(workspaceKey(ME[T_CRO]!)).toBe("cro:33333333-3333-4333-8333-333333333333");
    expect(workspaceKey(ME[T_REQ]!)).toBe("user:11111111-1111-4111-8111-111111111111");
    expect(workspaceKey({ ...ME[T_CRO]!, org: null })).toBeNull();
  });

  it("토큰 없음·틀린 토큰은 401, 승인 전 기관은 403 org_not_ready", async () => {
    const { call } = setup();
    expect((await call("GET", "/account/me", null)).status).toBe(401);
    expect((await call("GET", "/account/me", "tok-wrong-xxxxxxxxxxxxxx")).status).toBe(401);
    const r = await call("GET", "/account/me", T_PENDING);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "org_not_ready" });
  });

  it("내 정보는 단추 값, 같은 기관 담당자 둘은 같은 작업 공간", async () => {
    const { call, api } = setup();
    const a = (await (await call("GET", "/account/me", T_CRO)).json()) as { userId: string; org: { orgId: string; kind: string; name: string }; consent: unknown };
    expect(a).toMatchObject({ userId: ME[T_CRO]!.id, org: { kind: "cro", name: "나기관" }, consent: null });
    ME["tok-cro-second-dddddddddddd"] = { ...ME[T_CRO]!, id: "44444444-4444-4444-8444-444444444444", name: "다" };
    const b = (await (await call("GET", "/account/me", "tok-cro-second-dddddddddddd")).json()) as { org: { orgId: string } };
    expect(b.org.orgId).toBe(a.org.orgId);
    // 같은 토큰은 잠깐 기억한다
    await call("GET", "/account/me", T_CRO);
    expect(api.calls.filter((c) => c === `me:${T_CRO}`)).toHaveLength(1);
  });

  it("가입·조직·초대는 단추에서 관리", async () => {
    const { call } = setup();
    expect((await call("POST", "/account/org", T_REQ, { kind: "cro", name: "x", displayName: "x" })).status).toBe(404);
  });
});

describe("동의", () => {
  it("동의 전에는 AI 대화 403, 이번 판 동의 뒤에는 통과", async () => {
    const { call } = setup();
    expect((await call("POST", "/v1/agent/conversations", T_REQ, {})).status).toBe(403);
    expect((await call("POST", "/account/consent", T_REQ, { version: "1999-01-01" })).status).toBe(400);
    expect((await call("POST", "/account/consent", T_REQ, { version: CONSENT_VERSION })).status).toBe(200);
    expect((await call("POST", "/v1/agent/conversations", T_REQ, {})).status).not.toBe(403);
    const me = (await (await call("GET", "/account/me", T_REQ)).json()) as { consent: { version: string } | null };
    expect(me.consent?.version).toBe(CONSENT_VERSION);
  });

  it("동의는 단추에도 남기고, 단추 기록이 안 되면 503·에이전트 쪽도 남기지 않음", async () => {
    const { call, api } = setup();
    api.consentDown = true;
    expect((await call("POST", "/account/consent", T_REQ, { version: CONSENT_VERSION })).status).toBe(503);
    expect((await call("POST", "/v1/agent/conversations", T_REQ, {})).status).toBe(403);
    api.consentDown = false;
    expect((await call("POST", "/account/consent", T_REQ, { version: CONSENT_VERSION })).status).toBe(200);
    expect(api.calls).toContain(`consent:${T_REQ}:${CONSENT_VERSION}`);
  });

  it("동의는 계정별: 같은 기관 다른 담당자는 따로 동의", async () => {
    const { call } = setup();
    await call("POST", "/account/consent", T_CRO, { version: CONSENT_VERSION });
    ME["tok-cro-third-eeeeeeeeeeeee"] = { ...ME[T_CRO]!, id: "55555555-5555-4555-8555-555555555555" };
    expect((await call("POST", "/v1/agent/conversations", "tok-cro-third-eeeeeeeeeeeee", {})).status).toBe(403);
  });
});

describe("단추에서 읽기", () => {
  it("의뢰자 요청함은 단추 요청을 합계로, 기관 화면은 막힘", async () => {
    const { call } = setup();
    const r = (await (await call("GET", "/v1/requests", T_REQ)).json()) as { items: Array<Record<string, unknown>> };
    expect(r.items[0]).toMatchObject({ requestId: "DC-2026-0010", status: "sent", recipients: 3, replies: 1 });
    expect((await call("GET", "/v1/lab/requests", T_REQ)).status).toBe(403);
    expect((await call("GET", "/v1/requests", T_CRO)).status).toBe(403);
  });

  it("요청 하나: 번호 형식이 아니면 404, 단추가 못 찾으면 404", async () => {
    const { call } = setup();
    expect((await call("GET", "/v1/requests/../me", T_REQ)).status).toBe(404);
    expect((await call("GET", "/v1/requests/DC-2026-9999", T_REQ)).status).toBe(404);
    const ok = (await (await call("GET", "/v1/requests/DC-2026-0010", T_REQ)).json()) as { source: string; compare: { open: boolean } };
    expect(ok).toMatchObject({ source: "danchu", compare: { open: false } });
  });

  it("받는 기관 고르기는 없어졌다(단추가 보냄)", async () => {
    const { call } = setup();
    expect((await call("GET", "/v1/labs", T_REQ)).status).toBe(410);
  });
});

describe("단추 호출", () => {
  it("토큰을 Bearer로 넘기고, 단추 오류 코드를 그대로 받는다", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://danchu.example/api/agent/me");
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer abc");
      return new Response(JSON.stringify({ error: "org_not_ready" }), { status: 403 });
    });
    const api = danchuApi("https://danchu.example", fetchImpl as unknown as typeof fetch);
    expect(await api.me("abc")).toEqual({ ok: false, error: "org_not_ready" });
  });

  it("연결 실패는 unavailable", async () => {
    const api = danchuApi("https://danchu.example", (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch);
    expect(await api.requesterList("abc")).toEqual({ ok: false, error: "unavailable" });
  });

  it("동의 기록은 POST 본문으로 보낸다", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://danchu.example/api/agent/consent");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ version: "2026-11-17" });
      return new Response(JSON.stringify({ consent: { version: "2026-11-17" } }), { status: 200 });
    });
    const api = danchuApi("https://danchu.example", fetchImpl as unknown as typeof fetch);
    expect(await api.recordConsent("abc", "2026-11-17")).toEqual({ ok: true, data: { version: "2026-11-17" } });
  });
});
