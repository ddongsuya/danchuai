// 기관 받은 요청함. 서버가 연결돼 있으면 실제 목록(의뢰자 이름 없음), 아니면 시연 자료.
import { Redirect } from 'expo-router';
import { useMemo } from 'react';

import { InboxScreen } from '@/components/inbox/InboxScreen';
import { labRequests } from '@/data/demo';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { agentConfigured } from '@/lib/agentClient';
import { labItem } from '@/lib/inbox';
import { fetchLabInbox } from '@/lib/marketClient';
import { useAuth } from '@/lib/session';

const FILTERS = [
  { label: '전체', match: null },
  { label: '새 요청', match: ['new' as const] },
  { label: '회신 완료', match: ['sent' as const] },
  { label: '선정', match: ['selected' as const] },
];

export default function LabInbox() {
  const { status, org } = useAuth();
  const live = agentConfigured();
  const { state, reload } = useRemote(fetchLabInbox, live && (status === 'ready' || status === 'disabled'));
  const items = useMemo(() => (state.kind === 'ready' ? state.data.map((r) => labItem(r)) : []), [state]);

  if (org?.kind === 'requester') return <Redirect href="/" />;
  return (
    <InboxScreen
      title="받은 요청"
      items={live ? items : labRequests}
      load={live ? (state.kind === 'ready' ? 'ready' : state.kind) : 'ready'}
      errorLabel={state.kind === 'error' ? REMOTE_ERROR[state.code] : undefined}
      onRetry={() => void reload()}
      emptyLabel="받은 요청 없음"
      filters={live ? FILTERS : [{ label: '전체', match: null }, { label: '새 요청', match: ['new'] }, { label: '승인 대기', match: ['waiting'] }, { label: '보냄', match: ['sent'] }]}
      hrefOf={(id) => ({ pathname: '/lab/[id]', params: { id } })}
      switchTo="/"
      switchLabel="의뢰자 화면으로 바꾸기"
      newLabel="새 대화"
    />
  );
}
