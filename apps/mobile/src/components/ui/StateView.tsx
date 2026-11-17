// 상태 화면 한 틀: 그림, 두 줄 안쪽 제목, 이유·할 일 한 문장, 버튼(주 버튼 하나 + 글자 버튼).
// 오류만 빨강 느낌표, 기다림은 호박 모래시계, 없음은 회색 상자, 끝남은 청록 체크(토스 결과 화면, Mobbin 0e4591f1).
// fill(화면 전체: 관문, 찾을 수 없음)은 진단 문서 A04·A14 반영안대로 왼쪽 정렬, 버튼은 바닥에 붙는다.
// 목록 안(요청 없음, 불러오기 실패)은 가운데 정렬 그대로.
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

/** 화면 전체일 때의 그림. 기다림은 호박 바탕 네모 안의 모래시계 */
const bigIcon: Record<StateTone, ReactNode> = {
  error: <WarningCircle size={40} weight="fill" color={tokens.danger} />,
  wait: (
    <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: tokens.waitSoft, alignItems: 'center', justifyContent: 'center' }}>
      <HourglassMedium size={30} color={tokens.wait} />
    </View>
  ),
  empty: <Tray size={36} color={tokens.muted} />,
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
  if (fill) {
    return (
      <View style={styles.screen} accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite">
        <Animated.View entering={lineEnter(0, reduced)} style={styles.left}>
          {bigIcon[tone]}
          <Txt variant="heading" style={styles.big} accessibilityRole="header">
            {title}
          </Txt>
          {reason ? (
            <Txt variant="body" color={tokens.muted}>
              {reason}
            </Txt>
          ) : null}
        </Animated.View>
        {actions ? <Animated.View entering={lineEnter(1, reduced)} style={styles.actions}>{actions}</Animated.View> : null}
      </View>
    );
  }
  return (
    <View style={styles.wrap} accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite">
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
  screen: { flex: 1, paddingHorizontal: space.xl, paddingBottom: space.md, backgroundColor: tokens.bg },
  left: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', gap: space.md, paddingBottom: 96 },
  big: { fontSize: 22, lineHeight: 30, marginTop: space.xs },
  mid: { alignItems: 'center', gap: space.md },
  title: { textAlign: 'center', fontSize: 20, lineHeight: 28 },
  center: { textAlign: 'center' },
  actions: { gap: space.sm },
});
