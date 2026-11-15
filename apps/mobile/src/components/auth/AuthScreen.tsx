// 로그인·가입 화면 공통 틀: 뒤로, 제목, 본문, 아래 버튼. 키보드가 올라오면 버튼도 함께 올라간다.
import { router } from 'expo-router';
import { CaretLeft } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/IconButton';
import { Txt } from '@/components/ui/Txt';
import { space, tokens } from '@/constants/theme';

interface Props {
  title?: string;
  back?: boolean;
  top?: ReactNode;
  children?: ReactNode;
  footer: ReactNode;
}

export function AuthScreen({ title, back, top, children, footer }: Props) {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.nav}>
          {back && (
            <IconButton label="뒤로" plain onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}>
              <CaretLeft size={20} color={tokens.text} />
            </IconButton>
          )}
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" bounces={false}>
          {top}
          {title && (
            <Txt variant="title" accessibilityRole="header">
              {title}
            </Txt>
          )}
          {children}
        </ScrollView>
        <View style={styles.foot}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  nav: { height: 60, paddingHorizontal: 14, paddingTop: 6, justifyContent: 'center' },
  body: { flexGrow: 1, paddingHorizontal: space.xxl, paddingTop: space.xl, gap: space.xxl },
  foot: { paddingHorizontal: space.xxl, paddingTop: space.lg, paddingBottom: space.lg, gap: 10 },
});
