import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { space, tokens } from '@/constants/theme';

import { NavBar } from './NavBar';

/** 대화 화면 틀. bottom 자리에 입력창이나 승인 카드가 들어간다. 승인 카드가 뜨면 대화는 흐리게(dim). */
export function ChatShell({ title, children, bottom, dim }: { title: string; children: ReactNode; bottom: ReactNode; dim?: boolean }) {
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
          <View style={[styles.stack, dim && { opacity: 0.45 }]}>{children}</View>
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
