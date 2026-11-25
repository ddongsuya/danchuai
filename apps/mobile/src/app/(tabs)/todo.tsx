// 할 일 탭. 우선 지금 목록을 그대로 연결한다: 의뢰자는 요청함, 기관은 받은 요청(Muse 시안 2026-11-25 1단계).
import { useMemo } from 'react';

import { requesterHref } from '@/components/agent/RequesterHome';
import { InboxScreen } from '@/components/inbox/InboxScreen';
import { useShell } from '@/components/shell/ShellContext';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { agentConfigured } from '@/lib/agentClient';
import { danchuLabItem, requesterItem, type InboxItem } from '@/lib/inbox';
import { fetchDanchuLabInbox, fetchRequests } from '@/lib/marketClient';

const REQ_FILTERS = [
  { label: '전체', match: null },
  { label: '회신 도착', match: ['replied' as const] },
  { label: '승인 대기', match: ['waiting' as const] },
];
const LAB_FILTERS = [
  { label: '전체', match: null },
  { label: '할 일', match: ['new' as const, 'viewed' as const] },
  { label: '제출', match: ['sent' as const] },
  { label: '선정', match: ['selected' as const] },
];

const loadReq = () => fetchRequests().then((r) => r.map((x) => requesterItem(x)));
const loadLab = () => fetchDanchuLabInbox().then((r) => r.map((x) => danchuLabItem(x)));

export default function TodoTab() {
  const { role } = useShell();
  const live = agentConfigured();
  const { state, reload } = useRemote<InboxItem[]>(role === 'cro' ? loadLab : loadReq, live);
  const items = useMemo(() => (state.kind === 'ready' ? state.data : []), [state]);
  return (
    <InboxScreen
      inTab
      role={role}
      title="할 일"
      items={items}
      load={!live ? 'error' : state.kind === 'ready' ? 'ready' : state.kind}
      errorLabel={!live ? '서버 연결 전이에요' : state.kind === 'error' ? REMOTE_ERROR[state.code] : undefined}
      onRetry={() => void reload()}
      emptyLabel={role === 'cro' ? '받은 요청 없음' : '요청 없음'}
      filters={role === 'cro' ? LAB_FILTERS : REQ_FILTERS}
      hrefOf={role === 'cro' ? (id) => ({ pathname: '/lab/[id]', params: { id } }) : requesterHref}
    />
  );
}
