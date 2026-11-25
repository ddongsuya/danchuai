// 소식 탭(Muse 피드 자리). 단추 알림을 단추가 준 순서 그대로 보인다. 탭을 열 때마다 새로 읽고(useRemote), 읽지 않은 것은 읽음으로 표시한다.
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { AlertsList } from '@/app/alerts';
import { useShell } from '@/components/shell/ShellContext';
import { TabPage } from '@/components/shell/TabPage';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { agentConfigured, listAlerts, readAllAlerts } from '@/lib/agentClient';
import { unreadCount } from '@/lib/alerts';

export default function FeedTab() {
  const { role } = useShell();
  const live = agentConfigured();
  // 읽는 함수는 역할이 바뀔 때만 새로 만든다(useRemote 는 함수가 바뀌면 다시 읽는다)
  const load = useCallback(() => listAlerts(role), [role]);
  const { state, reload } = useRemote(load, live);
  const items = state.kind === 'ready' ? state.data : null;
  const unread = items ? unreadCount(items) : 0;
  useFocusEffect(
    useCallback(() => {
      if (unread > 0) readAllAlerts(role).catch(() => undefined);
    }, [unread, role]),
  );
  return (
    <TabPage title="소식">
      <AlertsList role={role} items={live ? items : []} error={!live ? '서버 연결 전이에요' : state.kind === 'error' ? REMOTE_ERROR[state.code] : null} onRetry={() => void reload()} />
    </TabPage>
  );
}
