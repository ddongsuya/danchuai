// 팝업(확인 대화상자). 뒤가 어두워지고 90%에서 100%로 0.24초 ease-out. 닫을 때는 95%로 0.2초 ease-in.
// 동작 줄이기가 켜지면 크기 변화 없이 0.2초 흐림 전환만.
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { motion, radius, space, tokens } from '@/constants/theme';
import { KEEP, easeIn, easeOut } from '@/lib/motion';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ visible, onClose, children }: Props) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const shown = useSharedValue(0);
  const scale = useSharedValue<number>(motion.popFrom);

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      scale.set(reduced ? 1 : motion.popFrom);
      scale.set(withTiming(1, { duration: reduced ? 0 : motion.ms.popIn, easing: easeOut, reduceMotion: KEEP }));
      shown.set(withTiming(1, { duration: reduced ? motion.ms.reduced : motion.ms.popIn, easing: easeOut, reduceMotion: KEEP }));
      return;
    }
    const unmount = () => setMounted(false);
    if (!reduced) scale.set(withTiming(motion.popTo, { duration: motion.ms.popOut, easing: easeIn, reduceMotion: KEEP }));
    shown.set(withTiming(0, { duration: reduced ? motion.ms.reduced : motion.ms.popOut, easing: easeIn, reduceMotion: KEEP }, (finished) => {
      if (finished) scheduleOnRN(unmount);
    }));
  }, [visible, mounted, reduced, shown, scale]);

  const dim = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const pop = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ scale: scale.get() }] }));

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" />
      </Animated.View>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View style={[styles.card, pop]} accessibilityViewIsModal>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: tokens.overlay },
  center: { flex: 1, justifyContent: 'center', padding: space.xxl },
  card: { backgroundColor: tokens.surface, borderRadius: radius.approval, padding: space.xxl, maxWidth: 400, width: '100%', alignSelf: 'center' },
});
