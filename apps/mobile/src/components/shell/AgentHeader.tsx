// 위 막대(Muse 시안 2026-11-25): 왼쪽 서랍 단추, 가운데 비서 캐릭터 + 이름 + 상태, 오른쪽은 화면마다(없으면 빈 자리).
// 상태는 두세 단어 하나만: 일하는 중 > 확인 필요(파랑, 누르면 볼 곳) > 연결됨(초록 점) / 연결 전.
import type { AgentCharacterId } from '@danchuai/core';
import { Info, List } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { tokens } from '@/constants/theme';

import { useShell } from './ShellContext';

export type HeaderStatus = 'working' | 'check' | 'ok' | 'off';

/** 위 막대 상태 하나 고르기 */
export const headerStatus = (working: boolean, check: number, live: boolean): HeaderStatus => (working ? 'working' : check > 0 ? 'check' : live ? 'ok' : 'off');

export function CircleButton({ label, onPress, children, disabled }: { label: string; onPress: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <Press label={label} onPress={onPress} disabled={disabled} style={styles.circle}>
      {children}
    </Press>
  );
}

export function AgentHeader({ working = false, right, onMenu, onAgent }: { working?: boolean; right?: ReactNode; onMenu?: () => void; onAgent?: () => void }) {
  const shell = useShell();
  const status = headerStatus(working, shell.check, shell.live);
  return <AgentHeaderView name={shell.agentName} character={shell.character} status={status} onMenu={onMenu ?? shell.openDrawer} onCheck={shell.onCheck} onAgent={onAgent} right={right} />;
}

/** 화면 모양만(미리보기에서도 쓴다) */
export function AgentHeaderView({ name, character, status, onMenu, onCheck, onAgent, right }: { name: string; character?: AgentCharacterId; status: HeaderStatus; onMenu: () => void; onCheck?: () => void; onAgent?: () => void; right?: ReactNode }) {
  const label = STATUS_LABEL[status];
  const mid = (
    <>
      <AgentAvatar size={44} character={character} state={status === 'working' ? 'thinking' : 'idle'} />
      <Txt variant="museName" numberOfLines={1}>
        {name}
      </Txt>
      <StatusLine status={status} />
    </>
  );
  return (
    <View style={styles.bar}>
      <CircleButton label="서랍 열기" onPress={onMenu}>
        <List size={20} color={tokens.text} />
      </CircleButton>
      {status === 'check' && onCheck ? (
        <Press label={`${name}, ${label}`} onPress={onCheck} style={styles.mid}>
          {mid}
        </Press>
      ) : onAgent ? (
        <Press label={`${name}, ${label}`} onPress={onAgent} style={styles.mid}>
          {mid}
        </Press>
      ) : (
        <View style={styles.mid} accessible accessibilityLabel={`${name}, ${label}`}>
          {mid}
        </View>
      )}
      <View style={styles.side}>{right}</View>
    </View>
  );
}

const STATUS_LABEL: Record<HeaderStatus, string> = { working: '일하는 중', check: '확인 필요', ok: '연결됨', off: '연결 전' };

export function StatusLine({ status }: { status: HeaderStatus }) {
  const label = STATUS_LABEL[status];
  if (status === 'check') {
    return (
      <View style={styles.status}>
        <Info size={12} weight="bold" color={tokens.primary} />
        <Txt variant="museStatus" color={tokens.primary}>
          {label}
        </Txt>
      </View>
    );
  }
  return (
    <View style={styles.status} accessibilityLiveRegion="polite">
      {status === 'ok' && <View style={styles.dot} />}
      <Txt variant="museStatus" color={tokens.muted}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.border,
    shadowColor: tokens.ink,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  mid: { flex: 1, alignItems: 'center', gap: 2 },
  side: { minWidth: 44, alignItems: 'flex-end' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 15 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: tokens.ok },
});
