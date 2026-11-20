// 기관 비서 (에이전트 액션 등록부 1~3단계, 2026-11-19).
// 단추 액션 목록(GET /api/agent/actions)으로 비서 도구를 만든다. 단추에 액션이 늘면 비서도 그대로 쓴다.
// - 비서 도구는 단추가 tool 로 표시한 바로 실행(auto) 액션과 찾기(read). 브리핑·보고 읽기는 턴마다 맥락으로 붙인다(한 턴은 응답 한 번).
//   찾기 결과는 모델에 넣지 않는다. 앱이 찾기 카드에서 단추를 직접 읽는다(과거 견적 금액도 단추 계산값만 보인다).
// - 승인이 필요한 액션(confirm)·사람만(human)은 도구로 주지 않는다. 확인 카드(보내기 장부)로만 나간다.
// - 다른 행을 가리키는 칸(x-ref)은 모델에 id 대신 짧은 번호(D3·T2…)로 보이고, 실행할 때 id 로 바꾼다.
//   번호는 그 턴에 읽은 브리핑에서만 나온다. 목록에 없는 번호는 실행하지 않는다.
// - 맥락에 금액·이메일·전화는 넣지 않는다(단추 브리핑에 없다). 보고 숫자는 코드가 계산한 개수·비율만.
import { randomUUID } from "node:crypto";
import { FORBIDDEN_TOOL_PREFIXES, type AgentToolSpec } from "@danchuai/core";
import type { DanchuApi, DanchuCatalog, DanchuCatalogAction } from "./danchu";
import type { AssistRun, RunRepo } from "./runs";

/* ── 단추가 주는 브리핑·보고 모양 (단추 lib/agent-brief.ts) ── */
export interface AssistBrief {
  date: string;
  today: { kind: "event" | "task" | "danchu"; time: string | null; title: string; sub: string; done: boolean; overdue: boolean; badge: string; taskId: string | null; eventId: string | null }[];
  need: { dealId: string; title: string; company: string | null; reason: string; tone: "warn" | "due"; suggest: string; danchuNo: string | null }[];
  deals: { id: string; title: string; company: string | null; stage: string; stageLabel: string; next: string | null; mine: boolean; danchuNo: string | null }[];
  tasks: { id: string; title: string; due: string | null; assignee: string | null; dealId: string | null }[];
  events: { id: string; title: string; date: string; time: string | null; dealId: string | null }[];
  companies: { id: string; name: string }[];
  contacts: { id: string; name: string; title: string; companyId: string }[];
  members: { id: string; name: string; me: boolean }[];
}
export interface AssistReport {
  from: string;
  to: string;
  created: number;
  won: number;
  lost: number;
  winRate: number | null;
  wonSum: number;
  reasons: { reason: string; count: number }[];
  funnel: { stage: string; label: string; count: number }[];
  activity: { member: string; meeting: number; call: number; email: number; memo: number; tasks: number }[];
}

/* ── 목록 기억 (기관마다 10분) ── */
export class CatalogCache {
  private readonly byOrg = new Map<string, { at: number; catalog: DanchuCatalog }>();
  constructor(
    private readonly api: Pick<DanchuApi, "catalog">,
    private readonly ttlMs = 10 * 60_000,
    private readonly now = () => Date.now(),
  ) {}
  async get(token: string, orgId: string): Promise<DanchuCatalog | null> {
    const hit = this.byOrg.get(orgId);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.catalog;
    const r = await this.api.catalog(token);
    if (!r.ok || !Array.isArray(r.data?.actions)) return hit?.catalog ?? null;
    this.byOrg.set(orgId, { at: this.now(), catalog: r.data });
    return r.data;
  }
}

/* ── 번호 ── */
type RefKind = "deal" | "task" | "event" | "contact" | "company" | "member";
const PREFIX: Record<RefKind, string> = { deal: "D", task: "T", event: "E", contact: "P", company: "C", member: "M" };
const KIND_OF: Record<string, RefKind> = { D: "deal", T: "task", E: "event", P: "contact", C: "company", M: "member" };
const REF_LABEL: Record<RefKind, string> = { deal: "안건", task: "할 일", event: "일정", contact: "담당자", company: "고객사", member: "우리 기관 담당자" };

export interface RefBook {
  /** "D3" → id */
  ids: Map<string, string>;
  /** id → "D3" */
  refs: Map<string, string>;
}

export function refBook(b: AssistBrief): RefBook {
  const ids = new Map<string, string>();
  const refs = new Map<string, string>();
  const add = (kind: RefKind, list: { id: string }[]) =>
    list.forEach((x, i) => {
      const r = `${PREFIX[kind]}${i + 1}`;
      ids.set(r, x.id);
      refs.set(x.id, r);
    });
  add("deal", b.deals);
  add("task", b.tasks);
  add("event", b.events);
  add("company", b.companies);
  add("contact", b.contacts);
  add("member", b.members);
  return { ids, refs };
}

/** 모델에 붙이는 브리핑 맥락. 금액·연락처 없음. 번호로 고를 수 있게 목록을 준다 */
export function assistContext(b: AssistBrief, book: RefBook, report: AssistReport | null): string {
  const r = (id: string | null) => (id ? (book.refs.get(id) ?? "") : "");
  const lines: string[] = [`<오늘 브리핑 날짜="${b.date}">`];
  lines.push("[오늘 할 일]");
  for (const x of b.today) lines.push(`- ${x.time ?? "종일"} ${x.title}${x.sub ? ` (${x.sub})` : ""}${x.overdue ? " 기한 지남" : ""}${x.done ? " 끝남" : ""}${x.taskId ? ` ${r(x.taskId)}` : ""}${x.eventId ? ` ${r(x.eventId)}` : ""}`);
  if (!b.today.length) lines.push("- 없음");
  lines.push("[손이 필요한 안건]");
  for (const x of b.need) lines.push(`- ${r(x.dealId)} ${x.title}: ${x.reason} → 제안: ${x.suggest}`);
  if (!b.need.length) lines.push("- 없음");
  lines.push("[진행 중 안건]");
  for (const d of b.deals) lines.push(`- ${r(d.id)} ${d.title}${d.company ? ` · ${d.company}` : ""} · ${d.stageLabel}${d.next ? ` · 다음: ${d.next}` : ""}${d.mine ? " · 내 담당" : ""}`);
  lines.push("[열린 할 일]");
  for (const t of b.tasks) lines.push(`- ${r(t.id)} ${t.title}${t.due ? ` · 기한 ${t.due}` : ""}${t.assignee ? ` · ${t.assignee}` : ""}${t.dealId ? ` · ${r(t.dealId)}` : ""}`);
  lines.push("[다가오는 일정]");
  for (const e of b.events) lines.push(`- ${r(e.id)} ${e.date} ${e.time ?? "종일"} ${e.title}${e.dealId ? ` · ${r(e.dealId)}` : ""}`);
  lines.push("[고객사]");
  lines.push(b.companies.map((c) => `${r(c.id)} ${c.name}`).join(", ") || "없음");
  lines.push("[고객 담당자]");
  lines.push(b.contacts.map((c) => `${r(c.id)} ${c.name}${c.title ? ` ${c.title}` : ""}(${r(c.companyId)})`).join(", ") || "없음");
  lines.push("[우리 기관 담당자]");
  lines.push(b.members.map((m) => `${r(m.id)} ${m.name}${m.me ? "(나)" : ""}`).join(", "));
  if (report) {
    lines.push(`[이번 기간 숫자 ${report.from}~${report.to}, 코드 계산]`);
    lines.push(`새 안건 ${report.created}건, 수주 ${report.won}건, 실패 ${report.lost}건, 수주율 ${report.winRate == null ? "끝난 안건 없음" : `${report.winRate}%`}`);
    if (report.reasons.length) lines.push(`실패 사유: ${report.reasons.map((x) => `${x.reason} ${x.count}건`).join(", ")}`);
  }
  lines.push("</오늘 브리핑>");
  return lines.join("\n");
}

/* ── 도구 ── */
type Schema = { type?: string; properties?: Record<string, Record<string, unknown>>; required?: string[]; additionalProperties?: unknown };

/** 비서 도구로 쓸 액션: 단추가 tool 로 표시한 바로 실행, 보내기·승인 계열 이름이 아닌 것 */
export function assistActions(c: DanchuCatalog): DanchuCatalogAction[] {
  return c.actions.filter((a) => a.tool && a.level === "auto" && a.scope === "org" && /^[a-z][a-z_]{1,39}$/.test(a.name) && !FORBIDDEN_TOOL_PREFIXES.some((p) => a.name.startsWith(p)));
}

/** 단추 입력 모양 → 모델 도구 모양. x-ref 칸은 번호 문자열로, 모델 API 가 받지 않는 칸(format·x-*)은 뺀다 */
export function toolSchema(input: Record<string, unknown>): Record<string, unknown> {
  const s = input as Schema;
  const props: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(s.properties ?? {})) {
    const ref = raw["x-ref"] as RefKind | undefined;
    if (ref && PREFIX[ref]) {
      props[k] = { type: "string", description: `${String(raw.description ?? REF_LABEL[ref])}. 브리핑의 ${REF_LABEL[ref]} 번호(${PREFIX[ref]}1처럼)` };
      continue;
    }
    props[k] = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "format" && !key.startsWith("x-")));
  }
  return { type: "object", properties: props, required: [...(s.required ?? [])], additionalProperties: false };
}

/**
 * 비서 찾기 도구: 단추가 tool 로 표시한 읽기(기관 범위). 서버는 이 결과를 모델에 넣지 않는다.
 * 앱이 찾기 카드에서 단추를 직접 읽어 보여 준다(금액은 단추 계산값, 에이전트는 복사본을 두지 않는다)
 */
export function assistLookups(c: DanchuCatalog): DanchuCatalogAction[] {
  return c.actions.filter((a) => a.tool && a.level === "read" && a.scope === "org" && /^[a-z][a-z_]{1,39}$/.test(a.name) && !FORBIDDEN_TOOL_PREFIXES.some((p) => a.name.startsWith(p)));
}

export function assistTools(c: DanchuCatalog): AgentToolSpec[] {
  return [...assistActions(c), ...assistLookups(c)].map((a) => ({ name: a.name, description: `${a.label}. ${a.description}`, inputSchema: toolSchema(a.input) }));
}

export type Resolved = { ok: true; body: Record<string, unknown> } | { ok: false; reason: "unknown_ref" | "bad_input" };

/** 모델 입력 → 단추 본문. 모르는 칸은 버리고, 필수·선택값·번호를 검사한다. 금액·연락처 칸은 단추 입력 모양에 없다 */
export function resolveCall(a: DanchuCatalogAction, input: unknown, book: RefBook): Resolved {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, reason: "bad_input" };
  const s = a.input as Schema;
  const props = s.properties ?? {};
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const p = props[k];
    if (!p || v === undefined || v === null || v === "") continue;
    const ref = p["x-ref"] as RefKind | undefined;
    if (ref) {
      if (typeof v !== "string") return { ok: false, reason: "bad_input" };
      const key = v.trim().toUpperCase();
      const id = book.ids.get(key);
      if (!id || KIND_OF[key[0]!] !== ref) return { ok: false, reason: "unknown_ref" };
      body[k] = id;
      continue;
    }
    if (Array.isArray(p.enum) && !(p.enum as unknown[]).includes(v)) return { ok: false, reason: "bad_input" };
    if (p.type === "string" && typeof v !== "string") return { ok: false, reason: "bad_input" };
    if (p.type === "boolean" && typeof v !== "boolean") return { ok: false, reason: "bad_input" };
    if (p.type === "integer" && !Number.isInteger(v)) return { ok: false, reason: "bad_input" };
    if (typeof v === "string" && typeof p.maxLength === "number" && v.length > p.maxLength) return { ok: false, reason: "bad_input" };
    if (typeof v === "string" && typeof p.pattern === "string" && !new RegExp(p.pattern).test(v)) return { ok: false, reason: "bad_input" };
    body[k] = v;
  }
  for (const k of s.required ?? []) if (!(k in body)) return { ok: false, reason: "bad_input" };
  return { ok: true, body };
}

/** 단추 응답 → 실행 결과. 2xx 완료, 4xx 거절, 나머지는 모름 */
export function runOutcome(status: number): "done" | "failed" | "unknown" {
  if (status >= 200 && status < 300) return "done";
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return "failed";
  return "unknown";
}

/** 단추 실행 응답의 실행 기록 id·되돌리기 가능 여부 */
export function danchuLogOf(body: unknown): { id: string; undoable: boolean } | null {
  const l = body && typeof body === "object" ? (body as { agentLog?: { id?: unknown; undoable?: unknown } }).agentLog : undefined;
  return l && typeof l.id === "string" && /^[0-9a-f-]{36}$/.test(l.id) ? { id: l.id, undoable: l.undoable === true } : null;
}

/* ── 바로 실행 (비서 도구·앱 버튼 공통) ── */
/** 화면에 돌려줄 실행 한 줄 */
export const runView = (r: AssistRun) => ({ id: r.id, action: r.action, label: r.label, outcome: r.outcome, undoable: r.undoable && !r.undoneAt, undone: !!r.undoneAt, createdAt: r.createdAt });

/**
 * 바로 실행 액션 하나를 단추에서 실행하고 기록한다. 실패해도 기록한다(누가 무엇을 시켰는지).
 * 승인이 필요한 액션은 여기로 오지 않는다(부르는 쪽이 목록의 수준을 본다).
 */
export async function runAuto(
  deps: { api: Pick<DanchuApi, "run">; runs: RunRepo },
  s: { orgId: string; userId: string },
  token: string,
  a: DanchuCatalogAction,
  body: Record<string, unknown>,
  conversationId: string | null,
  now = () => new Date(),
  rfqNo: string | null = null,
): Promise<{ run: AssistRun; status: number; result: unknown }> {
  const r = await deps.api.run(token, { action: a.name, rfqNo, body });
  const log = danchuLogOf(r.body);
  const run: AssistRun = {
    id: randomUUID(),
    orgId: s.orgId,
    userId: s.userId,
    conversationId,
    action: a.name,
    label: a.label.slice(0, 60) || a.name,
    outcome: r.status === 0 ? "unknown" : runOutcome(r.status),
    danchuLogId: log?.id ?? null,
    undoable: !!log?.undoable,
    undoneAt: null,
    createdAt: now().toISOString(),
  };
  await deps.runs.insert(run);
  return { run, status: r.status, result: r.body };
}

/* ── 비서 대화 한 턴 ── */
export interface AssistDeps {
  api: Pick<DanchuApi, "run">;
  runs: RunRepo;
  catalogs: Pick<CatalogCache, "get">;
}

/** 한 턴에 바로 실행하는 액션 수 상한 */
export const MAX_ACTIONS_PER_TURN = 5;
/** 한 턴에 붙이는 찾기 카드 수 상한 */
export const MAX_LOOKUPS_PER_TURN = 2;

export type AssistPrep =
  | { ok: true; tools: AgentToolSpec[]; context: string; book: RefBook; actions: Map<string, DanchuCatalogAction> }
  | { ok: false; error: "danchu_unavailable" | "plan_required" | "forbidden" };

/** 턴 준비: 단추에서 액션 목록·브리핑·이번 주 보고를 읽어 도구와 맥락을 만든다 */
export async function prepareAssist(deps: AssistDeps, token: string, orgId: string): Promise<AssistPrep> {
  const [cat, b, rep] = await Promise.all([
    deps.catalogs.get(token, orgId),
    deps.api.run(token, { action: "brief", rfqNo: null, body: {} }),
    deps.api.run(token, { action: "report", rfqNo: null, body: {} }),
  ]);
  const err = (b.body && typeof b.body === "object" ? (b.body as { error?: unknown }).error : undefined) as string | undefined;
  if (b.status === 403) return { ok: false, error: err === "plan_required" ? "plan_required" : "forbidden" };
  const brief = b.status === 200 && b.body && typeof b.body === "object" ? (b.body as { brief?: AssistBrief }).brief : undefined;
  if (!cat || !brief) return { ok: false, error: "danchu_unavailable" };
  const report = rep.status === 200 && rep.body && typeof rep.body === "object" ? ((rep.body as { report?: AssistReport }).report ?? null) : null;
  const book = refBook(brief);
  return { ok: true, tools: assistTools(cat), context: assistContext(brief, book, report), book, actions: new Map([...assistActions(cat), ...assistLookups(cat)].map((a) => [a.name, a])) };
}

export type AssistActionEvent = { run: ReturnType<typeof runView> | null; label: string; outcome: "done" | "failed" | "unknown" | "skipped"; message: string | null };
/** 찾기 카드: 앱이 이 입력으로 단추를 읽는다 */
export type AssistLookupEvent = { action: string; label: string; body: Record<string, unknown> };

/** 모델이 부른 도구를 단추에서 바로 실행한다. 목록에 없는 도구·번호·틀린 입력은 실행하지 않는다 */
export async function applyAssistCalls(
  deps: AssistDeps,
  s: { orgId: string; userId: string },
  token: string,
  conversationId: string,
  calls: readonly { name: string; input: unknown }[],
  prep: Extract<AssistPrep, { ok: true }>,
): Promise<{ events: AssistActionEvent[]; lookups: AssistLookupEvent[]; notes: string[] }> {
  const events: AssistActionEvent[] = [];
  const lookups: AssistLookupEvent[] = [];
  const notes: string[] = [];
  let runs = 0;
  for (const call of calls) {
    const a = prep.actions.get(call.name);
    const label = a?.label ?? "알 수 없는 동작";
    if (a?.level === "read") {
      const r = resolveCall(a, call.input, prep.book);
      if (r.ok && lookups.length < MAX_LOOKUPS_PER_TURN) {
        lookups.push({ action: a.name, label, body: r.body });
        notes.push(`(찾기: ${label})`);
      }
      continue;
    }
    if (!a || runs++ >= MAX_ACTIONS_PER_TURN) {
      events.push({ run: null, label, outcome: "skipped", message: null });
      notes.push(`(실행 안 함: ${label})`);
      continue;
    }
    const r = resolveCall(a, call.input, prep.book);
    if (!r.ok) {
      events.push({ run: null, label, outcome: "skipped", message: null });
      notes.push(`(실행 안 함: ${label}, ${r.reason === "unknown_ref" ? "목록에 없는 번호" : "입력 확인 필요"})`);
      continue;
    }
    const done = await runAuto(deps, s, token, a, r.body, conversationId);
    const msg = done.result && typeof done.result === "object" ? (done.result as { error?: unknown }).error : undefined;
    // 단추 웹 처리의 거절 문장(해요체)만 보여 준다. 코드 값은 보이지 않는다
    const message = done.run.outcome === "done" ? null : typeof msg === "string" && /[가-힣]/.test(msg) && msg.length <= 120 ? msg : null;
    events.push({ run: runView(done.run), label, outcome: done.run.outcome, message });
    notes.push(`(실행: ${label} ${done.run.outcome === "done" ? "완료" : done.run.outcome === "failed" ? "거절됨" : "결과 모름"})`);
  }
  return { events, lookups, notes };
}
