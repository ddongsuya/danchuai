// 누를 수 있는 모든 요소의 공통 바탕. 눌리면 0.97로 줄어든다(애니메이션 없이 즉시, 매번 반복되는 동작이라).
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { hitSlop, motion } from '@/constants/theme';

interface Props extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  label: string;
}

export function Press({ style, label, disabled, ...rest }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={hitSlop}
      disabled={disabled}
      style={({ pressed }) => [style, pressed && { transform: [{ scale: motion.pressScale }] }, disabled && { opacity: 0.45 }]}
      {...rest}
    />
  );
}
