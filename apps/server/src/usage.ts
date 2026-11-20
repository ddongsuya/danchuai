// AI 이용량 상한 (2026-11-19). 계정별 하루, 조직(작업 공간)별 한 달, 서비스 전체 한 달.
// 턴 시작 전에 상한을 넘었는지 보고(429 usage_limit), 턴이 끝나면 쓴 토큰과 비용을 더한다.
// 동시에 여러 대화를 돌리면 한 턴만큼 넘을 수 있다(대화마다 턴 잠금이 있어 그 이상은 아니다).
// 비용은 공급사 단가(환경 변수)로 코드가 계산한다. 숫자만 남기고 본문은 남기지 않는다.
import type { Usage } from "@danchuai/core";
import type { Session } from "./auth";
import type { Pool } from "./db/pool";

/** 백만 토큰당 달러 */
export interface Prices {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** 백만분의 1달러. null 이면 그 상한은 쓰지 않는다 */
export interface Caps {
  userDay: number | null;
  orgMonth: number | null;
  allMonth: number | null;
}

export type CapScope = "user_day" | "org_month" | "all_month";

/**
 * 기본 단가는 Sonnet 급 공시 단가를 가정한 값이다(입력 3, 출력 15, 캐시 읽기 0.3, 캐시 쓰기 3.75 달러/백만 토큰).
 * 모델·단가가 바뀌면 AGENT_PRICE_* 로 맞춘다. 상한 기본값(하루 2달러, 기관 한 달 30달러, 전체 한 달 300달러)도
 * 시범 운영용 가정이라 AGENT_CAP_* 로 바꾼다. "off" 는 그 상한을 끈다.
 */
export const DEFAULT_PRICES: Prices = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };
export const DEFAULT_CAPS_USD = { userDay: 2, orgMonth: 30, allMonth: 300 } as const;

type Env = Record<string, string | undefined>;

function num(v: string | undefined, fallback: number): number {
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`숫자가 아니에요: ${v}`);
  return n;
}

function cap(v: string | undefined, fallbackUsd: number): number | null {
  if (v?.trim().toLowerCase() === "off") return null;
  return Math.round(num(v, fallbackUsd) * 1e6);
}

export function usageConfigFromEnv(env: Env): { prices: Prices; caps: Caps } {
  return {
    prices: {
      input: num(env.AGENT_PRICE_INPUT_PER_MTOK, DEFAULT_PRICES.input),
      output: num(env.AGENT_PRICE_OUTPUT_PER_MTOK, DEFAULT_PRICES.output),
      cacheRead: num(env.AGENT_PRICE_CACHE_READ_PER_MTOK, DEFAULT_PRICES.cacheRead),
      cacheWrite: num(env.AGENT_PRICE_CACHE_WRITE_PER_MTOK, DEFAULT_PRICES.cacheWrite),
    },
    caps: {
      userDay: cap(env.AGENT_CAP_USER_DAY_USD, DEFAULT_CAPS_USD.userDay),
      orgMonth: cap(env.AGENT_CAP_ORG_MONTH_USD, DEFAULT_CAPS_USD.orgMonth),
      allMonth: cap(env.AGENT_CAP_ALL_MONTH_USD, DEFAULT_CAPS_USD.allMonth),
    },
  };
}

/** 쓴 토큰의 비용(백만분의 1달러, 올림). inputTokens 는 캐시를 뺀 입력이다(Anthropic 응답 기준) */
export function costMicros(u: Usage, p: Prices): number {
  const usd =
    (u.inputTokens * p.input + u.outputTokens * p.output + (u.cacheReadTokens ?? 0) * p.cacheRead + (u.cacheWriteTokens ?? 0) * p.cacheWrite) / 1e6;
  return Math.ceil(usd * 1e6);
}

/** 한국 시간 기준 하루·한 달 */
export function periods(now: Date): { day: string; month: string } {
  const kst = new Date(now.getTime() + 9 * 3600_000).toISOString();
  return { day: kst.slice(0, 10), month: kst.slice(0, 7) };
}

export interface UsageKey {
  scope: string;
  period: string;
}

function keys(s: Session, now: Date): Record<CapScope, UsageKey> {
  const p = periods(now);
  return {
    user_day: { scope: `user:${s.userId}`, period: p.day },
    org_month: { scope: `org:${s.orgId}`, period: p.month },
    all_month: { scope: "all", period: p.month },
  };
}

export interface UsageRepo {
  /** 각 열쇠의 지금까지 비용(백만분의 1달러). 없으면 0 */
  costs(keys: UsageKey[]): Promise<number[]>;
  add(keys: UsageKey[], u: Usage, cost: number): Promise<void>;
}

export interface UsageMeter {
  /** 넘은 상한이 있으면 그 이름. 없으면 null */
  over(s: Session, now?: Date): Promise<CapScope | null>;
  record(s: Session, u: Usage, now?: Date): Promise<void>;
}

export function usageMeter(repo: UsageRepo, cfg: { prices: Prices; caps: Caps }): UsageMeter {
  const order: CapScope[] = ["user_day", "org_month", "all_month"];
  const capOf: Record<CapScope, number | null> = { user_day: cfg.caps.userDay, org_month: cfg.caps.orgMonth, all_month: cfg.caps.allMonth };
  return {
    async over(s, now = new Date()) {
      const k = keys(s, now);
      const active = order.filter((x) => capOf[x] !== null);
      if (!active.length) return null;
      const costs = await repo.costs(active.map((x) => k[x]));
      const i = active.findIndex((x, j) => costs[j]! >= capOf[x]!);
      return i < 0 ? null : active[i]!;
    },
    async record(s, u, now = new Date()) {
      const k = keys(s, now);
      await repo.add(order.map((x) => k[x]), u, costMicros(u, cfg.prices));
    },
  };
}

export class MemoryUsageRepo implements UsageRepo {
  rows = new Map<string, { cost: number; input: number; output: number }>();
  async costs(keys: UsageKey[]) {
    return keys.map((k) => this.rows.get(`${k.scope}|${k.period}`)?.cost ?? 0);
  }
  async add(keys: UsageKey[], u: Usage, cost: number) {
    for (const k of keys) {
      const id = `${k.scope}|${k.period}`;
      const r = this.rows.get(id) ?? { cost: 0, input: 0, output: 0 };
      this.rows.set(id, { cost: r.cost + cost, input: r.input + u.inputTokens, output: r.output + u.outputTokens });
    }
  }
  /** 탈퇴: 그 계정의 행만 지운다 */
  async forgetUser(userId: string) {
    for (const id of [...this.rows.keys()]) if (id.startsWith(`user:${userId}|`)) this.rows.delete(id);
  }
}

export class PgUsageRepo implements UsageRepo {
  constructor(private readonly pool: Pool) {}
  async costs(keys: UsageKey[]) {
    const { rows } = await this.pool.query<{ scope: string; period: string; cost_micros: string }>(
      `select scope, period, cost_micros from ai_usage where (scope, period) in (select * from unnest($1::text[], $2::text[]))`,
      [keys.map((k) => k.scope), keys.map((k) => k.period)],
    );
    return keys.map((k) => Number(rows.find((r) => r.scope === k.scope && r.period === k.period)?.cost_micros ?? 0));
  }
  async add(keys: UsageKey[], u: Usage, cost: number) {
    await this.pool.query(
      `insert into ai_usage (scope, period, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_micros)
       select s, p, $3, $4, $5, $6, $7 from unnest($1::text[], $2::text[]) as t(s, p)
       on conflict (scope, period) do update set
         input_tokens = ai_usage.input_tokens + excluded.input_tokens,
         output_tokens = ai_usage.output_tokens + excluded.output_tokens,
         cache_read_tokens = ai_usage.cache_read_tokens + excluded.cache_read_tokens,
         cache_write_tokens = ai_usage.cache_write_tokens + excluded.cache_write_tokens,
         cost_micros = ai_usage.cost_micros + excluded.cost_micros,
         updated_at = now()`,
      [keys.map((k) => k.scope), keys.map((k) => k.period), u.inputTokens, u.outputTokens, u.cacheReadTokens ?? 0, u.cacheWriteTokens ?? 0, cost],
    );
  }
}
