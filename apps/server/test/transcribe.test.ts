// 회의 녹음 전사 임시 토큰 (src/transcribe.ts)
// - 기관 담당자만, 녹음마다 참석자 동의 확인, 길이 상한, 이용량 상한, 키가 없으면 404
// - 토큰 발급 때 녹음 길이 × 분당 단가를 이용량에 더한다. 전사 서비스는 학습 제외로 부른다
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Session } from "../src/auth";
import { deepgramListenUrl, deepgramStt, sttConfigFromEnv, transcribeRoutes, type SttProvider } from "../src/transcribe";
import { MemoryUsageRepo, periods, usageMeter } from "../src/usage";

const CRO: Session = { userId: "u-1", orgId: "o-1", role: "cro" };
const REQ: Session = { userId: "u-2", orgId: "o-2", role: "requester" };

function setup(opts: { stt?: SttProvider | null; capUsd?: number } = {}) {
  const repo = new MemoryUsageRepo();
  const usage = usageMeter(repo, { prices: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }, caps: { userDay: Math.round((opts.capUsd ?? 2) * 1e6), orgMonth: null, allMonth: null } });
  const grants: number[] = [];
  const stt: SttProvider = {
    name: "deepgram",
    listenUrl: deepgramListenUrl("nova-3", "ko"),
    grant: async (ttl) => (grants.push(ttl), { token: "tmp-jwt", expiresIn: ttl }),
  };
  const app = new Hono<{ Variables: { session: Session } }>();
  let who: Session = CRO;
  app.use("*", async (c, next) => {
    c.set("session", who);
    await next();
  });
  app.route("/t", transcribeRoutes({ stt: opts.stt === null ? undefined : (opts.stt ?? stt), pricePerMin: 0.0043, maxMinutes: 180, usage }));
  const post = (body: unknown, as: Session = CRO) => {
    who = as;
    return app.request("/t/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  };
  return { post, repo, grants };
}

describe("전사 임시 토큰", () => {
  it("기관 담당자가 참석자 동의를 확인하면 짧은 토큰과 전사 주소를 준다. 녹음 길이만큼 이용량에 더한다", async () => {
    const { post, repo, grants } = setup();
    const r = await post({ minutes: 60, attest: true });
    expect(r.status).toBe(200);
    const j = (await r.json()) as Record<string, string>;
    expect(j).toMatchObject({ provider: "deepgram", token: "tmp-jwt" });
    expect(j.url).toContain("language=ko");
    expect(j.url).toContain("mip_opt_out=true");
    expect(j.url).toContain("diarize=true");
    expect(grants).toEqual([120]);
    const day = periods(new Date()).day;
    expect(repo.rows.get(`user:u-1|${day}`)?.cost).toBe(258_000);
  });

  it("동의 확인이 없거나 모양이 틀리면 400, 의뢰자 403, 너무 길면 413, 키가 없으면 404", async () => {
    const { post } = setup();
    expect((await post({ minutes: 10 })).status).toBe(400);
    expect((await post({ minutes: 10, attest: false })).status).toBe(400);
    expect((await post({ minutes: 0, attest: true })).status).toBe(400);
    expect((await post({ minutes: 10, attest: true, extra: 1 })).status).toBe(400);
    expect((await post({ minutes: 10, attest: true }, REQ)).status).toBe(403);
    expect((await post({ minutes: 181, attest: true })).status).toBe(413);
    expect((await setup({ stt: null }).post({ minutes: 10, attest: true })).status).toBe(404);
  });

  it("이용량 상한을 넘었으면 토큰을 주지 않는다", async () => {
    const { post, grants } = setup({ capUsd: 0.5 });
    expect((await post({ minutes: 120, attest: true })).status).toBe(200);
    const r = await post({ minutes: 10, attest: true });
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: "usage_limit" });
    expect(grants).toHaveLength(1);
  });

  it("Deepgram 토큰: 서버 키는 Token 머리글로, ttl_seconds 를 보내고 실패하면 null", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = deepgramStt({ apiKey: "k", model: "nova-3", language: "ko" }, (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ access_token: "jwt", expires_in: 120 }), { status: 200 });
    }) as unknown as typeof fetch);
    expect(await ok.grant(120)).toEqual({ token: "jwt", expiresIn: 120 });
    expect(calls[0]!.url).toBe("https://api.deepgram.com/v1/auth/grant");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Token k");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ ttl_seconds: 120 });
    const bad = deepgramStt({ apiKey: "k", model: "nova-3", language: "ko" }, (async () => new Response("no", { status: 403 })) as unknown as typeof fetch);
    expect(await bad.grant(120)).toBeNull();
  });

  it("설정: 키가 없으면 끈다. 모델·언어·단가는 모양이 맞을 때만", () => {
    expect(sttConfigFromEnv({})).toBeNull();
    expect(sttConfigFromEnv({ DEEPGRAM_API_KEY: "k" })).toEqual({ apiKey: "k", model: "nova-3", language: "ko", pricePerMin: 0.0043, maxMinutes: 180 });
    expect(sttConfigFromEnv({ DEEPGRAM_API_KEY: "k", STT_MODEL: "nova-2", STT_LANGUAGE: "ko-KR", AGENT_PRICE_STT_PER_MIN: "0.005" })).toMatchObject({ model: "nova-2", language: "ko-KR", pricePerMin: 0.005 });
    expect(sttConfigFromEnv({ DEEPGRAM_API_KEY: "k", STT_MODEL: "x y" })!.model).toBe("nova-3");
  });
});
