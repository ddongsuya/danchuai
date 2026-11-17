import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { tokens } from '@/constants/theme';

import { NavBar } from './NavBar';

/** 열 수 없는 요청(없는 주소, 다른 계정의 요청, 서버 연결 전). 막다른 길이 되지 않게 요청함으로 가는 주 버튼을 둔다(진단 문서 A14 반영안). */
export function NotFound({ label, reason = '주소가 바뀌었거나 이 계정의 요청이 아니에요.' }: { label: string; reason?: string }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }} edges={['top', 'bottom']}>
      <NavBar title="" />
      <StateView fill tone="empty" title={label} reason={reason} actions={<Button title="요청함으로" tall onPress={() => router.replace('/')} />} />
    </SafeAreaView>
  );
}
