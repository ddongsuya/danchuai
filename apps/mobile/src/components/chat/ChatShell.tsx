import { useEffect, useRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { motion, space, tokens } from '@/constants/theme';
import { KEEP, easeIn, easeOut } from '@/lib/motion';

import { NavBar } from './NavBar';

/** 대화 화면 틀. bottom 자리에 입력창이나 승인 카드가 들어간다. 승인 카드가 뜨면 대화는 0.24초에 걸쳐 흐려진다(투명도만이라 동작 줄이기에서도 같다). */
export function ChatShell({
  title,
  children,
  bottom,
  dim,
  nav,
  flushBottom,
  tabs,
}: {
  title: string;
  children: ReactNode;
  bottom: ReactNode;
  dim?: boolean;
  /** 기본 뒤로 가기 막대 대신 쓸 위 막대(비서 홈) */
  nav?: ReactNode;
  /** bottom 이 화면 아래 끝까지 닿는다(질문 카드). 아래 안전 영역은 bottom 이 직접 띄운다 */
  flushBottom?: boolean;
  /** 탭 안의 대화(Muse 시안 2026-11-25): 아래 안전 영역은 탭 막대가 맡는다 */
  tabs?: boolean;
}) {
  const o = useSharedValue(dim ? 0.45 : 1);
  useEffect(() => {
    o.set(withTiming(dim ? 0.45 : 1, { duration: dim ? motion.ms.scrimIn : motion.ms.popOut, easing: dim ? easeOut : easeIn, reduceMotion: KEEP }));
  }, [dim, o]);
  const fade = useAnimatedStyle(() => ({ opacity: o.get() }));
  // 새 말풍선·확인 카드가 붙으면 맨 아래로(대화는 아래에서 자란다)
  const scroll = useRef<ScrollViewInstance>(null);
  return (
    <SafeAreaView style={styles.root} edges={flushBottom || tabs ? ['top'] : ['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {nav ?? <NavBar title={title} />}
        <ScrollView
          ref={scroll}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
          style={styles.root}
          contentContainerStyle={styles.content}
          importantForAccessibility={dim ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={dim}
        >
          <Animated.View style={[styles.stack, fade]}>{children}</Animated.View>
        </ScrollView>
        <View style={tabs ? styles.tabBottom : !flushBottom && styles.bottom}>{bottom}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  // 시안 원본 .feed: 좌우 14, 위 막대(106) 아래 12부터, 줄 사이 10
  content: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: space.lg },
  stack: { gap: 10 },
  bottom: { paddingBottom: space.md },
  tabBottom: { paddingBottom: 0 },
});
