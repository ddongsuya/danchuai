// 결과 블록: 일이 끝난 순간을 놓치지 않게 캡션 한 줄 대신 체크, "~했어요", 번호, 다음 행동 하나.
// 체크는 95%에서 0.24초 ease-out으로 커지고 글은 한 줄씩 올라온다. 동작 줄이기면 흐림 전환만.
// 할까요 → 할게요 → 했어요(토스 처리·결과 화면, Mobbin 169d9629·0e4591f1)
import { CheckCircle } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion, useReducedMotion, ZoomIn } from 'react-native-reanimated';

import { fonts, motion, radius, space, tokens } from '@/constants/theme';
import { easeOut, lineEnter } from '@/lib/motion';

import { Txt } from './Txt';

export function ResultBlock({ title, meta, action }: { title: string; meta?: string; action?: ReactNode }) {
  const reduced = useReducedMotion();
  const pop = reduced
    ? FadeIn.duration(motion.ms.reduced).reduceMotion(ReduceMotion.Never)
    : ZoomIn.duration(motion.ms.popIn).easing(easeOut).withInitialValues({ transform: [{ scale: motion.popTo }] }).reduceMotion(ReduceMotion.Never);
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <Animated.View entering={pop}>
        <CheckCircle size={36} weight="fill" color={tokens.accent} />
      </Animated.View>
      <Animated.View entering={lineEnter(1, reduced)} style={{ gap: 2 }}>
        <Txt variant="heading" style={styles.title} accessibilityRole="header">
          {title}
        </Txt>
        {meta ? (
          <Txt variant="small" color={tokens.muted} tabular>
            {meta}
          </Txt>
        ) : null}
      </Animated.View>
      {action ? <Animated.View entering={lineEnter(2, reduced)}>{action}</Animated.View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, padding: space.xl, gap: space.md },
  title: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 28 },
});
