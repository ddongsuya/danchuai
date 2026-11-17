import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ToastProvider } from '@/components/ui/Toast';
import { Txt } from '@/components/ui/Txt';
import { AuthProvider, useAuth } from '@/lib/session';

import { fonts, space, tokens } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    [fonts.regular]: require('../../assets/fonts/WantedSans-Regular.otf'),
    [fonts.medium]: require('../../assets/fonts/WantedSans-Medium.otf'),
    [fonts.semibold]: require('../../assets/fonts/WantedSans-SemiBold.otf'),
    [fonts.bold]: require('../../assets/fonts/WantedSans-Bold.otf'),
  });

  if (!loaded && !error) return null;

  return (
    <AuthProvider>
      <ToastProvider>
        <StatusBar style="dark" />
        <Gate />
      </ToastProvider>
    </AuthProvider>
  );
}

// 로그인 상태에 따라 열 수 있는 화면을 정한다. 로그인이 꺼져 있으면(시연) 앱 화면만 연다.
function Gate() {
  const { status, blocked, refresh, signOut } = useAuth();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null;
  if (status === 'error') {
    return (
      <View style={styles.error}>
        <Txt variant="body">계정 정보를 불러오지 못했어요.</Txt>
        <Button title="다시 시도" onPress={refresh} />
        <Button title="로그아웃" kind="text" onPress={signOut} />
      </View>
    );
  }
  if (status === 'blocked') {
    return (
      <View style={styles.error}>
        <Txt variant="body">{blocked === 'org_not_ready' ? '단추에서 기관 승인이 끝나면 쓸 수 있어요.' : '이 계정은 에이전트를 쓰지 않아요.'}</Txt>
        <Button title="다시 확인" onPress={refresh} />
        <Button title="로그아웃" kind="text" onPress={signOut} />
      </View>
    );
  }
  const inApp = status === 'ready' || status === 'disabled';
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tokens.bg } }}>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'needsConsent'}>
        <Stack.Screen name="consent" />
      </Stack.Protected>
      {/* "/"는 항상 열고, 들어온 뒤 상태에 맞는 화면으로 보낸다(app/index.tsx). */}
      <Stack.Screen name="index" />
      {/* 움직임 기준 미리보기(예시 값만, 로그인 없이 열림) */}
      <Stack.Screen name="motion" />
      <Stack.Protected guard={inApp}>
        <Stack.Screen name="lab" />
        <Stack.Screen name="requester" />
        <Stack.Screen name="ask" />
        <Stack.Screen name="account" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  error: { flex: 1, backgroundColor: tokens.bg, justifyContent: 'center', padding: space.xxl, gap: space.md },
});
