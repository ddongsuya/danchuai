// 위 막대(시안 원본 m02 .hd): 위 14, 높이 92. 왼쪽 서랍 단추(42 흰 원), 가운데 비서 캐릭터 62 + 흰 이름표(이름 12 굵게, 아래 상태 11.5),
// 오른쪽은 화면마다(대화 탭은 "초대" 알약, 다른 탭은 42 흰 원, 없으면 빈 자리).
// 상태는 두세 단어 하나만: 일하는 중(회색) > 확인 필요(파랑, 누르면 볼 곳). 연결됨은 위 막대에 쓰지 않는다(시안 m04~m08). 연결 전만 회색으로.
import type { AgentCharacterId } from '@danchuai/core';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { MIcon } from '@/components/ui/MIcon';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, tokens } from '@/constants/theme';

import { useShell } from './ShellContext';

export type HeaderStatus = 'working' | 'check' | 'ok' | 'off';

/** 위 막대 상태 하나 고르기 */
export const headerStatus = (working: boolean, check: number, live: boolean): HeaderStatus => (working ? 'working' : check > 0 ? 'check' : live ? 'ok' : 'off');

/** 42 흰 원 단추(.circ) */
export function CircleButton({ label, onPress, children, disabled, bg }: { label: string; onPress: () => void; children: ReactNode; disabled?: boolean; bg?: string }) {
  return (
    <Press label={label} onPress={onPress} disabled={disabled} style={[styles.circle, bg ? { backgroundColor: bg } : null]}>
      {children}
    </Press>
  );
}

/** 42 흰 알약 단추(.pillr, "초대") */
export function PillButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Press label={title} onPress={onPress} style={styles.pill}>
      <Txt style={styles.pillText}>{title}</Txt>
    </Press>
  );
}

export function AgentHeader({ working = false, right, onMenu, onAgent }: { working?: boolean; right?: ReactNode; onMenu?: () => void; onAgent?: () => void }) {
  const shell = useShell();
  const status = headerStatus(working, shell.check, shell.live);
  return (
    <AgentHeaderView
      name={shell.agentName}
      character={shell.character}
      status={status}
      onMenu={onMenu ?? shell.openDrawer}
      onCheck={shell.onCheck}
      onAgent={onAgent ?? shell.openAgent}
      right={right}
    />
  );
}

/** 화면 모양만(미리보기에서도 쓴다) */
export function AgentHeaderView({ name, character, status, onMenu, onCheck, onAgent, right }: { name: string; character?: AgentCharacterId; status: HeaderStatus; onMenu: () => void; onCheck?: () => void; onAgent?: () => void; right?: ReactNode }) {
  const label = STATUS_LABEL[status];
  const mid = (
    <>
      <View style={styles.face}>
        <AgentAvatar size={62} character={character} state={status === 'working' ? 'thinking' : 'idle'} />
      </View>
      <View style={styles.tag}>
        <Txt style={styles.name} numberOfLines={1}>
          {name}
        </Txt>
        {label ? <StatusLine status={status} /> : null}
      </View>
    </>
  );
  const a11y = label ? `${name}, ${label}` : name;
  const onMid = status === 'check' && onCheck ? onCheck : onAgent;
  return (
    <View style={styles.wrap}>
      <View style={styles.hd}>
        {onMid ? (
          <Press label={a11y} onPress={onMid} style={styles.agent}>
            {mid}
          </Press>
        ) : (
          <View style={styles.agent} accessible accessibilityLabel={a11y}>
            {mid}
          </View>
        )}
        <View style={styles.left}>
          <CircleButton label="서랍 열기" onPress={onMenu}>
            <MIcon name="menu" />
          </CircleButton>
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const STATUS_LABEL: Record<HeaderStatus, string | null> = { working: '일하는 중', check: '확인 필요', ok: null, off: '연결 전' };

export function StatusLine({ status }: { status: HeaderStatus }) {
  const label = STATUS_LABEL[status];
  if (!label) return null;
  if (status === 'check') {
    return (
      <View style={styles.status}>
        <MIcon name="info" size={12} width={2.2} color={tokens.primary} />
        <Txt style={[styles.statusText, { color: tokens.primary }]}>{label}</Txt>
      </View>
    );
  }
  return (
    <View style={styles.status} accessibilityLiveRegion="polite">
      <Txt style={[styles.statusText, { color: tokens.muted }]}>{label}</Txt>
    </View>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 1 }, elevation: 2 } as const;

const styles = StyleSheet.create({
  // .hd: top 14, 좌우 14, 높이 92. 그 아래 내용은 위에서 118(대화)·120(쪽)부터
  wrap: { paddingTop: 14, paddingHorizontal: 14, height: 106 },
  hd: { height: 92 },
  left: { position: 'absolute', left: 0, top: 6 },
  right: { position: 'absolute', right: 0, top: 6 },
  agent: { position: 'absolute', left: 60, right: 60, top: 0, alignItems: 'center' },
  face: { marginTop: -5, marginBottom: -4 },
  // .nm: 위로 6 겹침, 흰 알약, 가로 10, 글 12 굵게, 줄 1.35
  tag: { marginTop: -6, backgroundColor: '#ffffff', borderRadius: 999, paddingVertical: 1, paddingHorizontal: 10, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  name: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16.2, color: tokens.text, textAlign: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  statusText: { fontFamily: fonts.semibold, fontSize: 11.5, lineHeight: 15.5 },
  circle: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', ...shadow },
  pill: { height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', ...shadow },
  pillText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: tokens.text },
});
