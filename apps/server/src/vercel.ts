import { getRequestListener } from "@hono/node-server";
import { buildServer } from "./server";

// Vercel 함수 진입점. 함수 인스턴스마다 앱(과 DB 연결 풀)을 한 번만 만든다.
// 비밀이 아닌 기본 설정은 여기 두고, 비밀값(DATABASE_URL, 모델 API 키)은 Vercel 환경 변수로만 받는다.
const defaults = {
  SUPABASE_URL: "https://wrqkvydefavmotsupwab.supabase.co",
  CORS_ORIGINS: "https://danchuai-mobile.vercel.app,https://danchuai-web.vercel.app,http://localhost:8081",
};
const app = buildServer({ ...defaults, ...process.env });
export default getRequestListener(app.fetch);
