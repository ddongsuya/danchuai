import { useEffect, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { motion, space, tokens } from '@/constants/theme';
import { KEEP, easeIn, easeOut } from '@/lib/motion';

import { NavBar } from './NavBar';

/** 대화 화면 틀. bottom 자리에 입력창이나 승인 카드가 들어간다. 승인 카드가 뜨면 대화는 0.24초에 걸쳐 흐려진다(투명도만이라 동작 줄이기에서도 같다). */
export function ChatShell({ title, children, bottom, dim }: { title: string; children: ReactNode; bottom: ReactNode; dim?: boolean }) {
  const o = useSharedValue(dim ? 0.45 : 1);
  useEffect(() => {
    o.set(withTiming(dim ? 0.45 : 1, { duration: dim ? motion.ms.scrimIn : motion.ms.popOut, easing: dim ? easeOut : easeIn, reduceMotion: KEEP }));
  }, [dim, o]);
  const fade = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <NavBar title={title} />
        <ScrollView
          style={styles.root}
          contentContainerStyle={styles.content}
          importantForAccessibility={dim ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={dim}
        >
          <Animated.View style={[styles.stack, fade]}>{children}</Animated.View>
        </ScrollView>
        <View style={styles.bottom}>{bottom}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  content: { paddingHorizontal: space.xl, paddingTop: 6, paddingBottom: space.lg },
  stack: { gap: 18 },
  bottom: { paddingBottom: space.md },
});
