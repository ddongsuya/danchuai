import pg from "pg";

// 서버 전용 DB 연결. 앱에는 이 연결 정보가 없다. 쿼리는 항상 org_id로 거르고(RLS를 우회하는 연결이므로),
// 앱의 직접 읽기는 Supabase RLS가 맡는다.
export type Pool = pg.Pool;

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000, statement_timeout: 15_000 });
  // 연결 오류 내용(접속 문자열 포함 가능)은 남기지 않는다.
  pool.on("error", (err) => console.error("pg_pool_error", err.name));
  return pool;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 트랜잭션 하나. 실패하면 되돌린다. */
export async function tx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}
