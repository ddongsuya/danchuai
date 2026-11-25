// 로그인 상태. 단추 계정(Supabase) 세션과 서버의 내 정보(/account/me, 단추에서 읽음)를 함께 본다.
// loading → signedOut(로그인 전) → needsConsent(국외 이전·AI 처리 동의 전) → ready
// blocked: 단추 계정이지만 에이전트를 쓸 수 없음(승인 전 기관, 운영자 계정)
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { DEFAULT_CHARACTER, characterOf, isCharacterId, type AgentCharacterId } from '@danchuai/core';

import { AccountError, DEFAULT_PREFS, fetchMe, saveCharacter, savePrefs, type AccountOrg, type AgentPrefs } from './accountClient';
import { authStorage } from './storage';
import { supabase } from './supabase';

/** 시연 모드(로그인 꺼짐)에서 고른 캐릭터를 기기에 둔다. 로그인하면 서버(계정별)가 원본 */
const DEMO_CHARACTER_KEY = 'danchuai.character';

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
  /** 고른 비서 캐릭터(계정별). 이름도 이 캐릭터 이름을 쓴다 */
  character: AgentCharacterId;
  /** 캐릭터를 바꾼다. 화면에 먼저 바꾸고, 서버 저장이 안 되면 되돌리고 오류를 던진다 */
  setCharacter: (id: AgentCharacterId) => Promise<void>;
  /** 권한·목표 */
  prefs: AgentPrefs;
  /** 권한·목표를 바꾼다. 화면에 먼저 바꾸고, 서버 저장이 안 되면 되돌리고 오류를 던진다 */
  setPrefs: (patch: Partial<AgentPrefs>) => Promise<void>;
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
  character: DEFAULT_CHARACTER,
  setCharacter: async () => undefined,
  prefs: DEFAULT_PREFS,
  setPrefs: async () => undefined,
  refresh: async () => undefined,
  signOut: async () => undefined,
  setRecovery: () => undefined,
});

export const useAuth = () => useContext(Ctx);

/** 고른 비서 캐릭터의 이름 */
export const useAgentName = () => characterOf(useContext(Ctx).character).name;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [org, setOrg] = useState<AccountOrg | null>(null);
  const [blocked, setBlocked] = useState<BlockedReason | null>(null);
  const [danchu, setDanchu] = useState(false);
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [consentVersion, setConsentVersion] = useState<string | null>(null);
  const [character, setCharacterState] = useState<AgentCharacterId>(() => {
    // 시연 모드는 기기에 둔 값을 쓴다
    if (supabase) return DEFAULT_CHARACTER;
    try {
      const v = authStorage?.getItem(DEMO_CHARACTER_KEY);
      return isCharacterId(v) ? v : DEFAULT_CHARACTER;
    } catch {
      return DEFAULT_CHARACTER;
    }
  });
  const [prefs, setPrefsState] = useState<AgentPrefs>(DEFAULT_PREFS);
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
      setCharacterState(isCharacterId(me.character) ? me.character : DEFAULT_CHARACTER);
      setPrefsState({ ...DEFAULT_PREFS, ...me.prefs });
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
      character,
      setCharacter: async (id) => {
        const prev = character;
        setCharacterState(id);
        if (!supabase) {
          try {
            authStorage?.setItem(DEMO_CHARACTER_KEY, id);
          } catch {
            // 기기에 못 남겨도 이번 실행에서는 바뀐 채로 둔다
          }
          return;
        }
        try {
          await saveCharacter(id);
        } catch (e) {
          setCharacterState(prev);
          throw e;
        }
      },
      prefs,
      setPrefs: async (patch) => {
        const prev = prefs;
        setPrefsState({ ...prefs, ...patch });
        // 시연 모드는 이번 실행에서만 바꾼다
        if (!supabase) return;
        try {
          setPrefsState(await savePrefs(patch));
        } catch (e) {
          setPrefsState(prev);
          throw e;
        }
      },
    }),
    [status, session, org, blocked, danchu, consentAt, consentVersion, character, prefs, load],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
