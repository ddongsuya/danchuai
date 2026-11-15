// Vercel Build Output API(v3)로 서버를 함수 하나로 묶는다. 모든 경로를 그 함수로 보낸다.
// 실행: npm run build:vercel (apps/server 에서). 결과: .vercel/output
import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";

const out = ".vercel/output";
const fn = `${out}/functions/index.func`;
await rm(out, { recursive: true, force: true });
await mkdir(fn, { recursive: true });

await build({
  entryPoints: ["src/vercel.ts"],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // pg가 선택적으로 찾는 네이티브 모듈은 없다.
  external: ["pg-native"],
  // 묶인 CommonJS 의존성(pg 등)이 require를 쓸 수 있게 한다.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "warning",
});

await writeFile(
  `${fn}/.vc-config.json`,
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", supportsResponseStreaming: true, regions: ["hnd1"], maxDuration: 60 }, null, 2),
);
await writeFile(`${fn}/package.json`, JSON.stringify({ type: "module" }));
await writeFile(`${out}/config.json`, JSON.stringify({ version: 3, routes: [{ src: "/(.*)", dest: "/index" }] }, null, 2));
console.log("vercel output ready");
