// 바텀시트. 아래에서 0.32초 ease-out으로 올라오고 뒤는 0.24초에 걸쳐 어두워진다(막은 따로 흐림 전환).
// 닫을 때는 0.24초 ease-in으로 내려간 뒤 사라진다. 동작 줄이기가 켜지면 이동 없이 0.2초 흐림 전환만.
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { motion, tokens } from '@/constants/theme';
import { KEEP, easeIn, easeOut, easeOutSheet } from '@/lib/motion';

interface Props {
  visible: boolean;
  onClose: () => void;
  onShow?: () => void;
  children: ReactNode;
}

export function Sheet({ visible, onClose, onShow, children }: Props) {
  const reduced = useReducedMotion();
  const { height: screen } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const sheet = useSharedValue(0);
  const scrim = useSharedValue(0);
  const height = useSharedValue(screen);

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      scrim.set(withTiming(1, { duration: motion.ms.scrimIn, easing: easeOut, reduceMotion: KEEP }));
      sheet.set(withTiming(1, { duration: reduced ? motion.ms.reduced : motion.ms.sheetIn, easing: reduced ? easeOut : easeOutSheet, reduceMotion: KEEP }));
      return;
    }
    const unmount = () => setMounted(false);
    scrim.set(withTiming(0, { duration: motion.ms.sheetOut, easing: easeIn, reduceMotion: KEEP }));
    sheet.set(withTiming(0, { duration: reduced ? motion.ms.reduced : motion.ms.sheetOut, easing: easeIn, reduceMotion: KEEP }, (finished) => {
      if (finished) scheduleOnRN(unmount);
    }));
  }, [visible, mounted, reduced, scrim, sheet]);

  const dim = useAnimatedStyle(() => ({ opacity: scrim.get() }));
  const rise = useAnimatedStyle(() => (reduced ? { opacity: sheet.get() } : { transform: [{ translateY: (1 - sheet.get()) * (height.get() + 24) }] }));

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} onShow={onShow} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" />
      </Animated.View>
      <View style={styles.end} pointerEvents="box-none">
        <Animated.View
          style={rise}
          onLayout={(e) => {
            height.set(e.nativeEvent.layout.height);
          }}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: tokens.overlay },
  end: { flex: 1, justifyContent: 'flex-end' },
});
