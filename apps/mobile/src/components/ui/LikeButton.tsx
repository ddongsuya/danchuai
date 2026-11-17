// 좋아요(저장). 누르면 0.6에서 스프링으로 톡 튕겨 1로(약 1.07까지 넘쳤다가 0.4초 안에 멈춤).
// 해제는 채움만 0.2초 ease-in으로 빠진다. 동작 줄이기가 켜지면 크기는 그대로, 채움만 바뀐다.
import { Heart } from 'phosphor-react-native';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { motion, tokens, u } from '@/constants/theme';
import { KEEP, easeIn, easeOut } from '@/lib/motion';

import { Press } from './Press';

export function LikeButton({ liked, onChange, label }: { liked: boolean; onChange: (next: boolean) => void; label: string }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const fill = useSharedValue(liked ? 1 : 0);

  useEffect(() => {
    fill.set(withTiming(liked ? 1 : 0, liked ? { duration: reduced ? motion.ms.reduced : 0, easing: easeOut, reduceMotion: KEEP } : { duration: motion.ms.toastOut, easing: easeIn, reduceMotion: KEEP }));
  }, [liked, reduced, fill]);

  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const filled = useAnimatedStyle(() => ({ opacity: fill.get() }));

  return (
    <Press
      label={label}
      accessibilityState={{ selected: liked }}
      onPress={() => {
        const next = !liked;
        if (next && !reduced) scale.set(withSequence(withTiming(motion.likeFrom, { duration: 0 }), withSpring(1, motion.like)));
        onChange(next);
      }}
      style={styles.hit}
    >
      <Animated.View style={pop}>
        <Heart size={u(24)} color={tokens.muted} />
        <Animated.View style={[StyleSheet.absoluteFill, filled]}>
          <Heart size={u(24)} weight="fill" color={tokens.ink} />
        </Animated.View>
      </Animated.View>
    </Press>
  );
}

const styles = StyleSheet.create({ hit: { width: u(44), height: u(44), alignItems: 'center', justifyContent: 'center' } });
