// 비서 캐릭터(시안 2026-11-20). 단추 마크(둥근 네 칸)를 얼굴로 쓴다. 윗 두 칸이 눈.
// - 쉬는 중: 천천히 떠 있고(위아래 3px, 3.2초) 4초마다 눈을 깜빡인다.
// - 생각 중: 네 칸이 시계 방향으로 차례로 밝아지고(나머지는 흐려짐), 얼굴 둘레에 청록 테가 생긴다(청록 = 에이전트가 일하는 중).
// - 동작 줄이기: 떠 있기·깜빡임·이동 없이, 생각 중일 때 칸의 밝기만 바뀐다.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { tokens } from '@/constants/theme';
import { KEEP, easeInOut, linear } from '@/lib/motion';

export type AvatarState = 'idle' | 'thinking';

/** 마크 칸 자리(0~100 좌표, 단추 MARK_PATH 와 같은 비율: 칸 40, 간격 7, 모서리 15). 시계 방향 */
const TILES = [
  { x: 6.5, y: 6.5 },
  { x: 53.5, y: 6.5 },
  { x: 53.5, y: 53.5 },
  { x: 6.5, y: 53.5 },
] as const;

export function AgentAvatar({ size, state = 'idle' }: { size: number; state?: AvatarState }) {
  const reduced = useReducedMotion();
  const float = useSharedValue(0);
  const blink = useSharedValue(1);
  const think = useSharedValue(0);
  const on = useSharedValue(state === 'thinking' ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    float.set(withRepeat(withTiming(1, { duration: 1600, easing: easeInOut, reduceMotion: KEEP }), -1, true, undefined, KEEP));
    return () => cancelAnimation(float);
  }, [reduced, float]);

  useEffect(() => {
    if (reduced || state === 'thinking') {
      cancelAnimation(blink);
      blink.set(1);
      return;
    }
    // 3.8초 기다렸다가 0.08초에 감고 0.12초에 뜬다
    blink.set(withRepeat(withSequence(withDelay(3800, withTiming(0.12, { duration: 80, reduceMotion: KEEP })), withTiming(1, { duration: 120, reduceMotion: KEEP })), -1, false, undefined, KEEP));
    return () => cancelAnimation(blink);
  }, [reduced, state, blink]);

  useEffect(() => {
    on.set(withTiming(state === 'thinking' ? 1 : 0, { duration: 240, reduceMotion: KEEP }));
    if (state !== 'thinking') {
      cancelAnimation(think);
      return;
    }
    think.set(0);
    think.set(withRepeat(withTiming(1, { duration: 1200, easing: linear, reduceMotion: KEEP }), -1, false, undefined, KEEP));
    return () => cancelAnimation(think);
  }, [state, think, on]);

  const body = useAnimatedStyle(() => ({
    transform: [{ translateY: reduced ? 0 : -3 * float.get() }],
    borderColor: interpolateColor(on.get(), [0, 1], [tokens.ink, tokens.accent]),
  }));
  const mark = size * 0.5;
  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2 }, styles.face, body]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={state === 'thinking' ? '비서, 생각하는 중' : '비서'}
    >
      <View style={{ width: mark, height: mark }}>
        {TILES.map((t, i) => (
          <Tile key={i} i={i} mark={mark} x={t.x} y={t.y} eye={i < 2} blink={blink} think={think} on={on} />
        ))}
      </View>
    </Animated.View>
  );
}

function Tile(p: { i: number; mark: number; x: number; y: number; eye: boolean; blink: SharedValue<number>; think: SharedValue<number>; on: SharedValue<number> }) {
  const side = (p.mark * 40) / 100;
  const style = useAnimatedStyle(() => {
    // 생각 중: 이 칸 차례(1/4 주기)에 가장 밝다
    const phase = (p.think.get() - p.i / 4 + 1) % 1;
    const lit = Math.max(0, 1 - Math.abs(phase - 0.125) * 4) * p.on.get();
    return {
      opacity: 1 - 0.7 * p.on.get() * (1 - lit),
      transform: [{ scaleY: p.eye ? p.blink.get() : 1 }],
    };
  });
  return <Animated.View style={[styles.tile, { left: (p.mark * p.x) / 100, top: (p.mark * p.y) / 100, width: side, height: side, borderRadius: (side * 15) / 40 }, style]} />;
}

const styles = StyleSheet.create({
  face: { backgroundColor: tokens.ink, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  tile: { position: 'absolute', backgroundColor: tokens.onInk },
});
