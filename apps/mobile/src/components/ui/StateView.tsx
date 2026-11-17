// 상태 화면 한 틀: 그림, 두 줄 안쪽 제목, 이유·할 일 한 문장, 버튼(주 버튼 하나 + 글자 버튼).
// 오류만 빨강 느낌표, 기다림은 호박 모래시계, 없음은 회색 상자, 끝남은 청록 체크(토스 결과 화면, Mobbin 0e4591f1).
import { CheckCircle, HourglassMedium, Tray, WarningCircle } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { space, tokens } from '@/constants/theme';
import { lineEnter } from '@/lib/motion';

import { Txt } from './Txt';

export type StateTone = 'error' | 'wait' | 'empty' | 'done';

const icon: Record<StateTone, ReactNode> = {
  error: <WarningCircle size={40} weight="fill" color={tokens.danger} />,
  wait: <HourglassMedium size={40} weight="fill" color={tokens.wait} />,
  empty: <Tray size={40} color={tokens.muted} />,
  done: <CheckCircle size={40} weight="fill" color={tokens.accent} />,
};

interface Props {
  tone: StateTone;
  title: string;
  reason?: string;
  /** 버튼 자리(주 버튼 하나, 그 아래 글자 버튼) */
  actions?: ReactNode;
  /** 화면 전체를 채울지(관문·찾을 수 없음) */
  fill?: boolean;
}

export function StateView({ tone, title, reason, actions, fill }: Props) {
  const reduced = useReducedMotion();
  return (
    <View style={[styles.wrap, fill && styles.fill]} accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite">
      <Animated.View entering={lineEnter(0, reduced)} style={styles.mid}>
        {icon[tone]}
        <Txt variant="heading" style={styles.title} accessibilityRole="header">
          {title}
        </Txt>
        {reason ? (
          <Txt variant="small" color={tokens.muted} style={styles.center}>
            {reason}
          </Txt>
        ) : null}
      </Animated.View>
      {actions ? <Animated.View entering={lineEnter(1, reduced)} style={styles.actions}>{actions}</Animated.View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'stretch', gap: space.xl, paddingVertical: space.xxl },
  fill: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xxl, backgroundColor: tokens.bg },
  mid: { alignItems: 'center', gap: space.md },
  title: { textAlign: 'center', fontSize: 20, lineHeight: 28 },
  center: { textAlign: 'center' },
  actions: { gap: space.sm },
});
