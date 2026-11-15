import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { providerFromEnv } from "./providers";
import { MemoryOutboundRepo } from "./repo";

// 로컬 실행용. 인증·저장소·전달은 구현 순서 3~4단계에서 실제 구현으로 바꾼다.
const app = createApp({
  auth: { resolve: async () => null },
  outbound: new MemoryOutboundRepo(),
  transport: { deliver: async () => "unknown" },
  provider: providerFromEnv(process.env),
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`server on :${port}`);
