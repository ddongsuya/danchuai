import { serve } from "@hono/node-server";
import { EMPTY_SHEET } from "@danchuai/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createApp } from "./app";
import { devAuthFromEnv } from "./auth";
import { MemoryConversationRepo, MemoryRequestDirectory } from "./agent/store";
import { providerFromEnv } from "./providers";
import { MemoryOutboundRepo } from "./repo";

// 로컬 실행용. 저장소는 메모리, 인증은 개발 토큰(AUTH_DEV_TOKENS). 운영 구현은 Supabase로 바꾼다.
const auth = devAuthFromEnv(process.env) ?? { resolve: async () => null };
const provider = providerFromEnv(process.env);

// 기관 화면 확인용 견본 요청 하나(실제 요청은 DB에서 읽는다).
const requests = new MemoryRequestDirectory({
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
  outbound: new MemoryOutboundRepo(),
  transport: { deliver: async () => "unknown" },
  provider,
  conversations: new MemoryConversationRepo(),
  requests,
});

const origins = (process.env.CORS_ORIGINS ?? "http://localhost:8081").split(",");
const app = new Hono();
app.use("*", cors({ origin: origins, allowHeaders: ["authorization", "content-type"], allowMethods: ["GET", "POST"] }));
app.route("/", api);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`server on :${port} provider=${provider ? `${provider.name}/${provider.model}` : "none"}`);
