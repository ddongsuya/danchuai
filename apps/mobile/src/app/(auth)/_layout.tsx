// 로그인 전 화면들. 처음 여는 화면은 시작(welcome).
import { Stack } from 'expo-router';

import { tokens } from '@/constants/theme';

export const unstable_settings = { initialRouteName: 'welcome' };

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tokens.bg } }} />;
}
