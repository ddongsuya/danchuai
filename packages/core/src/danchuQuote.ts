// 단추 기관 견적(회신) 모델. 말로 맡기는 견적 2단계(2026-11-18).
// 단추 /api/quote/[token] 과 같은 구조를 쓴다: 항목 {seq, avail, amount, weeks, reason, design...} + 공통 조건 + 일정 단계 + 전달 사항.
// 금액은 부가세 별도 원 단위 숫자 문자열이다(단추 비교표와 같은 기준). 레거시 amountBlock(부가세 10% 포함)은 쓰지 않는다.
// 금액은 코드가 정한다: 단추가 기관 시험 목록 단가로 계산해 준 값, 또는 담당자가 확인 카드에서 넣은 값. AI 제안에는 금액 칸이 없다.
import { filterSentences } from "./guard";

export type DanchuAvail = "" | "가능" | "조건부 가능" | "불가";
export const DANCHU_AVAILS: readonly DanchuAvail[] = ["가능", "조건부 가능", "불가"];

/** 단추 회신 항목. 단추가 준 나머지 칸(design·unit·checks 등)은 그대로 보존해 다시 보낸다 */
export interface DanchuReplyItem {
  seq: number;
  avail: DanchuAvail;
  amount: string;
  weeks: string;
  reason?: string;
  source?: string;
  [key: string]: unknown;
}

export interface DanchuReplyCommon {
  validUntil: string;
  startDate: string;
  payTerms: string;
  substanceQty: string;
  reportLang: string;
  includes: string[];
}

export interface DanchuScheduleStep {
  seq: number;
  name: string;
  weeks: string;
  after: number[];
}

export interface DanchuQuoteRow {
  seq: number;
  category: string;
  name: string;
  cond: string;
}

/** 단추 /api/agent/requests/[no]/quote 응답(에이전트 서버가 그대로 전달). 의뢰자 신원 없음 */
export interface DanchuQuoteBrief {
  no: string;
  state: "not_joined" | "open" | "locked" | "closed" | "declined" | "expired";
  closedReason: string | null;
  request: {
    full: boolean;
    substance: string;
    categories: string[];
    overview: [string, string][];
    rows: DanchuQuoteRow[];
    common: [string, string][];
    situation: string[];
    ask: string[];
    replyBy: string;
    authorities: string[];
    translation: boolean;
    files: string[];
  };
  draft: {
    status: "draft" | "submitted";
    prefilled: boolean;
    items: DanchuReplyItem[];
    note: string;
    common: DanchuReplyCommon;
    steps: DanchuScheduleStep[];
    pdfName: string;
  } | null;
}

/** 대화가 들고 있는 견적 초안. 받은 요청 요약과 함께 저장한다(턴마다 단추를 다시 부르지 않는다) */
export interface DanchuQuoteDraft {
  no: string;
  request: Pick<DanchuQuoteBrief["request"], "substance" | "categories" | "overview" | "common" | "situation" | "ask" | "replyBy">;
  rows: DanchuQuoteRow[];
  items: DanchuReplyItem[];
  common: DanchuReplyCommon;
  steps: DanchuScheduleStep[];
  note: string;
  /** 단추가 금액을 준 항목. 이 금액은 AI·카드에서 바꾸지 않는다 */
  priced: number[];
  version: number;
  /** 단추에 제출한 판(승인 카드 → 단추 응답 200). 제출 전이면 null. 제출 뒤 고치면 version 이 더 크다 */
  submittedVersion: number | null;
}

/** 단추에 제출한 판이 지금 판인가 */
export const quoteSubmittedNow = (d: Pick<DanchuQuoteDraft, "version" | "submittedVersion">) => d.submittedVersion === d.version;

/** AI 도구(update_quote)가 바꿀 수 있는 칸. 금액은 없다 */
export interface DanchuQuotePatch {
  items?: { seq: number; avail?: DanchuAvail; weeks?: string | null; reason?: string | null }[];
  common?: Partial<Pick<DanchuReplyCommon, "startDate" | "validUntil" | "payTerms" | "substanceQty" | "reportLang">>;
  note?: string | null;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DIGITS = /^\d{1,13}$/;
const WEEKS = /^\d{1,3}$/;
export const QUOTE_REPORT_LANGS = ["국문", "영문", "국문 + 영문 번역", "일문"] as const;
export const EMPTY_REPLY_COMMON: DanchuReplyCommon = { validUntil: "", startDate: "", payTerms: "", substanceQty: "", reportLang: "", includes: [] };

/** 글 칸: 금액·연락처·순위 문장은 뺀다(guard). 남는 글이 없으면 빈 문자열 */
function cleanText(v: string, max: number): string {
  return filterSentences(v.slice(0, max * 2)).text.slice(0, max);
}

/** 단추 응답으로 대화 초안을 만든다. 요청서 항목 순서대로, 초안에 없는 항목은 빈 칸으로 */
export function quoteDraftFromBrief(b: DanchuQuoteBrief): DanchuQuoteDraft {
  const rows = b.request.rows.map(({ seq, category, name, cond }) => ({ seq, category, name, cond }));
  const given = new Map((b.draft?.items ?? []).map((it) => [it.seq, it]));
  const items: DanchuReplyItem[] = rows.map((r) => {
    const it = given.get(r.seq);
    if (!it) return { seq: r.seq, avail: "", amount: "", weeks: "" };
    // 단추 저장값에 null 이 섞여 와도 단추가 다시 받는 모양(문자열)으로 맞춘다
    const { reason, ...rest } = it;
    return {
      ...rest,
      avail: DANCHU_AVAILS.includes(it.avail) ? it.avail : "",
      amount: DIGITS.test(it.amount ?? "") ? it.amount : "",
      weeks: WEEKS.test(it.weeks ?? "") ? it.weeks : "",
      ...(typeof reason === "string" ? { reason } : {}),
    };
  });
  const { substance, categories, overview, common, situation, ask, replyBy } = b.request;
  return {
    no: b.no,
    request: { substance, categories, overview, common, situation, ask, replyBy },
    rows,
    items,
    common: { ...EMPTY_REPLY_COMMON, ...(b.draft?.common ?? {}) },
    steps: b.draft?.steps ?? [],
    note: b.draft?.note ?? "",
    priced: items.filter((it) => DIGITS.test(it.amount) && Number(it.amount) > 0).map((it) => it.seq),
    version: 1,
    submittedVersion: b.draft?.status === "submitted" ? 1 : null,
  };
}

/** AI 제안 반영. 없는 항목·틀린 값은 버린다. 금액은 손대지 않는다. 바뀐 것이 있으면 판을 올린다 */
export function applyQuotePatch(d: DanchuQuoteDraft, p: DanchuQuotePatch): { draft: DanchuQuoteDraft; changed: number } {
  let changed = 0;
  const items = d.items.map((it) => ({ ...it }));
  const bySeq = new Map(items.map((it) => [it.seq, it]));
  for (const u of p.items ?? []) {
    const it = bySeq.get(u.seq);
    if (!it) continue;
    if (u.avail !== undefined && DANCHU_AVAILS.includes(u.avail) && it.avail !== u.avail) {
      it.avail = u.avail;
      changed++;
    }
    if (u.weeks !== undefined) {
      const w = u.weeks === null ? "" : String(u.weeks).trim();
      if ((w === "" || WEEKS.test(w)) && it.weeks !== w) {
        it.weeks = w;
        changed++;
      }
    }
    if (u.reason !== undefined) {
      const r = u.reason === null ? "" : cleanText(u.reason, 500);
      if ((it.reason ?? "") !== r) {
        it.reason = r;
        changed++;
      }
    }
  }
  const common = { ...d.common };
  const c = p.common ?? {};
  for (const k of ["startDate", "validUntil"] as const) {
    const v = c[k];
    if (typeof v === "string" && (v === "" || YMD.test(v)) && common[k] !== v) {
      common[k] = v;
      changed++;
    }
  }
  if (typeof c.payTerms === "string" && common.payTerms !== c.payTerms.slice(0, 60)) {
    common.payTerms = c.payTerms.slice(0, 60);
    changed++;
  }
  if (typeof c.substanceQty === "string") {
    const v = cleanText(c.substanceQty, 120);
    if (common.substanceQty !== v) {
      common.substanceQty = v;
      changed++;
    }
  }
  if (typeof c.reportLang === "string" && (c.reportLang === "" || (QUOTE_REPORT_LANGS as readonly string[]).includes(c.reportLang)) && common.reportLang !== c.reportLang) {
    common.reportLang = c.reportLang;
    changed++;
  }
  let note = d.note;
  if (p.note !== undefined) {
    const v = p.note === null ? "" : cleanText(p.note, 2000);
    if (v !== note) {
      note = v;
      changed++;
    }
  }
  return { draft: changed ? { ...d, items, common, note, version: d.version + 1 } : d, changed };
}

/** 담당자가 카드에서 넣은 금액 → 원 단위 정수. 숫자가 없으면 null */
export function parseWonInput(input: string | undefined): number | null {
  const s = (input ?? "").replace(/[^0-9]/g, "");
  if (!s || s.length > 13) return null;
  return Number(s);
}

/** 금액이 필요한 항목인가(가능·조건부 가능) */
const needsAmount = (it: DanchuReplyItem) => it.avail === "가능" || it.avail === "조건부 가능";

export type DanchuQuoteBuild =
  | { ok: true; body: { items: DanchuReplyItem[]; note: string; common: DanchuReplyCommon; steps: DanchuScheduleStep[] }; total: number }
  | { ok: false; missingAmount: number[]; missingAvail: number[]; missingStart: boolean };

/**
 * 단추에 보낼 회신 본문(quote_draft·quote_submit 공통). 금액: 단추가 준 항목은 그 값, 나머지는 담당자 입력(manual[seq]).
 * 불가 항목은 금액을 비운다. 합계는 부가세 별도(단추 비교표와 같은 기준).
 * 제출(forSubmit)은 모든 항목의 가능 여부, 필요한 금액, 착수 가능일이 있어야 한다. 임시 저장은 빈 칸을 허용한다.
 */
export function buildQuoteBody(d: DanchuQuoteDraft, manual: Readonly<Record<number, string>>, forSubmit: boolean): DanchuQuoteBuild {
  const priced = new Set(d.priced);
  const missingAmount: number[] = [];
  const missingAvail: number[] = [];
  let total = 0;
  const items = d.items.map((it) => {
    if (!it.avail) missingAvail.push(it.seq);
    let amount = "";
    if (needsAmount(it)) {
      const n = priced.has(it.seq) ? Number(it.amount) : parseWonInput(manual[it.seq]);
      if (n && n > 0) {
        amount = String(n);
        total += n;
      } else missingAmount.push(it.seq);
    }
    return { ...it, amount };
  });
  const missingStart = !YMD.test(d.common.startDate);
  if (forSubmit && (missingAmount.length || missingAvail.length || missingStart)) return { ok: false, missingAmount, missingAvail, missingStart };
  return { ok: true, body: { items, note: d.note, common: d.common, steps: d.steps }, total };
}

/** 모델에 붙이는 받은 요청·견적 초안. 금액 숫자는 넣지 않는다(있음/직접 입력만) */
export function quoteContext(d: DanchuQuoteDraft): string {
  const name = new Map(d.rows.map((r) => [r.seq, r]));
  const priced = new Set(d.priced);
  const r = d.request;
  return [
    "<받은 요청>",
    `요청 번호: ${d.no}`,
    `시험물질: ${r.substance || "(참여 전 비공개)"}`,
    `분야: ${r.categories.join(", ") || "-"}`,
    ...r.overview.map(([k, v]) => `${k}: ${v}`),
    "공통 조건:",
    ...(r.common.length ? r.common.map(([k, v]) => `- ${k}: ${v}`) : ["- (없음)"]),
    ...(r.situation.length ? ["의뢰자 상황:", ...r.situation.map((s) => `- ${s}`)] : []),
    ...(r.ask.length ? ["회신에서 설명을 바라는 점:", ...r.ask.map((s) => `- ${s}`)] : []),
    "</받은 요청>",
    "<견적 초안>",
    ...d.items.map((it) => {
      const row = name.get(it.seq);
      const amount = !needsAmount(it) ? "금액 없음" : priced.has(it.seq) ? "단추 금액 있음" : "금액 직접 입력 필요";
      return `${it.seq}. ${row?.name ?? ""}${row?.cond ? ` (${row.cond})` : ""} | 가능 여부: ${it.avail || "미정"} | 기간: ${it.weeks ? `${it.weeks}주` : "미정"} | ${amount}${it.reason ? ` | 사유: ${it.reason}` : ""}`;
    }),
    `착수 가능일: ${d.common.startDate || "미정"} | 견적 유효기간: ${d.common.validUntil || "미정"} | 결제 조건: ${d.common.payTerms || "미정"} | 보고서 언어: ${d.common.reportLang || "미정"}`,
    `전달 사항: ${d.note || "(없음)"}`,
    d.submittedVersion == null ? "상태: 제출 전" : quoteSubmittedNow(d) ? "상태: 단추에 제출됨(비교표가 열리기 전까지 고칠 수 있음)" : "상태: 제출 뒤 고침(다시 제출해야 반영)",
    "</견적 초안>",
  ].join("\n");
}
