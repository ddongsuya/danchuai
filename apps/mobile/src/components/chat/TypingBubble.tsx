// 답을 준비하는 동안 비서 말풍선에 점 셋이 차례로 통통 튄다(1초 주기, 0.12초 간격).
// 동작 줄이기가 켜지면 이동 없이 차례로 밝아지기만 한다.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';

import { Txt } from '@/components/ui/Txt';
import { radius, space, tokens, u } from '@/constants/theme';
import { KEEP, linear } from '@/lib/motion';

export function TypingBubble({ label }: { label?: string | null }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(0);
    t.set(withRepeat(withTiming(1, { duration: 1000, easing: linear, reduceMotion: KEEP }), -1, false, undefined, KEEP));
    return () => cancelAnimation(t);
  }, [t]);
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite" accessibilityLabel={label ? `${label}, 답 준비 중` : '답 준비 중'}>
      <View style={styles.bubble}>
        {[0, 1, 2].map((i) => (
          <Dot key={i} i={i} t={t} still={reduced} />
        ))}
      </View>
      {label ? (
        <Txt variant="caption" color={tokens.muted}>
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

function Dot({ i, t, still }: { i: number; t: SharedValue<number>; still: boolean }) {
  const style = useAnimatedStyle(() => {
    // 각 점은 자기 차례(0.12초씩 늦게)에 0.3초 동안 올라갔다 내려온다
    const p = (t.get() - i * 0.12 + 1) % 1;
    const up = p < 0.3 ? Math.sin((p / 0.3) * Math.PI) : 0;
    return { opacity: 0.35 + 0.65 * up, transform: [{ translateY: still ? 0 : -u(4) * up }] };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: u(5),
    height: u(40),
    paddingHorizontal: u(16),
    borderRadius: radius.bubble,
    borderBottomLeftRadius: u(6),
    backgroundColor: tokens.surface,
    borderWidth: 1,
    borderColor: tokens.border,
  },
  dot: { width: u(7), height: u(7), borderRadius: u(4), backgroundColor: tokens.muted },
});
