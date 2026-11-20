// 회의 녹음 전사 (2026-11-20 사용자 결정: 음성 전사 API 도입).
// 녹음 파일은 서버를 거치지 않는다(서버 요청 크기 제한 4.5MB). 서버는 전사 서비스 임시 토큰만 발급하고,
// 앱이 그 토큰으로 녹음을 전사 서비스(Deepgram, 미국)에 바로 보내 글을 받는다. 녹음·전사본은 서버에 남기지 않는다.
// - 기관 담당자만, 국외 이전 동의(/v1/agent/* 앞 requireConsent) 뒤, 녹음마다 "참석자 모두 동의" 확인(attest)이 있어야 발급한다.
// - 비용은 녹음 길이(분) × 분당 단가로 AI 이용량 상한에 더한다(발급할 때). 전사 서비스는 학습 제외(mip_opt_out)로 부른다.
// - 키(DEEPGRAM_API_KEY)가 없으면 404 not_configured. 키 값은 로그·응답에 남기지 않는다.
import { Hono } from "hono";
import { z } from "zod";
import type { Session } from "./auth";
import type { UsageMeter } from "./usage";

export interface SttGrant {
  token: string;
  expiresIn: number;
}

export interface SttProvider {
  readonly name: "deepgram";
  /** 앱이 녹음을 보낼 주소(쿼리 포함) */
  readonly listenUrl: string;
  grant(ttlSeconds: number): Promise<SttGrant | null>;
}

type Env = Record<string, string | undefined>;

/** 전사 설정. 단가 기본값은 2026-11 공개 자료의 Nova-3 녹음 파일 단가(분당 0.0043달러)를 가정했다. 바뀌면 AGENT_PRICE_STT_PER_MIN */
export function sttConfigFromEnv(env: Env): { apiKey: string; model: string; language: string; pricePerMin: number; maxMinutes: number } | null {
  const apiKey = (env.DEEPGRAM_API_KEY ?? "").trim();
  if (!apiKey) return null;
  const n = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  return {
    apiKey,
    model: /^[a-z0-9-]{2,40}$/.test(env.STT_MODEL ?? "") ? env.STT_MODEL! : "nova-3",
    language: /^[a-z]{2}(-[A-Z]{2})?$/.test(env.STT_LANGUAGE ?? "") ? env.STT_LANGUAGE! : "ko",
    pricePerMin: n(env.AGENT_PRICE_STT_PER_MIN, 0.0043),
    maxMinutes: Math.min(600, Math.max(1, Math.round(n(env.STT_MAX_MINUTES, 180)))),
  };
}

/** 녹음 파일 전사 주소: 화자 나누기·문단·문장 부호, 학습 제외 */
export function deepgramListenUrl(model: string, language: string): string {
  const q = new URLSearchParams({ model, language, smart_format: "true", punctuate: "true", diarize: "true", paragraphs: "true", mip_opt_out: "true" });
  return `https://api.deepgram.com/v1/listen?${q.toString()}`;
}

/** Deepgram 임시 토큰(POST /v1/auth/grant, ttl_seconds 1~3600). 실패하면 null */
export function deepgramStt(cfg: { apiKey: string; model: string; language: string }, fetchImpl: typeof fetch = fetch): SttProvider {
  return {
    name: "deepgram",
    listenUrl: deepgramListenUrl(cfg.model, cfg.language),
    async grant(ttlSeconds) {
      try {
        const r = await fetchImpl("https://api.deepgram.com/v1/auth/grant", {
          method: "POST",
          headers: { authorization: `Token ${cfg.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ ttl_seconds: Math.min(3600, Math.max(1, Math.round(ttlSeconds))) }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!r.ok) {
          console.error("stt_grant_failed", r.status);
          return null;
        }
        const j = (await r.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
        return typeof j?.access_token === "string" && j.access_token ? { token: j.access_token, expiresIn: typeof j.expires_in === "number" ? j.expires_in : ttlSeconds } : null;
      } catch (e) {
        console.error("stt_grant_failed", e instanceof Error ? e.name : "unknown");
        return null;
      }
    },
  };
}

/** 앱이 토큰을 받고 업로드를 시작할 때까지의 여유(초). 토큰은 요청을 시작할 때만 맞으면 된다 */
export const STT_TOKEN_TTL = 120;

const TokenBody = z
  .object({
    /** 녹음 길이(분, 올림). 비용과 상한 계산에 쓴다 */
    minutes: z.number().int().min(1).max(600),
    /** 참석자 모두 녹음과 외부 전사에 동의했다는 확인 */
    attest: z.literal(true),
  })
  .strict();

/** POST /v1/agent/transcribe/token — 전사 임시 토큰 */
export function transcribeRoutes(deps: { stt?: SttProvider; pricePerMin?: number; maxMinutes?: number; usage?: UsageMeter }) {
  const app = new Hono<{ Variables: { session: Session } }>();
  app.post("/token", async (c) => {
    const s = c.get("session");
    if (s.role !== "cro") return c.json({ error: "forbidden" }, 403);
    if (!deps.stt) return c.json({ error: "not_configured" }, 404);
    const p = TokenBody.safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json({ error: "bad_request" }, 400);
    if (p.data.minutes > (deps.maxMinutes ?? 180)) return c.json({ error: "too_long" }, 413);
    if (deps.usage && (await deps.usage.over(s))) return c.json({ error: "usage_limit" }, 429);
    const g = await deps.stt.grant(STT_TOKEN_TTL);
    if (!g) return c.json({ error: "stt_unavailable" }, 502);
    const micros = Math.round(p.data.minutes * (deps.pricePerMin ?? 0) * 1e6);
    if (deps.usage && micros > 0) await deps.usage.recordCost(s, micros).catch((e) => console.error("usage_record_failed", e instanceof Error ? e.name : "unknown"));
    return c.json({ provider: deps.stt.name, token: g.token, expiresIn: g.expiresIn, url: deps.stt.listenUrl });
  });
  return app;
}
