// 가입 단계 서버 호출(/account). 조직은 서버가 로그인 토큰의 사용자로만 찾는다.
import { fetch } from 'expo/fetch';

import { accessToken } from './supabase';

const BASE = process.env.EXPO_PUBLIC_AGENT_URL?.replace(/\/$/, '');

export interface AccountOrg {
  orgId: string;
  kind: 'requester' | 'cro';
  name: string;
  memberRole: 'owner' | 'member';
  displayName: string | null;
}

export class AccountError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  if (!BASE) throw new AccountError('not_configured', 0);
  const token = await accessToken();
  if (!token) throw new AccountError('unauthorized', 401);
  let res;
  try {
    res = await fetch(`${BASE}/account${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AccountError('network', 0);
  }
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new AccountError(json?.error ?? 'unknown', res.status);
  return json as T;
}

export const fetchMe = () => call<{ userId: string; email: string | null; org: AccountOrg | null }>('/me');
export const createOrg = (body: { kind: 'requester' | 'cro'; name: string; displayName: string }) => call<{ org: AccountOrg }>('/org', body);
export const joinOrg = (body: { code: string; displayName: string }) => call<{ org: AccountOrg }>('/join', body);
export const createInvite = () => call<{ code: string; expiresAt: string }>('/invites', {});
