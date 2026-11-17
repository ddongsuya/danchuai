// 타이틀, 서브타이틀처럼 위에서부터 한 줄씩 들어오는 묶음. 줄마다 8px 올라오며 0.32초, 0.07초 간격.
import { Children, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { lineEnter } from '@/lib/motion';

export function StaggerLines({ children, start = 0, style }: { children: ReactNode; start?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  return (
    <View style={style}>
      {Children.toArray(children).map((child, i) => (
        <Animated.View key={i} entering={lineEnter(start + i, reduced)}>
          {child}
        </Animated.View>
      ))}
    </View>
  );
}
