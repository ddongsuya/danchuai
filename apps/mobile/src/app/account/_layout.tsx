import { Stack } from 'expo-router';

import { tokens } from '@/constants/theme';

export default function AccountLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tokens.bg } }} />;
}
