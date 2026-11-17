import { router } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';

import { ChatShell } from './ChatShell';

/** 열 수 없는 요청(없는 주소, 다른 계정의 요청, 서버 연결 전). 막다른 길이 되지 않게 요청함으로 가는 버튼을 둔다. */
export function NotFound({ label, reason = '주소가 바뀌었거나 이 계정의 요청이 아니에요.' }: { label: string; reason?: string }) {
  return (
    <ChatShell title="요청" bottom={null}>
      <StateView tone="error" title={label} reason={reason} actions={<Button title="요청함으로" kind="soft" tall onPress={() => router.replace('/')} />} />
    </ChatShell>
  );
}
