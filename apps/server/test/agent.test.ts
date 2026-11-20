import {
  EMPTY_SHEET,
  type CompletionRequest,
  type CompletionResult,
  type LlmProvider,
  type RequestSheet,
} from "@danchuai/core";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { LIMITS } from "../src/agent/routes";
import { MemoryConversationRepo, MemoryRequestDirectory } from "../src/agent/store";
import { ASK_SYSTEM, SYSTEM } from "../src/agent/prompts";
import type { Session } from "../src/auth";
import { MemoryOutboundRepo } from "../src/repo";

type Script = Partial<CompletionResult> | ((req: CompletionRequest) => Partial<CompletionResult>);

/** 정해 둔 답을 돌려주는 가짜 공급사. 받은 요청을 모두 기록한다. */
class FakeProvider implements LlmProvider {
  readonly name = "anthropic" as const;
  readonly model = "fake";
  calls: CompletionRequest[] = [];
  constructor(private script: Script[] = []) {}
  push(...s: Script[]) {
    this.script.push(...s);
  }
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls.push(structuredClone({ ...req, onText: undefined, signal: undefined }));
    const step = this.script.shift() ?? {};
    const r = typeof step === "function" ? step(req) : step;
    if (r.text) for (const ch of r.text.match(/.{1,4}/gsu) ?? []) req.onText?.(ch);
    return {
      text: r.text ?? "",
      toolCalls: r.toolCalls ?? [],
      usage: r.usage ?? { inputTokens: 100, outputTokens: 20, cacheReadTokens: 80, cacheWriteTokens: 0 },
      stop: r.stop ?? "done",
      provider: "anthropic",
      model: "fake",
    };
  }
}

const sessions: Record<string, Session> = {
  "Bearer req": { userId: "u1", orgId: "00000000-0000-4000-8000-0000000000a1", role: "requester" },
  "Bearer req2": { userId: "u9", orgId: "00000000-0000-4000-8000-0000000000a9", role: "requester" },
  "Bearer cro": { userId: "u2", orgId: "00000000-0000-4000-8000-0000000000c1", role: "cro" },
  "Bearer cro-b": { userId: "u3", orgId: "00000000-0000-4000-8000-0000000000c2", role: "cro" },
};

const FULL: RequestSheet = {
  ...EMPTY_SHEET,
  testType: "독성",
  substance: "저분자 화합물",
  species: "랫드",
  route: "경구",
  duration: "4주 반복투여, 회복 2주",
  glp: "GLP",
  dueDate: "11월 29일",
  notes: null,
};

function setup(provider: LlmProvider | null = new FakeProvider()) {
  const outbound = new MemoryOutboundRepo();
  const conversations = new MemoryConversationRepo();
  const requests = new MemoryRequestDirectory({
    r1: { sheet: FULL, requesterOrgId: "00000000-0000-4000-8000-0000000000a1", sentTo: ["00000000-0000-4000-8000-0000000000c1"] },
  });
  const app = createApp({
    auth: { resolve: async (h) => (h ? sessions[h] ?? null : null) },
    outbound,
    transport: { deliver: vi.fn(async () => "sent" as const) },
    provider: provider ?? undefined,
    conversations,
    requests,
  });
  const call = (method: string, path: string, auth: string | null, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const create = async (auth = "Bearer req", body: unknown = {}) => {
    const res = await call("POST", "/v1/agent/conversations", auth, body);
    return { res, conv: (await res.json()) as { id: string; sheet: RequestSheet } };
  };
  const turn = async (id: string, text: string, auth = "Bearer req") => {
    const res = await call("POST", `/v1/agent/conversations/${id}/turn`, auth, { text });
    return { res, events: res.headers.get("content-type")?.includes("event-stream") ? parseSse(await res.text()) : [] };
  };
  return { app, call, create, turn, outbound, conversations };
}

function parseSse(raw: string) {
  return raw
    .split("\n\n")
    .map((chunk) => {
      const event = /^event: (.+)$/m.exec(chunk)?.[1];
      const data = /^data: (.+)$/m.exec(chunk)?.[1];
      return event && data ? { event, data: JSON.parse(data) } : null;
    })
    .filter((e): e is { event: string; data: any } => e !== null);
}

const sheetCall = (fields: Partial<RequestSheet>) => ({
  id: "t1",
  name: "update_sheet",
  input: { ...Object.fromEntries(Object.keys(EMPTY_SHEET).map((k) => [k, null])), ...fields },
});

describe("에이전트 대화: 기본", () => {
  it("로그인 없으면 401", async () => {
    const { call } = setup();
    expect((await call("POST", "/v1/agent/conversations", null, {})).status).toBe(401);
  });

  it("공급사 설정이 없으면 대화는 503", async () => {
    const { create, turn } = setup(null);
    const { conv } = await create();
    expect((await turn(conv.id, "견적 받고 싶어요")).res.status).toBe(503);
  });

  it("답 글자를 스트리밍하고 요청서·질문 카드를 보낸다", async () => {
    const p = new FakeProvider([
      {
        text: "랫드 4주 독성으로 정리했어요. 투여 경로를 알려 주세요.",
        toolCalls: [
          sheetCall({ testType: "독성", species: "랫드", duration: "4주" }),
          { id: "t2", name: "ask_question", input: { field: "route", question: "투여 경로는요?", options: ["경구", "정맥", "피하"] } },
        ],
      },
    ]);
    const { create, turn } = setup(p);
    const { conv } = await create();
    const { res, events } = await turn(conv.id, "랫드 4주 독성 견적 받고 싶어요");
    expect(res.status).toBe(200);
    const names = events.map((e) => e.event);
    expect(names[0]).toBe("step");
    expect(names.filter((n) => n === "text").length).toBeGreaterThan(1);
    expect(names.slice(-3)).toEqual(["sheet", "question", "done"]);
    const sheet = events.find((e) => e.event === "sheet")!.data;
    expect(sheet.sheet.species).toBe("랫드");
    expect(sheet.missing).toContain("route");
    expect(events.find((e) => e.event === "question")!.data.options).toEqual([{ label: "경구" }, { label: "정맥" }, { label: "피하" }]);
  });

  it("다른 조직의 대화는 404", async () => {
    const { create, turn, call } = setup();
    const { conv } = await create();
    expect((await call("GET", `/v1/agent/conversations/${conv.id}`, "Bearer req2")).status).toBe(404);
    expect((await turn(conv.id, "안녕하세요", "Bearer req2")).res.status).toBe(404);
  });

  it("빈 글·너무 긴 글·모르는 필드는 400", async () => {
    const { create, call } = setup();
    const { conv } = await create();
    const path = `/v1/agent/conversations/${conv.id}/turn`;
    expect((await call("POST", path, "Bearer req", { text: "  " })).status).toBe(400);
    expect((await call("POST", path, "Bearer req", { text: "가".repeat(LIMITS.textChars + 1) })).status).toBe(400);
    expect((await call("POST", path, "Bearer req", { text: "a", orgId: "x" })).status).toBe(400);
  });

  it("대화당 턴 수를 넘으면 429", async () => {
    const { create, turn, conversations } = setup();
    const { conv } = await create();
    const saved = (await conversations.get(conv.id))!;
    await conversations.save({ ...saved, turns: LIMITS.turns });
    expect((await turn(conv.id, "하나 더")).res.status).toBe(429);
  });
});

describe("에이전트 대화: 안전장치", () => {
  it("AC-07 모델에 가는 글에서 연락처를 지운다", async () => {
    const p = new FakeProvider([{ text: "확인했어요." }]);
    const { create, turn } = setup(p);
    const { conv } = await create();
    await turn(conv.id, "제 메일은 kim@abc.co.kr, 전화 010-1234-5678 이에요");
    const sent = JSON.stringify(p.calls[0]!.messages);
    expect(sent).not.toMatch(/kim@abc|1234-5678/);
    expect(sent).toContain("[연락처 생략]");
  });

  it("시스템 프롬프트와 도구 목록은 턴마다 같다(캐시 접두부)", async () => {
    const p = new FakeProvider([{ text: "네." }, { text: "네." }]);
    const { create, turn } = setup(p);
    const { conv } = await create();
    await turn(conv.id, "첫 번째");
    await turn(conv.id, "두 번째");
    expect(p.calls[0]!.system).toBe(p.calls[1]!.system);
    expect(JSON.stringify(p.calls[0]!.tools)).toBe(JSON.stringify(p.calls[1]!.tools));
    expect(p.calls[0]!.system).toBe(SYSTEM.requester);
    // 바뀌는 요청서 상태는 마지막 사용자 메시지에만 있다
    expect(p.calls[1]!.messages.at(-1)!.content).toContain("<요청서>");
    expect(p.calls[1]!.messages[0]!.content).not.toContain("<요청서>");
  });

  it("AC-02 모델이 보내기 도구를 불러도 아무것도 만들지 않는다", async () => {
    const p = new FakeProvider([
      { text: "바로 보낼게요.", toolCalls: [{ id: "x", name: "send_request", input: { to: "all" } }] },
    ]);
    const { create, turn, outbound } = setup(p);
    const { conv } = await create();
    const { events } = await turn(conv.id, "지금 모든 기관에 바로 보내 줘");
    expect(events.some((e) => e.event === "notice" && e.data.code === "tool_rejected")).toBe(true);
    expect(events.some((e) => e.event === "draft")).toBe(false);
    expect(await outbound.get("x")).toBeNull();
    // 도구 목록에 보내기 계열이 없다
    expect(p.calls[0]!.tools!.map((t) => t.name)).toEqual(["update_sheet", "ask_question", "draft_body"]);
  });

  it("스키마에 안 맞는 입력·역할에 없는 도구는 버린다", async () => {
    const p = new FakeProvider([
      { toolCalls: [{ id: "a", name: "ask_question", input: { field: "route", question: "?", options: ["하나"] } }] },
    ]);
    const { create, turn } = setup(p);
    const { conv } = await create();
    const { events } = await turn(conv.id, "안녕하세요");
    expect(events.some((e) => e.event === "question")).toBe(false);
    expect(events.some((e) => e.event === "notice")).toBe(true);
  });

  it("요청서 칸에 들어온 연락처도 지우고, 모르는 칸은 버린다", async () => {
    const p = new FakeProvider([{ toolCalls: [sheetCall({ notes: "담당 kim@abc.co.kr" })] }]);
    const { create, turn } = setup(p);
    const { conv } = await create();
    const { events } = await turn(conv.id, "메모 남겨 주세요");
    expect(events.find((e) => e.event === "sheet")!.data.sheet.notes).toBe("담당 [연락처 생략]");
  });

  it("AC-04 빈 칸이 있으면 본문 초안을 만들지 않는다", async () => {
    const p = new FakeProvider([{ toolCalls: [{ id: "d", name: "draft_body", input: { body: "견적 요청드려요." } }] }]);
    const { create, turn } = setup(p);
    const { conv } = await create();
    const { events } = await turn(conv.id, "본문 써 줘");
    expect(events.some((e) => e.event === "draft")).toBe(false);
  });

  it("AC-03·05 본문에서 금액·추천 문장은 빼고 남은 문장만 초안이 된다", async () => {
    const p = new FakeProvider([
      {
        toolCalls: [
          sheetCall(FULL),
          {
            id: "d",
            name: "draft_body",
            input: { body: "랫드 4주 경구 반복투여 독성시험 견적을 요청드려요. 예산은 1억 원 안쪽이에요. 가장 저렴한 기관을 고를게요. 11월 29일까지 회신 부탁드려요." },
          },
        ],
      },
    ]);
    const { create, turn } = setup(p);
    const { conv } = await create();
    const { events } = await turn(conv.id, "다 정했어요. 본문 써 줘");
    const d = events.find((e) => e.event === "draft")!.data;
    expect(d.body).toBe("랫드 4주 경구 반복투여 독성시험 견적을 요청드려요. 11월 29일까지 회신 부탁드려요.");
    expect(d.dropped).toBe(2);
  });

  it("거절·잘림은 오류로 알리고 도구 결과를 쓰지 않는다", async () => {
    const p = new FakeProvider([{ text: "", stop: "refused" }]);
    const { create, turn } = setup(p);
    const { conv } = await create();
    const { events } = await turn(conv.id, "안녕하세요");
    expect(events.find((e) => e.event === "error")!.data.code).toBe("refused");
    expect(events.at(-1)!.event).toBe("done");
  });

  it("공급사 오류는 provider_error, 로그에 본문을 남기지 않는다", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const p = new FakeProvider([
      () => {
        throw new Error("비밀 본문 kim@abc.co.kr");
      },
    ]);
    const { create, turn } = setup(p);
    const { conv } = await create();
    const { events } = await turn(conv.id, "개인 메모 비밀 본문");
    expect(events.at(-1)!.data.code).toBe("provider_error");
    expect(JSON.stringify(err.mock.calls)).not.toMatch(/비밀|kim@/);
    err.mockRestore();
  });
});

describe("보내기 초안 만들기", () => {
  async function withDraft() {
    const p = new FakeProvider([
      { toolCalls: [sheetCall(FULL), { id: "d", name: "draft_body", input: { body: "랫드 4주 반복투여 견적을 요청드려요." } }] },
    ]);
    const s = setup(p);
    const { conv } = await s.create();
    await s.turn(conv.id, "본문 써 줘");
    return { ...s, id: conv.id };
  }

  it("사람이 고른 기관마다 서버 본문으로 초안을 만들고, 승인 흐름으로 이어진다", async () => {
    const { call, id } = await withDraft();
    const res = await call("POST", `/v1/agent/conversations/${id}/outbound`, "Bearer req", {
      version: 1,
      recipientOrgIds: ["00000000-0000-4000-8000-0000000000c1", "00000000-0000-4000-8000-0000000000c2", "00000000-0000-4000-8000-0000000000c1"],
    });
    expect(res.status).toBe(201);
    const { outbound } = (await res.json()) as { outbound: Array<{ id: string; text: string; epoch: number; textHash: string }> };
    expect(outbound).toHaveLength(2);
    expect(outbound[0]!.text).toBe("랫드 4주 반복투여 견적을 요청드려요.");
    const dec = await call("POST", `/v1/outbound/${outbound[0]!.id}/decision`, "Bearer req", {
      decision: "approve",
      epoch: outbound[0]!.epoch,
      textHash: outbound[0]!.textHash,
    });
    expect(await dec.json()).toEqual({ status: "approved" });
  });

  it("앱이 보낸 본문은 받지 않고, 같은 판은 한 번만, 옛 판은 409", async () => {
    const { call, id } = await withDraft();
    const path = `/v1/agent/conversations/${id}/outbound`;
    expect((await call("POST", path, "Bearer req", { version: 1, recipientOrgIds: ["a"] })).status).toBe(400);
    expect((await call("POST", path, "Bearer req", { version: 1, recipientOrgIds: ["00000000-0000-4000-8000-0000000000c1"], text: "딴 본문" })).status).toBe(400);
    expect((await call("POST", path, "Bearer req", { version: 2, recipientOrgIds: ["00000000-0000-4000-8000-0000000000c1"] })).status).toBe(409);
    expect((await call("POST", path, "Bearer req", { version: 1, recipientOrgIds: ["00000000-0000-4000-8000-0000000000c1"] })).status).toBe(201);
    expect((await call("POST", path, "Bearer req", { version: 1, recipientOrgIds: ["00000000-0000-4000-8000-0000000000c1"] })).status).toBe(409);
  });

  it("자기 조직에는 보낼 수 없다", async () => {
    const { call, id } = await withDraft();
    expect(
      (await call("POST", `/v1/agent/conversations/${id}/outbound`, "Bearer req", { version: 1, recipientOrgIds: ["00000000-0000-4000-8000-0000000000a1"] })).status,
    ).toBe(400);
  });
});

describe("기관 대화", () => {
  it("받은 요청만 열 수 있다", async () => {
    const { create } = setup();
    expect((await create("Bearer cro-b", { requestId: "r1" })).res.status).toBe(404);
    expect((await create("Bearer cro", {})).res.status).toBe(400);
    const ok = await create("Bearer cro", { requestId: "r1" });
    expect(ok.res.status).toBe(201);
    expect(ok.conv.sheet.species).toBe("랫드");
  });

  it("요약에서 금액 문장은 빼고, 회신 금액은 코드가 계산해 붙인다", async () => {
    const p = new FakeProvider([
      {
        toolCalls: [
          { id: "s", name: "summarize_request", input: { points: ["랫드 4주 경구 반복투여", "적정 단가는 8천만 원 정도"] } },
          { id: "d", name: "draft_body", input: { body: "요청 주신 설계로 진행 가능해요. 총액은 9천만 원이에요. 회복군 동물 수를 확인 부탁드려요." } },
        ],
      },
    ]);
    const { create, turn, call, outbound } = setup(p);
    const { conv } = await create("Bearer cro", { requestId: "r1" });
    const { events } = await turn(conv.id, "요약하고 회신 써 줘", "Bearer cro");
    expect(events.find((e) => e.event === "summary")!.data.points).toEqual(["랫드 4주 경구 반복투여"]);
    expect(p.calls[0]!.tools!.map((t) => t.name)).toEqual(["summarize_request", "draft_body"]);

    const res = await call("POST", `/v1/agent/conversations/${conv.id}/outbound`, "Bearer cro", {
      version: 1,
      quoteLines: [
        { label: "반복투여 4주", amountWon: 82_000_000 },
        { label: "회복군", amountWon: 14_000_000 },
      ],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { outbound: Array<{ id: string; counterpartyOrgId: string; text: string }> };
    expect(body.outbound[0]!.counterpartyOrgId).toBe("00000000-0000-4000-8000-0000000000a1");
    expect(body.outbound[0]!.text).not.toContain("9천만");
    expect(body.outbound[0]!.text).toContain("견적 총액(부가세 포함) 1억 560만원");
    expect((await outbound.get(body.outbound[0]!.id))!.kind).toBe("reply");
  });

  it("기관은 받는 곳을 직접 고를 수 없다", async () => {
    const p = new FakeProvider([{ toolCalls: [{ id: "d", name: "draft_body", input: { body: "진행 가능해요." } }] }]);
    const { create, turn, call } = setup(p);
    const { conv } = await create("Bearer cro", { requestId: "r1" });
    await turn(conv.id, "회신 써 줘", "Bearer cro");
    expect(
      (await call("POST", `/v1/agent/conversations/${conv.id}/outbound`, "Bearer cro", { version: 1, recipientOrgIds: ["00000000-0000-4000-8000-0000000000ff"] })).status,
    ).toBe(400);
  });
});

describe("에이전트 대화: 가이드라인 근거", () => {
  it("질문과 관련된 원문 조각을 이번 턴에만 붙이고, 기록에는 남기지 않는다", async () => {
    const p = new FakeProvider([{ text: "표준 조합은 두 가지 선택지가 있어요(근거: ICH S2 2.2)." }, { text: "네." }]);
    const { create, turn } = setup(p);
    const { conv } = await create();
    const { events } = await turn(conv.id, "유전독성 표준 시험 조합이 뭐예요?");
    const last = p.calls[0]!.messages.at(-1)!.content;
    expect(last).toContain("<참고자료>");
    expect(last).toContain('<조각 문서="ICH S2"');
    // 인용한 원문만 출처로 보낸다
    const src = events.find((e) => e.event === "sources");
    expect(src?.data.items.map((s: { doc: string }) => s.doc)).toEqual(["ICH S2"]);
    expect(src?.data.items[0].url).toMatch(/^https:\/\/database\.ich\.org\//);
    // 다음 턴의 기록에는 근거 블록이 없다
    await turn(conv.id, "고마워요");
    const history = p.calls[1]!.messages.slice(0, -1).map((m) => m.content).join("\n");
    expect(history).not.toContain("<참고자료>");
  });

  it("인용이 없으면 출처를 보내지 않는다", async () => {
    const p = new FakeProvider([{ text: "원문에서 확인하지 못했어요." }]);
    const { create, turn } = setup(p);
    const { conv } = await create();
    const { events } = await turn(conv.id, "유전독성 표준 시험 조합이 뭐예요?");
    expect(events.some((e) => e.event === "sources")).toBe(false);
  });

  it("시스템 프롬프트에 요청서 항목 체계·시험 묶음·효력 영역이 고정 글로 들어 있다", () => {
    for (const s of [SYSTEM.requester, SYSTEM.cro]) {
      expect(s).toContain("<요청서 항목 체계>");
      expect(s).toContain("<시험 묶음>");
      expect(s).toContain("<효력시험 질환 영역>");
      expect(s).not.toMatch(/\d{4}-\d{2}-\d{2}/); // 날짜 같은 바뀌는 값 없음(캐시)
    }
  });
});

describe("에이전트 대화: 가이드라인 질문하기", () => {
  it("의뢰자·기관 모두 요청 없이 질문 대화를 연다", async () => {
    const { create } = setup();
    for (const auth of ["Bearer req", "Bearer cro"]) {
      const { res, conv } = await create(auth, { mode: "ask" });
      expect(res.status).toBe(201);
      expect((conv as unknown as { mode: string }).mode).toBe("ask");
    }
    // 질문 대화는 요청과 묶지 않는다
    expect((await create("Bearer cro", { mode: "ask", requestId: "r1" })).res.status).toBe(400);
    // 기관의 요청 대화는 여전히 받은 요청이 있어야 한다
    expect((await create("Bearer cro", {})).res.status).toBe(400);
  });

  it("질문 대화는 도구·요청서 없이 원문 근거만 붙여 답하고, 출처를 보낸다", async () => {
    const p = new FakeProvider([
      {
        text: "표준 조합은 두 가지예요(근거: ICH S2 2.2).",
        // 모델이 도구를 불러도 질문 대화에서는 무시한다
        toolCalls: [sheetCall({ testType: "독성" })],
      },
    ]);
    const { create, turn } = setup(p);
    const { conv } = await create("Bearer cro", { mode: "ask" });
    const { events } = await turn(conv.id, "유전독성 표준 시험 조합이 뭐예요?", "Bearer cro");
    const req = p.calls[0]!;
    expect(req.system).toBe(ASK_SYSTEM);
    expect(req.tools).toBeUndefined();
    const last = req.messages.at(-1)!.content;
    expect(last).toContain("<참고자료>");
    expect(last).not.toContain("<요청서>");
    expect(events.some((e) => e.event === "sheet")).toBe(false);
    expect(events.find((e) => e.event === "sources")?.data.items[0].doc).toBe("ICH S2");
    expect(events.find((e) => e.event === "step")?.data.label).toBe("원문 찾기");
  });

  it("질문 대화에서는 보내기 초안을 만들 수 없다", async () => {
    const { create, call } = setup();
    const { conv } = await create("Bearer req", { mode: "ask" });
    const res = await call("POST", `/v1/agent/conversations/${conv.id}/outbound`, "Bearer req", {
      version: 1,
      recipientOrgIds: ["00000000-0000-4000-8000-0000000000c1"],
    });
    expect(res.status).toBe(409);
  });

  it("답의 근거를 저장해 다시 열 때 보여 주고, 모델에는 보내지 않는다. 지난 질문은 내 것만", async () => {
    const p = new FakeProvider([{ text: "두 가지예요(근거: ICH S2 2.2)." }, { text: "네." }]);
    const { create, turn, call } = setup(p);
    const { conv } = await create("Bearer req", { mode: "ask" });
    await turn(conv.id, "유전독성 표준 시험 조합이 뭐예요?");
    const view = (await (await call("GET", `/v1/agent/conversations/${conv.id}`, "Bearer req")).json()) as {
      messages: { role: string; text: string; sources?: { doc: string }[] }[];
    };
    expect(view.messages[1]!.sources?.map((x) => x.doc)).toEqual(["ICH S2"]);
    await turn(conv.id, "고마워요");
    expect(p.calls[1]!.messages.every((m) => Object.keys(m).sort().join() === "content,role")).toBe(true);

    // 요청 대화·글 없는 질문 대화·다른 사람 질문은 목록에 없다
    await create("Bearer req", { mode: "ask" });
    const other = await create("Bearer req2", { mode: "ask" });
    await turn(other.conv.id, "남의 질문", "Bearer req2");
    const list = (await (await call("GET", "/v1/agent/asks", "Bearer req")).json()) as { items: { id: string; title: string }[] };
    expect(list.items).toEqual([expect.objectContaining({ id: conv.id, title: "유전독성 표준 시험 조합이 뭐예요?" })]);
  });

  it("질문용 시스템 프롬프트는 고정 글이고 기준 자료를 담는다", () => {
    expect(ASK_SYSTEM).toContain("<시험 묶음>");
    expect(ASK_SYSTEM).toContain("여덟 문장");
    expect(ASK_SYSTEM).not.toContain("한두 문장");
    expect(ASK_SYSTEM).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
