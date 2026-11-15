// 의뢰자 요청함. 서버가 연결돼 있으면 실제 목록, 아니면 시연 자료.
import { Redirect, type Href } from 'expo-router';
import { useMemo } from 'react';

import { InboxScreen } from '@/components/inbox/InboxScreen';
import { requesterRequests } from '@/data/demo';
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
  // 서버가 연결돼 있으면 실제 목록만 쓴다(읽는 동안 뼈대). 서버가 없을 때만 시연 자료.
  const live = agentConfigured();
  const { state, reload } = useRemote(fetchRequests, live && (status === 'ready' || status === 'disabled'));
  const items = useMemo(() => (state.kind === 'ready' ? state.data.map((r) => requesterItem(r)) : []), [state]);

  if (status === 'signedOut') return <Redirect href="/welcome" />;
  if (status === 'needsOrg') return <Redirect href="/org" />;
  if (status === 'recovery') return <Redirect href="/new-password" />;
  if (org?.kind === 'cro') return <Redirect href="/lab" />;
  return (
    <InboxScreen
      items={live ? items : requesterRequests}
      load={live ? (state.kind === 'ready' ? 'ready' : state.kind) : 'ready'}
      errorLabel={state.kind === 'error' ? REMOTE_ERROR[state.code] : undefined}
      onRetry={() => void reload()}
      filters={FILTERS}
      hrefOf={live ? hrefOf : (id) => ({ pathname: '/requester/[id]', params: { id } })}
      switchTo="/lab"
      switchLabel="기관 화면으로 바꾸기"
      newLabel="새 요청"
      newHref={{ pathname: '/requester/[id]', params: { id: 'new' } }}
    />
  );
}
