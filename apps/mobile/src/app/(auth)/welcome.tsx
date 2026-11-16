// 시작: 단추 계정으로 로그인. 가입은 단추 웹에서 한다(연동 2단계, 에이전트 전용 가입·Google 로그인 없음).
import { router } from 'expo-router';
import { ChatTeardropDots } from 'phosphor-react-native';
import { Linking, StyleSheet, View } from 'react-native';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { space, tokens } from '@/constants/theme';
import { DANCHU_URL } from '@/lib/danchuLinks';

const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? `${DANCHU_URL}/terms`;
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? `${DANCHU_URL}/privacy`;

export default function Welcome() {
  return (
    <AuthScreen
      top={
        <View style={styles.mark}>
          <ChatTeardropDots size={22} weight="bold" color={tokens.onInk} />
        </View>
      }
      footer={
        <>
          <Button title="단추 계정으로 로그인" tall onPress={() => router.push('/login')} />
          <Button title="단추에서 가입" kind="ghost" onPress={() => Linking.openURL(`${DANCHU_URL}/signup`)} />
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
