// 비서 캐릭터(Muse 시안 2026-11-25). 사용자가 고른 캐릭터 그림(10종 중 하나)을 그대로 띄운다.
// - 쉬는 중: 천천히 떠 있다(위아래 크기의 4%, 3.2초 왕복).
// - 생각 중(일하는 중): 조금 더 빠르게 숨 쉬듯 커졌다 작아진다(1.0~1.05, 0.9초).
// - 동작 줄이기: 움직이지 않는다. 상태는 위 막대 글자("일하는 중")로 알린다.
import type { AgentCharacterId } from '@danchuai/core';
import { characterOf } from '@danchuai/core';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { CHARACTER_IMAGE } from '@/lib/characters';
import { KEEP, easeInOut } from '@/lib/motion';
import { useAuth } from '@/lib/session';

export type AvatarState = 'idle' | 'thinking';

export function AgentAvatar({ size, state = 'idle', character }: { size: number; state?: AvatarState; character?: AgentCharacterId }) {
  const auth = useAuth();
  const c = characterOf(character ?? auth.character);
  const reduced = useReducedMotion();
  const float = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduced || state === 'thinking') {
      cancelAnimation(float);
      float.set(0);
      return;
    }
    float.set(withRepeat(withTiming(1, { duration: 1600, easing: easeInOut, reduceMotion: KEEP }), -1, true, undefined, KEEP));
    return () => cancelAnimation(float);
  }, [reduced, state, float]);

  useEffect(() => {
    if (reduced || state !== 'thinking') {
      cancelAnimation(pulse);
      pulse.set(0);
      return;
    }
    pulse.set(withRepeat(withTiming(1, { duration: 450, easing: easeInOut, reduceMotion: KEEP }), -1, true, undefined, KEEP));
    return () => cancelAnimation(pulse);
  }, [reduced, state, pulse]);

  const body = useAnimatedStyle(() => ({ transform: [{ translateY: -size * 0.04 * float.get() }, { scale: 1 + 0.05 * pulse.get() }] }));
  return (
    <Animated.View
      style={[{ width: size, height: size }, body]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={state === 'thinking' ? `${c.name}, 일하는 중` : c.name}
    >
      <Image source={CHARACTER_IMAGE[c.id]} style={{ width: size, height: size }} contentFit="contain" accessibilityIgnoresInvertColors />
    </Animated.View>
  );
}
