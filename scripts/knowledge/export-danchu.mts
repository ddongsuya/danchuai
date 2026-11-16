/**
 * 단추(danchu) 저장소의 공개 기준 자료를 견적 에이전트 지식 파일로 뽑는다.
 * 읽는 것: lib/guideline-library.ts, lib/rfq-schema.ts, lib/presets.ts, lib/efficacy.ts, lib/other-areas.ts
 * 읽지 않는 것: 단추 DB, 기관 카탈로그·단가, 회원·요청 자료.
 *
 * 실행: DANCHU_DIR=../danchu npx tsx --tsconfig ../danchu/tsconfig.json scripts/knowledge/export-danchu.mts
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const dir = resolve(process.env.DANCHU_DIR ?? "../danchu");
const out = resolve(import.meta.dirname, "../../packages/knowledge/data");
mkdirSync(out, { recursive: true });
const commit = execSync("git rev-parse HEAD", { cwd: dir }).toString().trim();
const load = (f: string) => import(pathToFileURL(join(dir, "lib", f)).href);

const lib = await load("guideline-library.ts");
const schema = await load("rfq-schema.ts");
const presets = await load("presets.ts");
const eff = await load("efficacy.ts");
const other = await load("other-areas.ts");

// 연락처 입력 칸 정의(CONTACT)·동의 문구 버전은 에이전트에 필요 없어 뺀다.
const DROP = new Set(["CONTACT", "CONSENT_VERSION", "TOTAL_STEPS"]);
const pick = (m: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(m).filter(([k, v]) => typeof v !== "function" && !DROP.has(k)));

const data = {
  source: { repo: "ddongsuya/danchu", commit, exportedAt: new Date().toISOString().slice(0, 10) },
  library: { PRODUCTS: lib.PRODUCTS, TOPICS: lib.TOPICS, LIBRARY: lib.LIBRARY },
  schema: pick(schema),
  presets: pick(presets),
  efficacy: pick(eff),
  otherAreas: pick(other),
};
writeFileSync(join(out, "danchu-export.raw.json"), JSON.stringify(data, null, 1));
console.log("ok", commit, Object.keys(data.schema), Object.keys(data.presets), Object.keys(data.efficacy));
