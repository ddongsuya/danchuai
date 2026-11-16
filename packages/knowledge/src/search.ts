// 조각 검색: BM25. 한글은 두 글자 묶음, 영문·숫자는 단어 단위로 자른다.
// 질문은 한국어인데 ICH 원문은 영어라서, 용어집(glossary)으로 영어 검색어를 함께 붙인다.
import { expandQuery, TOPIC_DOCS } from "./glossary";

export interface Passage {
  id: string;
  doc: string;
  section: string;
  text: string;
}

export interface Hit extends Passage {
  score: number;
}

const STOP = new Set([
  "the", "of", "and", "or", "to", "in", "for", "a", "an", "be", "is", "are", "on", "with", "by", "as", "at", "that", "this",
  "it", "from", "should", "can", "may", "not", "which", "these", "such", "other", "also", "if", "when", "than", "been", "has",
  "have", "was", "were", "its", "their", "there", "any", "all", "more", "most", "into", "would", "will", "but", "used", "use",
]);

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** 검색용 토큰. 같은 함수를 조각과 질문에 쓴다. */
export function tokenize(text: string): string[] {
  const t = text.normalize("NFKC").toLowerCase();
  const out: string[] = [];
  for (const m of t.matchAll(/[a-z0-9]+/g)) {
    const w = m[0];
    if (STOP.has(w)) continue;
    if (w.length === 1 && !/\d/.test(w)) continue;
    out.push(stem(w));
  }
  for (const m of t.matchAll(/[가-힣]+/g)) {
    const run = m[0];
    if (run.length === 1) {
      out.push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}

/** "ICH S2", "M3(R2)" 처럼 문서를 콕 집은 질문이면 그 문서를 더 높게 본다. */
export function mentionedDocs(query: string, docs: readonly string[]): Set<string> {
  const q = query.normalize("NFKC").toUpperCase().replace(/\s+/g, " ");
  const hit = new Set<string>();
  for (const m of q.matchAll(/\b([MSQ])\s?(\d{1,2})([AB])?\b/g)) {
    const name = `ICH ${m[1]}${m[2]}${m[3] ?? ""}`;
    if (docs.includes(name)) hit.add(name);
  }
  for (const d of docs) {
    if (!d.startsWith("ICH") && query.includes(d.replace(/^식약처 /, ""))) hit.add(d);
  }
  if (/독성시험기준|독성시험 기준/.test(query)) hit.add("식약처 독성시험기준");
  for (const [re, doc] of TOPIC_DOCS) if (re.test(query) && docs.includes(doc)) hit.add(doc);
  return hit;
}

/** 한글을 뺀 부분(영어 낱말·숫자·문서 번호)만 남긴다. */
export function englishPart(text: string): string {
  return text.replace(/[\uac00-\ud7a3]+/g, " ");
}

export class Bm25Index {
  private readonly tf: Map<string, number>[] = [];
  private readonly len: number[] = [];
  private readonly df = new Map<string, number>();
  private readonly avg: number;
  private readonly docNames: string[];

  constructor(private readonly passages: readonly Passage[]) {
    for (const p of passages) {
      const toks = tokenize(`${p.section}\n${p.section}\n${p.text}`);
      const m = new Map<string, number>();
      for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1);
      for (const t of m.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.tf.push(m);
      this.len.push(toks.length);
    }
    this.avg = this.len.reduce((a, b) => a + b, 0) / Math.max(1, this.len.length);
    this.docNames = [...new Set(passages.map((p) => p.doc))];
  }

  /**
   * english: 영어 원문용 검색. 질문 원문 대신 용어집으로 옮긴 영어 낱말과 문서 이름만 쓴다.
   * boost: 이 문서들의 점수를 높인다(질문이 콕 집은 문서, 정리본이 가리킨 문서).
   */
  search(query: string, opts: { limit?: number; perDoc?: number; english?: boolean; boost?: ReadonlySet<string> } = {}): Hit[] {
    const limit = opts.limit ?? 6;
    const perDoc = opts.perDoc ?? 3;
    const text = opts.english ? englishPart(expandQuery(query)) : expandQuery(query);
    const terms = [...new Set(tokenize(text))];
    if (!terms.length) return [];
    const boost = new Set([...mentionedDocs(query, this.docNames), ...(opts.boost ?? [])]);
    const N = this.passages.length;
    const k1 = 1.2;
    const b = 0.75;
    const scored: { i: number; s: number }[] = [];
    for (let i = 0; i < N; i++) {
      const tf = this.tf[i]!;
      let s = 0;
      for (const t of terms) {
        const f = tf.get(t);
        if (!f) continue;
        const df = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        s += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * this.len[i]!) / this.avg));
      }
      if (s > 0) scored.push({ i, s: boost.has(this.passages[i]!.doc) ? s * 1.6 : s });
    }
    scored.sort((x, y) => y.s - x.s);
    const per = new Map<string, number>();
    const out: Hit[] = [];
    for (const { i, s } of scored) {
      const p = this.passages[i]!;
      const n = per.get(p.doc) ?? 0;
      if (n >= perDoc) continue;
      per.set(p.doc, n + 1);
      out.push({ ...p, score: s });
      if (out.length >= limit) break;
    }
    return out;
  }
}
