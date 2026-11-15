// 시작: Google, 이메일 회원가입, 로그인
import { router } from 'expo-router';
import { ChatTeardropDots, GoogleLogo } from 'phosphor-react-native';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { space, tokens } from '@/constants/theme';
import { signInWithGoogle } from '@/lib/googleSignIn';

const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL;
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL;

export default function Welcome() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const google = async () => {
    setBusy(true);
    setError(null);
    const r = await signInWithGoogle();
    setBusy(false);
    if (r === 'error') setError('Google 로그인을 마치지 못했어요. 다시 해 주세요.');
  };

  return (
    <AuthScreen
      top={
        <View style={styles.mark}>
          <ChatTeardropDots size={22} weight="bold" color={tokens.onInk} />
        </View>
      }
      footer={
        <>
          {error && (
            <Txt variant="small" color={tokens.danger} style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
              {error}
            </Txt>
          )}
          <Button title="Google로 계속" kind="line" tall loading={busy} icon={<GoogleLogo size={18} weight="bold" color={tokens.text} />} onPress={google} />
          <Button title="이메일로 회원가입" tall onPress={() => router.push('/signup')} />
          <Button title="이미 계정이 있어요" kind="ghost" onPress={() => router.push('/login')} />
          {(TERMS_URL || PRIVACY_URL) && (
            <View style={styles.legal}>
              {TERMS_URL && (
                <Txt variant="caption" color={tokens.muted} style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL(TERMS_URL)}>
                  이용약관
                </Txt>
              )}
              {PRIVACY_URL && (
                <Txt variant="caption" color={tokens.muted} style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_URL)}>
                  개인정보 처리방침
                </Txt>
              )}
            </View>
          )}
        </>
      }
    >
      <View style={{ gap: space.sm, marginTop: -space.xl }}>
        <Txt variant="title" accessibilityRole="header">
          견적 에이전트
        </Txt>
        <Txt variant="body" color={tokens.muted}>
          비임상 견적을 대화로 맡겨요
        </Txt>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  mark: { width: 44, height: 44, borderRadius: 14, backgroundColor: tokens.ink, alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  legal: { flexDirection: 'row', justifyContent: 'center', gap: space.md },
  link: { textDecorationLine: 'underline' },
});
