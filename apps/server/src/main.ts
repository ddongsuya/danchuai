import { serve } from "@hono/node-server";
import { buildServer } from "./server";

// 로컬 실행. Vercel에서는 src/vercel.ts 가 같은 앱을 쓴다.
const app = buildServer(process.env);
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`server on :${port}`);
