import { randomUUID } from "node:crypto";
import {
  amountBlock,
  EMPTY_SHEET,
  missingFields,
  redactContacts,
  sheetContext,
  type AgentMessage,
  type LlmProvider,
  type OutboundDraft,
} from "@danchuai/core";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { Session } from "../auth";
import { sha256 } from "../hash";
import type { OutboundRepo } from "../repo";
import { interpret } from "./interpret";
import { SYSTEM } from "./prompts";
import { TOOLS } from "./tools";
import type { Conversation, ConversationRepo, RequestDirectory } from "./store";

export const LIMITS = {
  textChars: 2000,
  turns: 40,
  historyMessages: 20,
  maxTokens: 1200,
  recipients: 10,
} as const;

export interface AgentDeps {
  provider?: LlmProvider;
  conversations: ConversationRepo;
  requests: RequestDirectory;
  outbound: OutboundRepo;
}

type Env = { Variables: { session: Session } };

const CreateBody = z.object({ requestId: z.string().min(1).max(64).optional() }).strict();
const TurnBody = z.object({ text: z.string().trim().min(1).max(LIMITS.textChars) }).strict();
const OutboundBody = z
  .object({
    version: z.number().int().positive(),
    recipientOrgIds: z.array(z.string().min(1).max(64)).min(1).max(LIMITS.recipients).optional(),
    // 기관 회신: 사람이 넣은 항목 금액(원 단위 정수). 합계는 서버가 계산한다.
    quoteLines: z
      .array(z.object({ label: z.string().min(1).max(60), amountWon: z.number().int().nonnegative().max(1e12) }).strict())
      .max(30)
      .optional(),
  })
  .strict();

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** 화면에 돌려줄 대화 상태. 모델 기록(messages)은 사용자·답 글만 보낸다. */
const view = (c: Conversation) => ({
  id: c.id,
  role: c.role,
  sheet: c.sheet,
  missing: missingFields(c.sheet),
  question: c.question,
  summary: c.summary,
  draft: c.draft && { body: c.draft.body, dropped: c.draft.dropped, version: c.draft.version },
  turns: c.turns,
});

/** 최근 기록만 보내고, 첫 메시지는 사용자 글이 되도록 맞춘다. */
function windowed(messages: AgentMessage[]): AgentMessage[] {
  let w = messages.slice(-LIMITS.historyMessages);
  while (w.length && w[0]!.role !== "user") w = w.slice(1);
  return w;
}

export function agentRoutes(deps: AgentDeps) {
  const app = new Hono<Env>();

  const load = async (id: string, s: Session) => {
    const c = await deps.conversations.get(id);
    // 다른 조직의 대화는 있는지 없는지도 알려 주지 않는다
    return c && c.orgId === s.orgId ? c : null;
  };

  app.post("/conversations", async (c) => {
    const s = c.get("session");
    const parsed = CreateBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    let sheet = { ...EMPTY_SHEET };
    let requestId: string | null = null;
    if (s.role === "cro") {
      if (!parsed.data.requestId) return c.json({ error: "bad_request" }, 400);
      const r = await deps.requests.forCro(parsed.data.requestId, s.orgId);
      if (!r) return c.json({ error: "not_found" }, 404);
      sheet = r.sheet;
      requestId = parsed.data.requestId;
    }
    const conv: Conversation = {
      id: randomUUID(),
      orgId: s.orgId,
      createdBy: s.userId,
      role: s.role,
      requestId,
      sheet,
      messages: [],
      question: null,
      summary: null,
      draft: null,
      turns: 0,
      usage: { ...ZERO_USAGE },
    };
    await deps.conversations.create(conv);
    return c.json(view(conv), 201);
  });

  app.get("/conversations/:id", async (c) => {
    const conv = await load(c.req.param("id"), c.get("session"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    return c.json(view(conv));
  });

  app.post("/conversations/:id/turn", async (c) => {
    const s = c.get("session");
    const found = await load(c.req.param("id"), s);
    if (!found) return c.json({ error: "not_found" }, 404);
    const parsed = TurnBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const provider = deps.provider;
    if (!provider) return c.json({ error: "agent_unavailable" }, 503);
    if (found.turns >= LIMITS.turns) return c.json({ error: "turn_limit" }, 429);
    if (!(await deps.conversations.lockTurn(found.id, s.orgId))) return c.json({ error: "turn_in_progress" }, 409);
    // 잠근 뒤 다시 읽는다. 바로 앞 턴이 막 저장했을 수 있다.
    const conv = await load(found.id, s);
    if (!conv || conv.turns >= LIMITS.turns) {
      await deps.conversations.unlockTurn(found.id);
      return conv ? c.json({ error: "turn_limit" }, 429) : c.json({ error: "not_found" }, 404);
    }

    // 선정 전 신원 보호: 모델에 가기 전에 연락처를 지운다.
    const userText = redactContacts(parsed.data.text);
    const history = windowed(conv.messages);
    const messages: AgentMessage[] = [
      ...history,
      // 바뀌는 요청서 상태는 맨 끝에 붙여 앞부분 캐시를 지킨다.
      { role: "user", content: `${userText}\n\n${sheetContext(conv.sheet)}` },
    ];

    return streamSSE(c, async (stream) => {
      const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
      let writes: Promise<void> = Promise.resolve();
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      try {
        await send("step", { label: conv.role === "cro" ? "요청 확인" : "요청서 확인" });
        const result = await provider.complete({
          system: SYSTEM[conv.role],
          messages,
          tools: TOOLS[conv.role],
          maxTokens: LIMITS.maxTokens,
          signal: abort.signal,
          onText: (delta) => {
            writes = writes.then(() => send("text", { delta }));
          },
        });
        await writes;

        const { conv: next, events, notes } = interpret(conv, result.toolCalls);
        for (const e of events) await send(e.event, e.data);

        const reply = [result.text.trim(), ...notes].filter(Boolean).join("\n") || "(응답 없음)";
        const saved: Conversation = {
          ...next,
          messages: [...conv.messages, { role: "user", content: userText }, { role: "assistant", content: reply }],
          turns: conv.turns + 1,
          usage: {
            inputTokens: conv.usage.inputTokens + result.usage.inputTokens,
            outputTokens: conv.usage.outputTokens + result.usage.outputTokens,
            cacheReadTokens: conv.usage.cacheReadTokens + (result.usage.cacheReadTokens ?? 0),
            cacheWriteTokens: conv.usage.cacheWriteTokens + (result.usage.cacheWriteTokens ?? 0),
          },
        };
        await deps.conversations.save(saved);

        if (result.stop !== "done") await send("error", { code: result.stop });
        await send("done", { usage: result.usage, turns: saved.turns });
      } catch (err) {
        // 본문·프롬프트는 남기지 않는다. 오류 종류만.
        const e = err as { status?: unknown; error?: { error?: { type?: unknown } } };
        console.error(
          "agent_turn_failed",
          err instanceof Error ? err.name : "unknown",
          typeof e.status === "number" ? e.status : "",
          typeof e.error?.error?.type === "string" ? e.error.error.type : "",
        );
        await writes.catch(() => undefined);
        await send("error", { code: "provider_error" });
      } finally {
        await deps.conversations.unlockTurn(conv.id).catch(() => undefined);
      }
    });
  });

  // 보내기 초안 만들기. 본문은 서버가 가진 점검 통과 본문만 쓰고, 앱이 보낸 본문은 받지 않는다.
  app.post("/conversations/:id/outbound", async (c) => {
    const s = c.get("session");
    const conv = await load(c.req.param("id"), s);
    if (!conv) return c.json({ error: "not_found" }, 404);
    const parsed = OutboundBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const d = conv.draft;
    if (!d) return c.json({ error: "no_draft" }, 409);
    // 사람이 본 판이 지금 판과 같아야 하고, 한 판에서 한 번만 만든다.
    if (parsed.data.version !== d.version) return c.json({ error: "stale_version" }, 409);
    if (d.outboundCreated) return c.json({ error: "already_created" }, 409);

    let recipients: string[];
    let text = d.body;
    let kind: OutboundDraft["kind"];
    if (conv.role === "requester") {
      if (!parsed.data.recipientOrgIds || parsed.data.quoteLines) return c.json({ error: "bad_request" }, 400);
      if (parsed.data.recipientOrgIds.includes(s.orgId)) return c.json({ error: "bad_request" }, 400);
      recipients = [...new Set(parsed.data.recipientOrgIds)];
      kind = "request";
    } else {
      if (parsed.data.recipientOrgIds) return c.json({ error: "bad_request" }, 400);
      const r = conv.requestId ? await deps.requests.forCro(conv.requestId, s.orgId) : null;
      if (!r) return c.json({ error: "not_found" }, 404);
      recipients = [r.requesterOrgId];
      kind = "reply";
      // 금액 줄은 코드가 계산해 붙인다.
      if (parsed.data.quoteLines?.length) text = `${d.body}\n\n${amountBlock(parsed.data.quoteLines)}`;
    }

    const drafts: OutboundDraft[] = recipients.map((counterpartyOrgId) => ({
      id: randomUUID(),
      orgId: s.orgId,
      counterpartyOrgId,
      kind,
      text,
      textHash: sha256(text),
      epoch: 1,
      status: "drafted",
    }));
    // 같은 판을 두 요청이 동시에 만들어도 저장소가 하나만 받는다.
    if (!(await deps.outbound.insertBatch(drafts, { conversationId: conv.id, version: d.version }))) {
      return c.json({ error: "already_created" }, 409);
    }
    await deps.conversations.save({ ...conv, draft: { ...d, outboundCreated: true } });
    return c.json(
      { outbound: drafts.map((od) => ({ id: od.id, counterpartyOrgId: od.counterpartyOrgId, text: od.text, epoch: od.epoch, textHash: od.textHash })) },
      201,
    );
  });

  return app;
}
