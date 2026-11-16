// 로그인 상태. Supabase 세션과 서버의 내 조직(/account/me)을 함께 본다.
// loading → signedOut(로그인 전) → needsOrg(조직 없음) → ready
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { fetchMe, type AccountOrg } from './accountClient';
import { supabase } from './supabase';

export type AuthStatus = 'disabled' | 'loading' | 'signedOut' | 'recovery' | 'needsOrg' | 'ready' | 'error';

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  org: AccountOrg | null;
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
  refresh: async () => undefined,
  signOut: async () => undefined,
  setRecovery: () => undefined,
});

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [org, setOrg] = useState<AccountOrg | null>(null);
  const [base, setStatus] = useState<AuthStatus>(supabase ? 'loading' : 'disabled');
  const [recovery, setRecovery] = useState(false);
  const status: AuthStatus = recovery ? 'recovery' : base;

  const load = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setOrg(null);
      setStatus('signedOut');
      return;
    }
    try {
      const me = await fetchMe();
      setOrg(me.org);
      setStatus(me.org ? 'ready' : 'needsOrg');
    } catch {
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
    [status, session, org, load],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
