/**
 * 단추 공개 기준 자료(export-danchu.mts 결과)를 에이전트가 쓰는 모양으로 정리한다.
 * - 요청서 항목 체계: 분야별 입력 칸과 선택지 그대로
 * - 시험 묶음: 출발점 초안. 근거 조항을 붙이고, 원문과 어긋나 고친 곳은 corrections 에 남긴다
 * - 효력시험: 질환 영역과 공개 자료에서 확인된 모델 예시(권하는 모델이 아님)
 * - 정리본: 계정 스킬 nonclinical-guideline 의 참고 문서(단추 시험 가이드에서 생성)를 조각으로 나눈다
 *
 * 실행: SKILL_DIR=<nonclinical-guideline 폴더> npx tsx scripts/knowledge/build-reference.mts
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const data = resolve(import.meta.dirname, "../../packages/knowledge/data");
const raw = JSON.parse(readFileSync(join(data, "danchu-export.raw.json"), "utf8"));

type Field = { id: string; label?: string; options?: string[]; help?: string };
type Item = { category: string; item: string; species?: string[]; requestSpecies?: string[]; route?: string; method?: string; note?: string };
type Pkg = { key: string; name: string; audience: string; desc: string; items: Item[] };

const fields = (fs: Field[]) => fs.map((f) => ({ id: f.id, label: f.label ?? f.id, options: f.options ?? [] }));

const categories = (raw.schema.CATS as string[]).map((name) => ({ name, fields: fields(raw.schema.DETAILS[name] ?? []) }));
const common = [
  ...(raw.schema.WIZ as { q: string; fields: Field[] }[]).map((w) => ({ question: w.q, fields: fields(w.fields) })),
  ...(raw.schema.STEP2 as { title: string; fields: Field[] }[]).map((s) => ({ question: s.title, fields: fields(s.fields) })),
];

// ---- 시험 묶음: 근거와 고친 곳 ----
const skillDir = process.env.SKILL_DIR;
const basis = new Map<string, string>();
if (skillDir) {
  const md = readFileSync(join(skillDir, "references", "03-패키지-근거와-프리셋.md"), "utf8");
  for (const block of md.split(/\n## /).slice(1)) {
    const name = block.split("\n", 1)[0]!.trim();
    const m = block.match(/^근거: (.+)$/m);
    if (m) basis.set(name, m[1]!.trim());
  }
}

// 정리본에 근거 줄이 없는 묶음은 자료실 문서 이름으로 근거를 단다.
const EXTRA_BASIS: Record<string, string> = {
  hfs: "식약처 건강기능식품 인정 규정 · 식약처 「의약품등의 독성시험기준」",
  cosmetic: "식약처 화장품 원료 심사 규정 · OECD TG(동물대체시험)",
  md_basic: "식약처 의료기기 생물학적 안전 기준(ISO 10993)",
  md_implant: "식약처 의료기기 생물학적 안전 기준(ISO 10993)",
  chem_reach: "화평법 시행규칙 · OECD TG",
};
// ICH S8 원문 1.3(적용 범위): 바이오의약품(ICH S6 대상)에는 적용하지 않는다.
const BASIS_FIX: Record<string, (s: string) => string> = { ind_bio: (s) => s.replace(/ · ICH S8 면역독성/, "") };

const corrections: { package: string; item: string; before: string; after: string; why: string }[] = [];
const fix = (pkg: Pkg, match: (it: Item) => boolean, patch: Partial<Item> & { review?: string }, why: string) => {
  for (const it of pkg.items) {
    if (!match(it)) continue;
    const before = JSON.stringify({ method: it.method, species: it.species, note: it.note });
    Object.assign(it, patch);
    corrections.push({ package: pkg.name, item: it.item, before, after: JSON.stringify(patch), why });
  }
};

const packages = (raw.presets.PRESETS as Pkg[]).map((p) => structuredClone(p) as Pkg & { basis?: string; review?: string[] });
for (const p of packages) {
  const b = basis.get(p.name) ?? EXTRA_BASIS[p.key];
  p.basis = b && BASIS_FIX[p.key] ? BASIS_FIX[p.key]!(b) : b;
  p.review = [];
  if (p.key === "chem_reach") {
    fix(p, (it) => it.route === "경피·피부" && /TG 420/.test(it.method ?? ""), { method: "OECD TG 402 급성경피독성", note: undefined },
      "OECD TG 420은 경구 고정용량법이에요. 급성경피독성은 TG 402예요.");
    p.review.push("톤수별로 내야 하는 항목은 화평법 시행규칙 별표로 확인이 필요해요. 1~10톤에 필요 없는 항목이 섞여 있을 수 있어요.");
  }
  if (p.key === "ind_bio") {
    fix(p, (it) => /ICH S8/.test(it.method ?? ""), { method: "ICH S6(R1) 면역독성 평가(사례별)" },
      "ICH S8 1.3(적용 범위): 바이오의약품(ICH S6 대상)에는 적용하지 않아요. 바이오의약품 면역독성은 ICH S6(R1)에 따라 사례별로 정해요.");
    fix(p, (it) => it.category === "일반독성" && (it.species ?? []).some((s) => /랫드/.test(s)), { note: "약리학적 관련 종인지 먼저 확인(결합·활성 자료). 관련 종이 아니면 이 항목은 빼요" },
      "ICH S6(R1)은 약리학적으로 관련 있는 종에서만 평가해요. 랫드가 관련 종이라는 보장이 없어요.");
    fix(p, (it) => it.category === "국소내성", { note: "반복투여독성 시험에 통합해 평가할 수 있어요" },
      "ICH S6(R1) 4.9: 단회·반복투여독성 시험에서 평가하면 별도 국소내성 시험이 필요 없을 수 있어요.");
  }
}

const efficacy = {
  category: raw.efficacy.EFFICACY_CAT,
  areas: (raw.efficacy.AREAS as [string, string[]][]).map(([area, models]) => ({ area, models })),
  costParts: raw.efficacy.COST_PARTS,
  note: "모델은 국내 기관의 공개 자료에서 확인된 예시예요. 권하는 모델이 아니에요.",
};

// ---- 정리본 조각 ----
const notes: { id: string; doc: string; section: string; text: string }[] = [];
if (skillDir && existsSync(join(skillDir, "references"))) {
  for (const f of readdirSync(join(skillDir, "references")).sort()) {
    if (!f.endsWith(".md") || f.startsWith("05-")) continue; // 05는 화면 질문 흐름이라 뺀다
    const md = readFileSync(join(skillDir, "references", f), "utf8").replace(/^> 생성:.*\n/m, "");
    let path: string[] = [];
    let buf: string[] = [];
    let n = 0;
    const flush = () => {
      const text = buf.join("\n").trim();
      buf = [];
      if (text.length < 40) return;
      // 표는 머리줄을 조각마다 붙여 둔다
      const lines = text.split("\n");
      const head = lines.filter((l, i) => l.startsWith("|") && i < lines.length - 1 && /^\|[-| ]+\|$/.test(lines[i + 1] ?? "")).slice(0, 1);
      let part: string[] = [];
      const out = () => {
        const t = part.join("\n").trim();
        if (t.length >= 40) notes.push({ id: `note-${f.slice(0, 2)}-${n++}`, doc: "단추 시험 가이드 정리본", section: path.join(" > ").slice(0, 80), text: t });
        part = head.length && part.length ? [...head, lines.find((l) => /^\|[-| ]+\|$/.test(l)) ?? ""] : [];
      };
      for (const l of lines) {
        part.push(l);
        if (part.join("\n").length > 1400) out();
      }
      out();
    };
    for (const line of md.split("\n")) {
      const h = line.match(/^(#{1,3}) (.+)$/);
      if (h) {
        flush();
        const level = h[1]!.length;
        path = [...path.slice(0, level - 1), h[2]!.trim()];
        continue;
      }
      buf.push(line);
    }
    flush();
  }
}

const out = {
  source: raw.source,
  categories,
  common,
  packages,
  corrections,
  efficacy,
  otherAreas: raw.otherAreas.OTHER_AREAS,
  library: raw.library,
};
writeFileSync(join(data, "reference.json"), JSON.stringify(out));
writeFileSync(join(data, "notes.json"), JSON.stringify({ source: "nonclinical-guideline 계정 스킬 참고 문서(단추 시험 가이드에서 생성)", chunks: notes }));
console.log("reference", categories.length, "분야", packages.length, "묶음", corrections.length, "고침", notes.length, "정리본 조각");
