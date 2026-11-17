// 움직임 곡선과 줄 단위 등장. 값은 constants/theme.ts 의 motion.
import { Easing, FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { motion } from '@/constants/theme';

/** 들어올 때 */
export const easeOut = Easing.bezier(0.23, 1, 0.32, 1);
/** 바텀시트 들어올 때(iOS 시트 곡선) */
export const easeOutSheet = Easing.bezier(0.32, 0.72, 0, 1);
/** 나갈 때 */
export const easeIn = Easing.bezier(0.4, 0, 1, 1);
/** 제자리 변화(체크 그리기) */
export const easeInOut = Easing.bezier(0.77, 0, 0.175, 1);
export const linear = Easing.linear;

/**
 * 타이틀·서브타이틀·카드 줄을 한 줄씩 올린다. i 는 0부터.
 * 동작 줄이기가 켜지면 이동 없이 흐림 전환만.
 */
export function lineEnter(i = 0, reduced = false) {
  // 줄이 많아도 전체 등장이 0.6초를 넘지 않게 지연은 다섯 줄째에서 멈춘다.
  const delay = Math.min(i, 5) * motion.ms.stagger;
  if (reduced) return FadeIn.duration(motion.ms.reduced).delay(delay).reduceMotion(ReduceMotion.Never);
  return FadeInDown.duration(motion.ms.line)
    .delay(delay)
    .easing(easeOut)
    .withInitialValues({ opacity: 0, transform: [{ translateY: motion.lineRise }] })
    .reduceMotion(ReduceMotion.Never);
}

/**
 * 동작 줄이기 처리는 컴포넌트가 직접 한다(이동은 없애고 흐림 전환은 남김).
 * 그래서 Reanimated 기본값(System: 동작 줄이기면 즉시 끝냄)을 끄고 이 값을 넘긴다.
 */
export const KEEP = ReduceMotion.Never;
