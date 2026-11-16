// 단추(danchu.kr) 에이전트 입구(/api/agent/*) 호출. 단추가 원장이다: 계정·역할·기관·요청·견적은 여기서만 읽는다.
// 사용자의 단추 로그인 토큰을 그대로 넘긴다. 서비스 키는 쓰지 않는다. 응답 본문·토큰은 로그에 남기지 않는다.

export type DanchuRole = "requester" | "cro";

export interface DanchuMe {
  id: string;
  role: DanchuRole;
  name: string | null;
  email: string;
  org: { id: string; name: string; plan: string | null } | null;
}

/** 단추 의뢰자 요청 목록 한 줄 (단추 lib/agent-api.ts requesterItem) */
export interface DanchuRequesterItem {
  no: string;
  title: string;
  categories: string[];
  status: string;
  createdAt: string;
  joinBy: string | null;
  replyBy: string | null;
  sent: number;
  joined: number;
  submitted: number;
  compareOpen: boolean;
  selected: boolean;
}

/** 단추 기관 받은 요청 한 줄 (단추 lib/agent-api.ts croItem). 선정 전 client는 null */
export interface DanchuCroItem {
  no: string;
  title: string;
  categories: string;
  client: string | null;
  clientHint: string;
  group: "todo" | "decide" | "work" | "sent" | "won" | "done";
  stage: string;
  next: string;
  due: string | null;
  steps: { label: string; at: string; state: "done" | "now" | "next" }[];
  money: [string, string][];
}

export type DanchuCompare =
  | { open: false; joined: number; submitted: number; replyBy: string | null }
  | { open: true; columns: { lab: string; total: number | null; weeks: number | null; submittedAt: string | null }[] };

export type DanchuError = "unauthorized" | "forbidden" | "org_not_ready" | "not_found" | "rate_limited" | "unavailable";

export type DanchuResult<T> = { ok: true; data: T } | { ok: false; error: DanchuError };

export interface DanchuApi {
  me(token: string): Promise<DanchuResult<DanchuMe>>;
  requesterList(token: string): Promise<DanchuResult<DanchuRequesterItem[]>>;
  requesterDetail(token: string, no: string): Promise<DanchuResult<{ request: DanchuRequesterItem; compare: DanchuCompare }>>;
  croList(token: string): Promise<DanchuResult<DanchuCroItem[]>>;
  croDetail(token: string, no: string): Promise<DanchuResult<DanchuCroItem>>;
}

const ERRORS: DanchuError[] = ["unauthorized", "forbidden", "org_not_ready", "not_found", "rate_limited", "unavailable"];
export const RFQ_NO = /^DC-\d{4}-\d{4,6}$/;

/** 단추 주소. 운영은 https만 받는다. 없으면 danchu.kr */
export function danchuBaseFromEnv(env: Record<string, string | undefined>): string {
  const base = (env.DANCHU_API_URL ?? "https://danchu.kr").replace(/\/$/, "");
  if (env.NODE_ENV === "production" && !/^https:\/\/[a-z0-9.-]+$/.test(base)) throw new Error("DANCHU_API_URL은 https 주소여야 해요");
  return base;
}

export function danchuApi(base: string, fetchImpl: typeof fetch = fetch, timeoutMs = 8000): DanchuApi {
  async function get<T>(token: string, path: string): Promise<DanchuResult<T>> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { ok: false, error: "unavailable" };
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const code = typeof body?.error === "string" && (ERRORS as string[]).includes(body.error) ? (body.error as DanchuError) : res.status === 401 ? "unauthorized" : res.status === 404 ? "not_found" : "unavailable";
      return { ok: false, error: code };
    }
    if (!body) return { ok: false, error: "unavailable" };
    return { ok: true, data: body as T };
  }
  const pick = <T, K extends string>(r: DanchuResult<Record<K, T>>, key: K): DanchuResult<T> => (r.ok ? { ok: true, data: r.data[key] } : r);
  return {
    me: async (t) => pick(await get<{ me: DanchuMe }>(t, "/api/agent/me"), "me"),
    requesterList: async (t) => pick(await get<{ requests: DanchuRequesterItem[] }>(t, "/api/agent/requests"), "requests"),
    requesterDetail: (t, no) => get(t, `/api/agent/requests/${encodeURIComponent(no)}`),
    croList: async (t) => pick(await get<{ requests: DanchuCroItem[] }>(t, "/api/agent/requests"), "requests"),
    croDetail: async (t, no) => pick(await get<{ request: DanchuCroItem }>(t, `/api/agent/requests/${encodeURIComponent(no)}`), "request"),
  };
}
