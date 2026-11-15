import { getRequestListener } from "@hono/node-server";
import { buildServer } from "./server";

// Vercel 함수 진입점. 함수 인스턴스마다 앱(과 DB 연결 풀)을 한 번만 만든다.
const app = buildServer(process.env);
export default getRequestListener(app.fetch);
