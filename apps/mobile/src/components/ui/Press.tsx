// 누를 수 있는 모든 요소의 공통 바탕. 누르면 0.2초 동안 0.97로 줄고, 떼면 같은 속도로 돌아온다.
// 동작 줄이기가 켜져 있으면 크기는 그대로 둔다.
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { hitSlop, motion } from '@/constants/theme';
import { KEEP, easeOut } from '@/lib/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  label: string;
}

export function Press({ style, label, disabled, onPressIn, onPressOut, ...rest }: Props) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const to = (v: number) => {
    if (reduced) return;
    scale.set(withTiming(v, { duration: motion.ms.press, easing: easeOut, reduceMotion: KEEP }));
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={hitSlop}
      disabled={disabled}
      onPressIn={(e) => {
        to(motion.pressScale);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        onPressOut?.(e);
      }}
      style={[style, pressed, disabled && { opacity: 0.45 }]}
      {...rest}
    />
  );
}
