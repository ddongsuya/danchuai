import { serve } from "@hono/node-server";
import { EMPTY_SHEET } from "@danchuai/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createApp } from "./app";
import { devAuthFromEnv } from "./auth";
import { MemoryConversationRepo, MemoryRequestDirectory } from "./agent/store";
import { PgConversationRepo, PgRequestDirectory } from "./db/conversations";
import { PgOutboundRepo } from "./db/outbound";
import { createPool } from "./db/pool";
import { supabaseAuthFromEnv } from "./supabaseAuth";
import { providerFromEnv } from "./providers";
import { MemoryOutboundRepo } from "./repo";

// DATABASE_URL이 있으면 Postgres(Supabase) 저장소와 Supabase 로그인, 없으면 메모리 저장소와 개발 토큰.
const provider = providerFromEnv(process.env);
const pool = process.env.DATABASE_URL ? createPool(process.env.DATABASE_URL) : null;
if (process.env.NODE_ENV === "production" && !pool) throw new Error("운영에서는 DATABASE_URL이 필요해요");
const auth =
  (pool && supabaseAuthFromEnv(process.env, pool)) ?? devAuthFromEnv(process.env) ?? { resolve: async () => null };

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
  transport: { deliver: async () => "unknown" },
  provider,
  conversations: pool ? new PgConversationRepo(pool) : new MemoryConversationRepo(),
  requests: pool ? new PgRequestDirectory(pool) : memoryRequests,
});

const origins = (process.env.CORS_ORIGINS ?? "http://localhost:8081").split(",");
const app = new Hono();
app.use("*", cors({ origin: origins, allowHeaders: ["authorization", "content-type"], allowMethods: ["GET", "POST"] }));
app.route("/", api);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`server on :${port} store=${pool ? "postgres" : "memory"} provider=${provider ? `${provider.name}/${provider.model}` : "none"}`);
