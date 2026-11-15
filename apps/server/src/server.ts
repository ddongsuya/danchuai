import { EMPTY_SHEET } from "@danchuai/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { createApp } from "./app";
import { devAuthFromEnv } from "./auth";
import { MemoryConversationRepo, MemoryRequestDirectory } from "./agent/store";
import { PgConversationRepo, PgRequestDirectory } from "./db/conversations";
import { PgOutboundRepo } from "./db/outbound";
import { createPool } from "./db/pool";
import { supabaseAuthFromEnv, supabaseIdentity, supabaseKeyFromEnv } from "./supabaseAuth";
import { PgAccountRepo } from "./db/account";
import { InAppTransport, PgMarketRepo } from "./db/market";
import { providerFromEnv } from "./providers";
import { MemoryOutboundRepo } from "./repo";

type Env = Record<string, string | undefined>;

/** 앱 전체를 환경 변수로 조립한다. 로컬(main.ts)과 Vercel(vercel.ts)이 같이 쓴다. */
export function buildServer(env: Env): Hono {
  // DATABASE_URL이 있으면 Postgres(Supabase) 저장소와 Supabase 로그인, 없으면 메모리 저장소와 개발 토큰.
  const provider = providerFromEnv(env);
  const pool = env.DATABASE_URL ? createPool(env.DATABASE_URL) : null;
  if (env.NODE_ENV === "production" && !pool) throw new Error("운영에서는 DATABASE_URL이 필요해요");
  const auth =
    (pool && supabaseAuthFromEnv(env, pool)) ?? devAuthFromEnv(env) ?? { resolve: async () => null };

  const supaKey = pool ? supabaseKeyFromEnv(env) : null;

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
    requests: pool ? new PgRequestDirectory(pool) : memoryRequests,
    identity: supaKey ? supabaseIdentity(supaKey) : undefined,
    accounts: pool && supaKey ? new PgAccountRepo(pool) : undefined,
    market: pool ? new PgMarketRepo(pool) : undefined,
  });

  const origins = (env.CORS_ORIGINS ?? "http://localhost:8081").split(",");
  const app = new Hono();
  app.use("*", secureHeaders());
  app.use("*", cors({ origin: origins, allowHeaders: ["authorization", "content-type"], allowMethods: ["GET", "POST"] }));
  app.route("/", api);
  return app;
}
