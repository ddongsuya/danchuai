// 탭 화면 틀(Muse 시안 2026-11-25): 위 막대(비서), 왼쪽 큰 제목, 본문. 아래 탭 막대는 탭 이동기가 그린다.
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui/Txt';
import { tokens } from '@/constants/theme';

import { AgentHeader } from './AgentHeader';

export function TabPage({ title, header, right, children, scroll = true }: { title?: string; header?: ReactNode; right?: ReactNode; children: ReactNode; scroll?: boolean }) {
  const head = (
    <>
      {title ? (
        <Txt variant="museTitle" accessibilityRole="header" style={styles.title}>
          {title}
        </Txt>
      ) : null}
    </>
  );
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {header ?? <AgentHeader right={right} />}
      {scroll ? (
        <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {head}
          {children}
        </ScrollView>
      ) : (
        <View style={styles.root}>
          {head}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  content: { paddingBottom: 24 },
  title: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 },
});
