// 단추에서 실행할 동작 (연동 4·5단계). 사람이 확인 카드에서 승인한 동작만 단추로 보낸다.
// - 초안 본문은 단추로 보낼 JSON 그대로(키 정렬). 사람이 본 본문의 해시와 보낸 본문이 같다.
// - AI 도구로는 만들지 않는다. 앱이 사람이 고른 값으로 만든다.
// - 회사명·연락처 칸은 받지 않는다. 요청 접수 때 단추가 프로필에서 채운다.
import { z } from "zod";
import { RFQ_NO } from "./danchu";
import type { DanchuRole } from "./danchu";

export const ACTIONS = {
  requester: ["create", "ask", "answer"],
  cro: ["join", "decline", "ask", "answer", "quote_submit"],
} as const satisfies Record<DanchuRole, readonly string[]>;
export type DanchuActionName = (typeof ACTIONS)[DanchuRole][number];

const ALL = [...new Set([...ACTIONS.requester, ...ACTIONS.cro])] as [DanchuActionName, ...DanchuActionName[]];
const MAX_TEXT = 100_000;
/** 요청서에서 받지 않는 칸(단추가 프로필로 채움) */
const CONTACT_KEYS = ["company", "name", "dept", "phone", "email", "website"];

export const DanchuActionBody = z
  .object({
    action: z.enum(ALL),
    rfqNo: z.string().regex(RFQ_NO).optional(),
    body: z.record(z.string(), z.unknown()),
  })
  .strict();
export type DanchuAction = { action: DanchuActionName; rfqNo: string | null; body: Record<string, unknown> };

/** 키를 정렬한 JSON. 같은 동작은 늘 같은 문자열(같은 해시)이 된다 */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

export type Checked = { ok: true; action: DanchuAction; text: string } | { ok: false; error: "bad_request" | "forbidden" | "too_long" };

/** 역할에 맞는 동작인지, 번호가 필요한지 보고 본문 문자열을 만든다 */
export function checkAction(role: DanchuRole, input: unknown): Checked {
  const p = DanchuActionBody.safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const { action, rfqNo, body } = p.data;
  if (!(ACTIONS[role] as readonly string[]).includes(action)) return { ok: false, error: "forbidden" };
  if ((action === "create") === !!rfqNo) return { ok: false, error: "bad_request" };
  if ("action" in body) return { ok: false, error: "bad_request" };
  const clean = action === "create" ? Object.fromEntries(Object.entries(body).filter(([k]) => !CONTACT_KEYS.includes(k))) : body;
  const a: DanchuAction = { action, rfqNo: rfqNo ?? null, body: clean };
  const text = canonical(a);
  if (text.length > MAX_TEXT) return { ok: false, error: "too_long" };
  return { ok: true, action: a, text };
}

/** 승인된 본문을 다시 동작으로. 형식이 깨졌으면 null(보내지 않는다) */
export function parseActionText(text: string): DanchuAction | null {
  try {
    const v = JSON.parse(text) as { action?: unknown; rfqNo?: unknown; body?: unknown };
    const p = DanchuActionBody.safeParse({ action: v.action, body: v.body, ...(typeof v.rfqNo === "string" ? { rfqNo: v.rfqNo } : {}) });
    return p.success ? { action: p.data.action, rfqNo: p.data.rfqNo ?? null, body: p.data.body } : null;
  } catch {
    return null;
  }
}

/** 단추 응답 상태 → 장부 결과. 4xx는 확실한 거절(failed), 시간 초과·너무 잦음·5xx는 결과 불명 */
export function outcomeOf(status: number): "sent" | "failed" | "unknown" {
  if (status >= 200 && status < 300) return "sent";
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return "failed";
  return "unknown";
}
