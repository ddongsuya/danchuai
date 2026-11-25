// 위 막대 상태에 쓰는 숫자 읽기(2026-11-24, Muse 아바타 상태 패턴). 상태 줄 모양은 components/shell/AgentHeader.tsx.
// 보낸 것 가운데 결과를 봐야 하는 건수(확인 필요, 누르면 보낸 것)와 읽지 않은 소식 수.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { agentConfigured, listAlerts, listSent, type AgentRole } from '@/lib/agentClient';
import { unreadCount } from '@/lib/alerts';
import { needsLook } from '@/lib/sent';

/** 보낸 것 가운데 결과 확인 필요·받지 않음 건수. 읽지 못하면 0(첫 화면을 막지 않는다) */
export function useSentCheck(role: AgentRole, enabled = true): { check: number; onCheck: () => void } {
  const [check, setCheck] = useState(0);
  useEffect(() => {
    if (!enabled || !agentConfigured()) return;
    let live = true;
    listSent(role)
      .then((items) => live && setCheck(needsLook(items)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [role, enabled]);
  return { check, onCheck: () => router.push({ pathname: '/sent', params: { role } }) };
}

/** 읽지 않은 단추 알림 수(메뉴 숫자). 읽지 못하면 0 */
export function useUnreadAlerts(role: AgentRole, enabled = true): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled || !agentConfigured()) return;
    let live = true;
    listAlerts(role)
      .then((items) => live && setN(unreadCount(items)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [role, enabled]);
  return n;
}
