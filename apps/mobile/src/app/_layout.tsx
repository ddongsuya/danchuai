import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { GateState } from '@/components/auth/GateState';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider, useAuth } from '@/lib/session';

import { fonts, tokens } from '@/constants/theme';

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
  if (status === 'error') return <GateState kind="error" onRetry={refresh} onSignOut={signOut} />;
  if (status === 'blocked') return <GateState kind={blocked === 'org_not_ready' || blocked === 'plan_required' ? blocked : 'unsupported'} onRetry={refresh} onSignOut={signOut} />;
  const inApp = status === 'ready' || status === 'disabled';
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tokens.bg } }}>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'needsConsent'}>
        <Stack.Screen name="consent" />
      </Stack.Protected>
      {/* 탭 묶음(대화·소식·맡길 일·할 일·자료)은 항상 열고, 들어온 뒤 상태에 맞는 화면으로 보낸다(app/(tabs)/_layout.tsx). */}
      <Stack.Screen name="(tabs)" />
      {/* 움직임 기준 미리보기(예시 값만, 로그인 없이 열림) */}
      <Stack.Screen name="motion" />
      {/* 화면 미리보기(예시 값만, 서버 없이, 로그인 없이 열림) */}
      <Stack.Screen name="preview" />
      <Stack.Protected guard={inApp}>
        <Stack.Screen name="lab" />
        <Stack.Screen name="requester" />
        <Stack.Screen name="ask" />
        <Stack.Screen name="sent" />
        <Stack.Screen name="alerts" />
        <Stack.Screen name="account" />
        <Stack.Screen name="agent" />
      </Stack.Protected>
    </Stack>
  );
}
