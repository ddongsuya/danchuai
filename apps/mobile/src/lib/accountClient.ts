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

export interface Me {
  /** danchu: 단추 계정으로 로그인(연동 2단계) */
  source?: 'danchu';
  userId: string;
  email: string | null;
  org: AccountOrg | null;
  consent?: { version: string; agreedAt: string } | null;
  consentVersion?: string;
}
export const fetchMe = () => call<Me>('/me');
/** 국외 이전·AI 처리 동의. 서버가 판(version)을 확인한다 */
export const agreeConsent = (version: string) => call<{ consent: { version: string; agreedAt: string } }>('/consent', { version });
/** 동의 철회(처리방침 3항). 단추에 철회를 남기고 에이전트의 대화·초안·실행 기록을 지운다. 단추 계정은 그대로 */
export const revokeConsent = (version: string) => call<{ revoked: { version: string } }>('/consent/revoke', { version });
