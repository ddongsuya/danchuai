// 로딩 표시. 한 바퀴 0.4초 등속 회전. 동작 줄이기가 켜지면 돌지 않고 1.2초 주기로 밝아졌다 흐려진다.
import { useEffect } from 'react';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { motion, tokens } from '@/constants/theme';
import { KEEP, linear } from '@/lib/motion';

export function Spinner({ size = 16, color = tokens.text }: { size?: number; color?: string }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);

  useEffect(() => {
    t.set(0);
    t.set(reduced
      ? withRepeat(withTiming(1, { duration: motion.ms.spinReduced / 2, easing: Easing.inOut(Easing.quad), reduceMotion: KEEP }), -1, true, undefined, KEEP)
      : withRepeat(withTiming(1, { duration: motion.ms.spin, easing: linear, reduceMotion: KEEP }), -1, false, undefined, KEEP));
    return () => cancelAnimation(t);
  }, [reduced, t]);

  const spin = useAnimatedStyle(() => (reduced ? { opacity: 0.35 + 0.65 * t.get() } : { transform: [{ rotate: `${t.get() * 360}deg` }] }));
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <Animated.View style={[{ width: size, height: size }, spin]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeOpacity={0.25} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c * 0.3} ${c}`} />
      </Svg>
    </Animated.View>
  );
}
