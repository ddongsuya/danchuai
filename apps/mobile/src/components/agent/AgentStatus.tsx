// 비서 캐릭터 밑 상태 줄(2026-11-24, Muse 아바타 상태 패턴). 지금 사람이 봐야 할 것 하나만 보인다.
// 일하는 중(청록) > 결과 확인 필요 n건(호박, 누르면 보낸 것). 볼 것이 없으면 아무것도 그리지 않는다.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { Press } from '@/components/ui/Press';
import { agentConfigured, listAlerts, listSent, type AgentRole } from '@/lib/agentClient';
import { unreadCount } from '@/lib/alerts';
import { needsLook } from '@/lib/sent';

export function AgentStatus({ working, check, onCheck }: { working?: boolean; check: number; onCheck?: () => void }) {
  if (working) return <Chip label="일하는 중" kind="accent" />;
  if (check <= 0) return null;
  const label = `결과 확인 필요 ${check}건`;
  return (
    <Press label={label} onPress={onCheck} style={styles.press}>
      <Chip label={label} kind="wait" />
    </Press>
  );
}

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

const styles = StyleSheet.create({
  press: { alignSelf: 'center' },
});
