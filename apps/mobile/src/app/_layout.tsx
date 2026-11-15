import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { fonts, tokens } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    [fonts.regular]: require('../../assets/fonts/WantedSans-Regular.otf'),
    [fonts.medium]: require('../../assets/fonts/WantedSans-Medium.otf'),
    [fonts.semibold]: require('../../assets/fonts/WantedSans-SemiBold.otf'),
    [fonts.bold]: require('../../assets/fonts/WantedSans-Bold.otf'),
  });

  useEffect(() => {
    // 글꼴을 못 읽어도 시스템 글꼴로 화면은 연다.
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tokens.bg } }} />
    </>
  );
}
