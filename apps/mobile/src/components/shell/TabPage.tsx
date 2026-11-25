// 탭 화면 틀(시안 원본 .pg): 위 막대(비서), 쪽 제목(.h1 22), 본문(좌우 14). 아래 탭 막대는 탭 이동기가 그린다.
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { H1 } from '@/components/ui/Muse';
import { tokens } from '@/constants/theme';

import { AgentHeader } from './AgentHeader';

export function TabPage({ title, header, right, children, scroll = true }: { title?: string; header?: ReactNode; right?: ReactNode; children: ReactNode; scroll?: boolean }) {
  const head = (
    <>
      {title ? <H1>{title}</H1> : null}
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
        <View style={[styles.root, styles.fixed]}>
          {head}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  // .pg: 좌우 14, 위 120(위 막대 106 + 14)
  content: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24 },
  fixed: { flex: 1, paddingHorizontal: 14, paddingTop: 14 },
});
