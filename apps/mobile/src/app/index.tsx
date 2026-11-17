// 의뢰자 요청함(서버 목록, 최근 순).
import { Redirect, type Href } from 'expo-router';
import { useMemo } from 'react';

import { InboxScreen } from '@/components/inbox/InboxScreen';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { agentConfigured } from '@/lib/agentClient';
import { requesterItem } from '@/lib/inbox';
import { fetchRequests } from '@/lib/marketClient';
import { useAuth } from '@/lib/session';

const FILTERS = [
  { label: '전체', match: null },
  { label: '회신 도착', match: ['replied' as const] },
  { label: '승인 대기', match: ['waiting' as const] },
  { label: '작성 중', match: ['drafting' as const] },
];

/** 보낸 요청은 진행 화면, 아직 안 보낸 대화는 이어서 쓰기 */
const hrefOf = (id: string): Href =>
  id.startsWith('c:') ? { pathname: '/requester/[id]', params: { id: 'new', conv: id.slice(2) } } : { pathname: '/requester/[id]', params: { id } };

export default function RequesterInbox() {
  const { status, org } = useAuth();
  const live = agentConfigured();
  const { state, reload } = useRemote(fetchRequests, live && (status === 'ready' || status === 'disabled'));
  const items = useMemo(() => (state.kind === 'ready' ? state.data.map((r) => requesterItem(r)) : []), [state]);

  if (status === 'signedOut') return <Redirect href="/welcome" />;
  if (status === 'needsConsent') return <Redirect href={'/consent' as Href} />;
  if (org?.kind === 'cro') return <Redirect href="/lab" />;
  return (
    <InboxScreen
      role="requester"
      placeholder="어떤 시험을 맡길까요?"
      items={items}
      load={!live ? 'error' : state.kind === 'ready' ? 'ready' : state.kind}
      errorLabel={!live ? '서버 연결 전이에요' : state.kind === 'error' ? REMOTE_ERROR[state.code] : undefined}
      onRetry={() => void reload()}
      filters={FILTERS}
      hrefOf={hrefOf}
      switchTo="/lab"
      switchLabel="기관 화면으로 바꾸기"
    />
  );
}
