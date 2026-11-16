// 가이드라인 질문하기(의뢰자·기관 공통). 역할은 로그인한 조직 종류로 정한다. 시연 모드에서만 주소의 role을 쓴다.
import { useLocalSearchParams } from 'expo-router';

import { isUuid } from '@/lib/format';

import { AskChat } from '@/components/agent/AskChat';
import { NotFound } from '@/components/chat/NotFound';
import { agentConfigured } from '@/lib/agentClient';
import { useAuth } from '@/lib/session';

export default function Ask() {
  const { status, org } = useAuth();
  const { role, conv } = useLocalSearchParams<{ role?: string; conv?: string }>();
  if (!agentConfigured()) return <NotFound label="서버 연결 전이에요" />;
  const r = status === 'disabled' ? (role === 'cro' ? 'cro' : 'requester') : org?.kind === 'cro' ? 'cro' : 'requester';
  const id = conv && isUuid(conv) ? conv : undefined;
  return <AskChat key={`${r}-${id ?? 'new'}`} role={r} conversationId={id} />;
}
