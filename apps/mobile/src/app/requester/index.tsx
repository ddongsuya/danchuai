// 의뢰자 요청함(서버 목록, 최근 순). 첫 화면(비서) 메뉴에서 연다.
import { Redirect, type Href } from 'expo-router';
import { useMemo } from 'react';

import { requesterHref } from '@/components/agent/RequesterHome';
import { InboxScreen } from '@/components/inbox/InboxScreen';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { agentConfigured } from '@/lib/agentClient';
import { requesterItem } from '@/lib/inbox';
import { fetchRequests } from '@/lib/marketClient';
import { useAuth } from '@/lib/session';

const FILTERS = [
  { label: '전체', match: null },
  { label: '회신 도착', match: ['replied' as const] },
  { label: '허용 전', match: ['waiting' as const] },
];

export default function RequesterInbox() {
  const { status, org } = useAuth();
  const live = agentConfigured();
  const { state, reload } = useRemote(fetchRequests, live && (status === 'ready' || status === 'disabled'));
  const items = useMemo(() => (state.kind === 'ready' ? state.data.map((r) => requesterItem(r)) : []), [state]);

  if (status === 'signedOut') return <Redirect href="/welcome" />;
  if (status === 'needsConsent') return <Redirect href={'/consent' as Href} />;
  // 기관은 받은 요청함
  if (org?.kind === 'cro') return <Redirect href="/lab" />;
  return (
    <InboxScreen
      role="requester"
      items={items}
      load={!live ? 'error' : state.kind === 'ready' ? 'ready' : state.kind}
      errorLabel={!live ? '아직 연결하는 중이에요' : state.kind === 'error' ? REMOTE_ERROR[state.code] : undefined}
      onRetry={() => void reload()}
      filters={FILTERS}
      hrefOf={requesterHref}
    />
  );
}
