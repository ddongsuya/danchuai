import { EMPTY_SHEET } from "@danchuai/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { createApp } from "./app";
import { devAuthFromEnv } from "./auth";
import { DanchuRequestDirectory, MemoryConversationRepo, MemoryRequestDirectory } from "./agent/store";
import { PgConversationRepo, PgRequestDirectory } from "./db/conversations";
import { PgOutboundRepo } from "./db/outbound";
import { createPool } from "./db/pool";
import { supabaseAuthFromEnv, supabaseIdentity, supabaseKeyFromEnv } from "./supabaseAuth";
import { PgAccountRepo } from "./db/account";
import { InAppTransport, PgMarketRepo } from "./db/market";
import { PgRunRepo } from "./db/runs";
import { providerFromEnv } from "./providers";
import { MemoryOutboundRepo } from "./repo";
import { danchuApi, danchuBaseFromEnv } from "./danchu";
import { danchuIdentity, MemoryWorkspaceRepo, PgWorkspaceRepo } from "./danchuAuth";
import { PgPurgeRepo, type PurgeRepo } from "./purge";
import { MemoryUsageRepo, PgUsageRepo, usageConfigFromEnv, usageMeter } from "./usage";

type Env = Record<string, string | undefined>;

/** 앱 전체를 환경 변수로 조립한다. 로컬(main.ts)과 Vercel(vercel.ts)이 같이 쓴다. */
export function buildServer(env: Env): Hono {
  // DATABASE_URL이 있으면 Postgres(Supabase) 저장소와 Supabase 로그인, 없으면 메모리 저장소와 개발 토큰.
  const provider = providerFromEnv(env);
  const pool = env.DATABASE_URL ? createPool(env.DATABASE_URL) : null;
  if (env.NODE_ENV === "production" && !pool) throw new Error("운영에서는 DATABASE_URL이 필요해요");
  // AUTH_SOURCE=danchu: 단추 계정으로 로그인(연동 2단계). 그 밖에는 이전 방식(에이전트 전용 Supabase 로그인).
  const danchu = env.AUTH_SOURCE === "danchu" ? (() => {
    const api = danchuApi(danchuBaseFromEnv(env));
    const workspaces = pool ? new PgWorkspaceRepo(pool) : new MemoryWorkspaceRepo();
    const id = danchuIdentity(api, workspaces);
    return { api, workspaces, lookup: id.lookup, resolver: id.resolver };
  })() : null;
  const auth =
    danchu?.resolver ?? (pool && supabaseAuthFromEnv(env, pool)) ?? devAuthFromEnv(env) ?? { resolve: async () => null };

  const supaKey = pool ? supabaseKeyFromEnv(env) : null;

  // 탈퇴·철회 지우기(단추가 서명해 알린다, AGENT_PURGE_SECRET). 메모리 모드는 동의만 철회한다
  const purgeRepo: PurgeRepo | null = pool
    ? new PgPurgeRepo(pool)
    : danchu
      ? { purge: async (userId) => (await danchu.workspaces.revoke(userId), { conversations: 0, drafts: 0 }) }
      : null;
  // AI 이용량 상한(AGENT_PRICE_*, AGENT_CAP_*). 잘못된 값이면 여기서 시작을 멈춘다
  const usage = usageMeter(pool ? new PgUsageRepo(pool) : new MemoryUsageRepo(), usageConfigFromEnv(env));

  // 메모리 모드에서는 기관 화면 확인용 견본 요청 하나를 둔다.
  const memoryRequests = new MemoryRequestDirectory({
    "rat-4w": {
      requesterOrgId: "req-org",
      sentTo: ["cro-a"],
      sheet: {
        ...EMPTY_SHEET,
        testType: "독성",
        substance: "저분자 화합물",
        species: "랫드",
        route: "경구",
        duration: "4주 반복투여, 회복 2주",
        glp: "GLP",
        dueDate: "11월 29일",
      },
    },
  });

  const api = createApp({
    auth,
    outbound: pool ? new PgOutboundRepo(pool) : new MemoryOutboundRepo(),
    // 운영: 앱 안 전달(받은 요청함·회신 목록). 메모리 모드는 전달할 곳이 없어 unknown.
    transport: pool ? new InAppTransport(pool) : { deliver: async () => "unknown" },
    provider,
    conversations: pool ? new PgConversationRepo(pool) : new MemoryConversationRepo(),
    // 단추 연동 모드: 기관 견적 대화는 단추 요청 번호(DC-...)로 열고, 요청서·초안은 단추에서 사용자 토큰으로 읽는다
    requests: danchu
      ? new DanchuRequestDirectory(danchu.api, pool ? new PgRequestDirectory(pool) : memoryRequests)
      : pool
        ? new PgRequestDirectory(pool)
        : memoryRequests,
    identity: supaKey ? supabaseIdentity(supaKey) : undefined,
    accounts: pool && supaKey ? new PgAccountRepo(pool) : undefined,
    market: pool ? new PgMarketRepo(pool) : undefined,
    runs: pool ? new PgRunRepo(pool) : undefined,
    danchu: danchu ?? undefined,
    purge: purgeRepo ? { repo: purgeRepo, secret: env.AGENT_PURGE_SECRET } : undefined,
    usage,
  });

  const origins = (env.CORS_ORIGINS ?? "http://localhost:8081").split(",");
  const app = new Hono();
  app.use("*", secureHeaders());
  app.use("*", cors({ origin: origins, allowHeaders: ["authorization", "content-type"], allowMethods: ["GET", "POST"] }));
  app.route("/", api);
  return app;
}
