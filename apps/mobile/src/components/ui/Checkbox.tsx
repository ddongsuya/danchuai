// 체크 표시. 체크 선이 스스로 그려진다(0.28초 ease-in-out, 바탕이 먼저 채워지고 0.06초 뒤).
// 동작 줄이기가 켜지면 선은 바로 나타나고 바탕만 0.2초 흐림 전환.
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { motion, radius, space, tokens, u } from '@/constants/theme';
import { KEEP, easeIn, easeInOut } from '@/lib/motion';

import { Press } from './Press';
import { Txt } from './Txt';

const AnimatedPath = Animated.createAnimatedComponent(Path);
/** 아래 체크 선의 길이(약 19.8) */
const LEN = 20;

/** 선만 있는 체크. 선택 목록의 고른 항목 표시에 쓴다. */
export function CheckMark({ on, size = u(18), color = tokens.ink, strokeWidth = 2.4 }: { on: boolean; size?: number; color?: string; strokeWidth?: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(on ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      p.set(on ? 1 : 0);
      return;
    }
    p.set(on
      ? withDelay(motion.ms.checkDelay, withTiming(1, { duration: motion.ms.checkDraw, easing: easeInOut, reduceMotion: KEEP }))
      : withTiming(0, { duration: motion.ms.checkOff, easing: easeIn, reduceMotion: KEEP }));
  }, [on, reduced, p]);

  const draw = useAnimatedProps(() => ({ strokeDashoffset: LEN * (1 - p.get()) }));

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <AnimatedPath d="M5 12.5l4.5 4.5L19 7.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={LEN} animatedProps={draw} />
    </Svg>
  );
}

/** 네모 체크 상자와 이름표 */
export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  const reduced = useReducedMotion();
  const fill = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    fill.set(withTiming(checked ? 1 : 0, { duration: reduced ? motion.ms.reduced : motion.ms.checkFill, easing: easeInOut, reduceMotion: KEEP }));
  }, [checked, reduced, fill]);

  const box = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(fill.get(), [0, 1], [tokens.surface, tokens.ink]),
    borderColor: interpolateColor(fill.get(), [0, 1], [tokens.borderInput, tokens.ink]),
  }));

  return (
    <Press label={label} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={styles.row}>
      <Animated.View style={[styles.box, box]}>
        <CheckMark on={checked} size={u(16)} color={tokens.onInk} />
      </Animated.View>
      <Txt variant="body" style={{ flex: 1 }}>
        {label}
      </Txt>
    </Press>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: u(44) },
  box: { width: u(22), height: u(22), borderRadius: radius.inner / 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
