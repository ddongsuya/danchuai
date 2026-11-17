// 로그인·가입 화면 공통 틀: 뒤로, 제목, 본문, 아래 버튼. 키보드가 올라오면 버튼도 함께 올라간다.
// 키보드가 떠 있는 동안에는 keyboardFooter(주 버튼 하나)를 키보드 바로 위 꽉 찬 막대로 둔다(토스 입력 화면, Mobbin 280b81aa).
import { router } from 'expo-router';
import { CaretLeft } from 'phosphor-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
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
  /** 키보드가 떠 있을 때 footer 대신 보일 주 버튼(Button bar) */
  keyboardFooter?: ReactNode;
}

/** 키보드가 떠 있는지. 웹에는 이 신호가 없어 늘 false */
function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const a = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setShown(true));
    const b = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setShown(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return shown;
}

export function AuthScreen({ title, back, top, children, footer, keyboardFooter }: Props) {
  const keyboard = useKeyboardShown();
  const bar = keyboard && keyboardFooter != null;
  return (
    <SafeAreaView style={styles.root} edges={bar ? ['top'] : ['top', 'bottom']}>
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
        {bar ? <View>{keyboardFooter}</View> : <View style={styles.foot}>{footer}</View>}
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
