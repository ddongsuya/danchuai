// 기관 받은 요청함(서버 목록, 의뢰자 이름 없음).
import { Redirect } from 'expo-router';
import { useMemo } from 'react';

import { InboxScreen } from '@/components/inbox/InboxScreen';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { agentConfigured } from '@/lib/agentClient';
import { danchuLabItem } from '@/lib/inbox';
import { fetchDanchuLabInbox } from '@/lib/marketClient';
import { useAuth } from '@/lib/session';

const FILTERS = [
  { label: '전체', match: null },
  { label: '할 일', match: ['new' as const, 'viewed' as const] },
  { label: '제출', match: ['sent' as const] },
  { label: '선정', match: ['selected' as const] },
];

export default function LabInbox() {
  const { status, org } = useAuth();
  const live = agentConfigured();
  const { state, reload } = useRemote(fetchDanchuLabInbox, live && (status === 'ready' || status === 'disabled'));
  const items = useMemo(() => (state.kind === 'ready' ? state.data.map((r) => danchuLabItem(r)) : []), [state]);

  if (org?.kind === 'requester') return <Redirect href="/" />;
  return (
    <InboxScreen
      role="cro"
      title="받은 요청"
      items={items}
      load={!live ? 'error' : state.kind === 'ready' ? 'ready' : state.kind}
      errorLabel={!live ? '아직 연결하는 중이에요' : state.kind === 'error' ? REMOTE_ERROR[state.code] : undefined}
      onRetry={() => void reload()}
      emptyLabel="아직 받은 요청이 없어요"
      filters={FILTERS}
      hrefOf={(id) => ({ pathname: '/lab/[id]', params: { id } })}
    />
  );
}
