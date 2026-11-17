// 버튼 처리 중 표시. 점 셋이 차례로 밝아진다(0.9초 주기). 동작 줄이기가 켜지면 움직이지 않는 점 셋.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';

import { motion } from '@/constants/theme';
import { KEEP, linear } from '@/lib/motion';

export function Dots({ color }: { color: string }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.set(0);
    t.set(withRepeat(withTiming(1, { duration: motion.ms.dots, easing: linear, reduceMotion: KEEP }), -1, false, undefined, KEEP));
    return () => cancelAnimation(t);
  }, [reduced, t]);
  return (
    <View style={styles.row} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {[0, 1, 2].map((i) => (
        <Dot key={i} i={i} t={t} color={color} still={reduced} />
      ))}
    </View>
  );
}

function Dot({ i, t, color, still }: { i: number; t: SharedValue<number>; color: string; still: boolean }) {
  const style = useAnimatedStyle(() => {
    if (still) return { opacity: 0.8 };
    // 세 점이 1/3 주기씩 늦게 밝아진다
    const p = (t.get() - i / 3 + 1) % 1;
    return { opacity: 0.3 + 0.7 * Math.max(0, 1 - Math.abs(p - 0.25) * 4) };
  });
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
