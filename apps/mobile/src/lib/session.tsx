// 로그인 상태. 단추 계정(Supabase) 세션과 서버의 내 정보(/account/me, 단추에서 읽음)를 함께 본다.
// loading → signedOut(로그인 전) → needsConsent(국외 이전·AI 처리 동의 전) → ready
// blocked: 단추 계정이지만 에이전트를 쓸 수 없음(승인 전 기관, 운영자 계정)
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { AccountError, fetchMe, type AccountOrg } from './accountClient';
import { supabase } from './supabase';

export type AuthStatus = 'disabled' | 'loading' | 'signedOut' | 'recovery' | 'needsOrg' | 'needsConsent' | 'blocked' | 'ready' | 'error';
export type BlockedReason = 'org_not_ready' | 'plan_required' | 'forbidden';

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  org: AccountOrg | null;
  blocked: BlockedReason | null;
  /** 단추 계정 연동 모드. 보내기·선정 같은 일은 단추에서 실행한다(연동 4·5단계) */
  danchu: boolean;
  /** 국외 이전 동의 시각(ISO). 계정 화면에 날짜로 보인다 */
  consentAt: string | null;
  /** 동의한 판(철회할 때 보낸다) */
  consentVersion: string | null;
  /** 조직을 만들거나 참여한 뒤 다시 읽는다. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** 비밀번호 재설정 코드를 확인하는 동안에는 새 비밀번호 화면만 연다. */
  setRecovery: (on: boolean) => void;
}

const Ctx = createContext<AuthState>({
  status: 'disabled',
  session: null,
  org: null,
  blocked: null,
  danchu: false,
  consentAt: null,
  consentVersion: null,
  refresh: async () => undefined,
  signOut: async () => undefined,
  setRecovery: () => undefined,
});

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [org, setOrg] = useState<AccountOrg | null>(null);
  const [blocked, setBlocked] = useState<BlockedReason | null>(null);
  const [danchu, setDanchu] = useState(false);
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [consentVersion, setConsentVersion] = useState<string | null>(null);
  const [base, setStatus] = useState<AuthStatus>(supabase ? 'loading' : 'disabled');
  const [recovery, setRecovery] = useState(false);
  const status: AuthStatus = recovery ? 'recovery' : base;

  const load = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setOrg(null);
      setConsentAt(null);
      setConsentVersion(null);
      setStatus('signedOut');
      return;
    }
    try {
      const me = await fetchMe();
      setOrg(me.org);
      setDanchu(me.source === 'danchu');
      setConsentAt(me.consent?.agreedAt ?? null);
      setConsentVersion(me.consent?.version ?? null);
      setBlocked(null);
      if (!me.org) return setStatus('needsOrg');
      setStatus(me.source === 'danchu' && !me.consent ? 'needsConsent' : 'ready');
    } catch (e) {
      if (e instanceof AccountError && (e.code === 'org_not_ready' || e.code === 'plan_required' || e.code === 'forbidden')) {
        setBlocked(e.code);
        return setStatus('blocked');
      }
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) void load(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      // 토큰 갱신마다 조직을 다시 읽지 않는다.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void load(s);
      else setSession(s);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [load]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      session,
      org,
      blocked,
      danchu,
      consentAt,
      consentVersion,
      refresh: async () => load((await supabase?.auth.getSession())?.data.session ?? null),
      // 서버 로그아웃이 실패해도(연결 끊김 등) 기기의 세션은 지우고 바로 첫 화면으로 간다.
      signOut: async () => {
        if (!supabase) return;
        const { error } = await supabase.auth.signOut();
        if (error) await supabase.auth.signOut({ scope: 'local' });
        setRecovery(false);
        await load(null);
      },
      setRecovery,
    }),
    [status, session, org, blocked, danchu, consentAt, consentVersion, load],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
