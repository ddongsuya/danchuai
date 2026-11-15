// 조직이 없을 때의 화면들. 처음 여는 화면은 조직 만들기.
import { Stack } from 'expo-router';

import { tokens } from '@/constants/theme';

export const unstable_settings = { initialRouteName: 'org' };

export default function OnboardLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tokens.bg } }} />;
}
