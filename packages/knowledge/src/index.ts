// 견적 에이전트 지식: 가이드라인 원문 조각 + 단추 공개 기준 자료.
// 만드는 법은 scripts/knowledge/README.md. 이 패키지는 읽기만 한다(DB·네트워크 없음).
import guidelines from "../data/guidelines.json" with { type: "json" };
import notes from "../data/notes.json" with { type: "json" };
import reference from "../data/reference.json" with { type: "json" };
import { Bm25Index, type Hit, type Passage } from "./search";

export { tokenize, Bm25Index, type Hit, type Passage } from "./search";
export { expandQuery } from "./glossary";

export interface DocMeta {
  short: string;
  name: string;
  by: string;
  url: string;
  version: string;
  lang: string;
  license: string;
  chunks: number;
}

export const NOTES_DOC = "단추 시험 가이드 정리본";

export const DOCS: readonly DocMeta[] = (guidelines.docs as DocMeta[]).map((d) => ({ ...d }));
const DOC_BY_SHORT = new Map(DOCS.map((d) => [d.short, d]));

const LAW_PASSAGES: Passage[] = [];
const EN_PASSAGES: Passage[] = [];
const LANG = new Map(DOCS.map((d) => [d.short, d.lang]));
for (const p of guidelines.chunks as Passage[]) (LANG.get(p.doc) === "en" ? EN_PASSAGES : LAW_PASSAGES).push(p);
const NOTE_PASSAGES = notes.chunks as Passage[];

/**
 * 조각 배율. 제출 서류 작성방법 별표(CTD 작성 예시 표)는 시험 이름만 빽빽해 거의 모든 질문에 걸리므로 낮춘다.
 * 공식 Q&A와 식약처 민원인 안내서(해설·설명)는 본 가이드라인·고시보다 조금 낮춰 본문이 먼저 나오게 한다. 내용은 그대로 두고 순서만 바꾼다.
 */
const GUIDE_DOCS = new Set(DOCS.filter((d) => d.url.includes("mfds.go.kr/brd/")).map((d) => d.short));

export function passageWeight(p: Passage): number {
  if (/^별표\S*\s.*(작성방법|작성요령)/.test(p.section)) return 0.5;
  // 부칙(시행일·경과조치)과 표지·개정 이력은 빠짐없이 싣되 본문보다 뒤에 나오게 한다
  if (/^(부칙|표지·개정 이력|본문 앞부분)/.test(p.section)) return 0.5;
  if (/ Q&A$/.test(p.doc) || GUIDE_DOCS.has(p.doc)) return 0.8;
  return 1;
}

let indexes: { ko: Bm25Index; en: Bm25Index; notes: Bm25Index } | null = null;
const getIndexes = () =>
  (indexes ??= { ko: new Bm25Index(LAW_PASSAGES, passageWeight), en: new Bm25Index(EN_PASSAGES, passageWeight), notes: new Bm25Index(NOTE_PASSAGES) });

/** 정리본 글에 나온 ICH 문서 이름(예: "ICH S2(R1)" → "ICH S2"). */
function docsNamedIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/ICH ([MSQ]\d{1,2}[AB]?)/g)) out.add(`ICH ${m[1]}`);
  return out;
}

export interface Source {
  n: number;
  doc: string;
  name: string;
  section: string;
  url: string | null;
  version: string;
}

export interface Retrieved {
  hits: Hit[];
  sources: Source[];
}

/** 이 점수보다 낮은 조각은 근거로 넘기지 않는다(엉뚱한 근거로 답하지 않게). */
export const MIN_SCORE = 6;

/**
 * 질문으로 근거 조각을 찾는다. 한국어 고시·법령과 영어 ICH 원문을 따로 찾은 뒤 번갈아 고른다
 * (한 언어가 낱말 수 차이로 다른 언어를 덮지 않게). 정리본이 가리킨 ICH 문서는 영어 검색에서 높게 본다.
 * 결과: 원문 조각 최대 limit-2개 + 정리본 2개.
 */
export function retrieve(query: string, opts: { limit?: number } = {}): Retrieved {
  const limit = opts.limit ?? 6;
  const ix = getIndexes();
  const summary = ix.notes.search(query, { limit: 2, perDoc: 2 }).filter((h) => h.score >= MIN_SCORE);
  const pointed = docsNamedIn(summary.map((h) => h.text).join("\n"));
  const ko = ix.ko.search(query, { limit: limit, perDoc: 2 }).filter((h) => h.score >= MIN_SCORE);
  const en = ix.en.search(query, { limit: limit, perDoc: 2, english: true, boost: pointed }).filter((h) => h.score >= MIN_SCORE);
  const original: Hit[] = [];
  for (let i = 0; original.length < limit - 2 && (i < ko.length || i < en.length); i++) {
    if (en[i]) original.push(en[i]!);
    if (ko[i] && original.length < limit - 2) original.push(ko[i]!);
  }
  const hits = [...original, ...summary].slice(0, limit);
  const sources = hits.map((h, i) => {
    const d = DOC_BY_SHORT.get(h.doc);
    return { n: i + 1, doc: h.doc, name: d?.name ?? h.doc, section: h.section, url: d?.url ?? null, version: d?.version ?? "" };
  });
  return { hits, sources };
}

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);

/** 모델에 붙이는 근거 블록. 답에는 "(근거: 문서 이름 조항)"으로 인용하게 한다. */
export function contextBlock(r: Retrieved, perChars = 1100): string {
  if (!r.hits.length) return "<참고자료>\n찾은 원문 없음\n</참고자료>";
  const parts = r.hits.map((h, i) => {
    const s = r.sources[i]!;
    const kind = h.doc === NOTES_DOC ? "정리본" : `원문${s.version ? `, ${s.version}` : ""}`;
    return `<조각 문서="${s.doc}" 조항="${s.section}" 종류="${kind}">\n${clip(h.text, perChars)}\n</조각>`;
  });
  return `<참고자료>\n${parts.join("\n")}\n</참고자료>`;
}

/** 답 글이 문서 이름으로 인용한 원문 출처만 돌려준다(문서마다 하나). 정리본은 링크가 없어 뺀다. */
export function citedSources(text: string, sources: readonly Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (s.doc === NOTES_DOC || seen.has(s.doc) || !text.includes(s.doc)) return false;
    seen.add(s.doc);
    return true;
  });
}

// ---------- 단추 공개 기준 자료 ----------

type Ref = typeof reference;

export interface PackageItem {
  category: string;
  item: string;
  method?: string;
  note?: string;
}
export interface Package {
  key: string;
  name: string;
  desc: string;
  basis?: string;
  review?: string[];
  items: PackageItem[];
}
export const REFERENCE: Ref = reference;

const list = (xs: readonly string[]) => xs.filter((x) => x !== "기타").join(", ");

/** 요청서 항목 체계·시험 묶음·효력 영역을 시스템 프롬프트용 글로 만든다. 고정 글이라 캐시가 맞는다. */
export function referenceBlock(): string {
  const cats = reference.categories
    .map((c) => {
      const lines = c.fields
        .filter((f) => f.options.length)
        .map((f) => `  - ${f.label}: ${list(f.options)}`);
      return `- ${c.name}\n${lines.join("\n")}`;
    })
    .join("\n");
  const common = reference.common
    .flatMap((q) => q.fields.filter((f) => f.options.length).map((f) => `- ${q.question.replace(/\?$/, "")} (${f.label}): ${list(f.options)}`))
    .join("\n");
  const pkgs = (reference.packages as Package[])
    .map((p) => {
      const items = p.items
        .map((it) => `  - ${it.category} / ${it.item}${it.method ? ` · ${it.method}` : ""}${it.note ? ` (${it.note})` : ""}`)
        .join("\n");
      const review = (p.review ?? []).map((r) => `  ! ${r}`).join("\n");
      return `- ${p.name}: ${p.desc}\n  근거: ${p.basis ?? "확인 필요"}\n${items}${review ? `\n${review}` : ""}`;
    })
    .join("\n");
  const eff = reference.efficacy.areas.map((a) => `- ${a.area}: ${a.models.join(", ")}`).join("\n");
  return `<요청서 항목 체계>
분야별 입력 칸과 선택지다. 시험 이름은 이 이름을 그대로 쓴다.
${cats}
공통 질문:
${common}
</요청서 항목 체계>

<시험 묶음>
개발 분야별로 흔히 함께 맡기는 시험 목록이다. 정답이 아니라 출발점 초안이다. 쓸 때는 근거를 함께 말하고, "!" 표시는 확인이 필요하다고 함께 알린다.
${pkgs}
</시험 묶음>

<효력시험 질환 영역>
${reference.efficacy.note}
${eff}
</효력시험 질환 영역>`;
}

export { checkAnswer, issueNote, numbersIn, type AnswerIssue } from "./check";
