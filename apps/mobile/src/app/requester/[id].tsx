// 의뢰자: 새 요청(또는 보내기 전 대화 이어 쓰기)은 대화, 보낸 요청은 진행·회신 비교 화면.
import { useLocalSearchParams } from 'expo-router';

import { LiveChat } from '@/components/agent/LiveChat';
import { NotFound } from '@/components/chat/NotFound';
import { DanchuRequest } from '@/components/request/DanchuRequest';
import { RequestProgress } from '@/components/request/RequestProgress';
import { agentConfigured } from '@/lib/agentClient';
import { isUuid } from '@/lib/format';
import { RFQ_NO } from '@/lib/marketClient';

export default function RequesterRequest() {
  const { id, conv, seed } = useLocalSearchParams<{ id: string; conv?: string; seed?: string }>();
  if (!agentConfigured()) return <NotFound label="아직 연결하는 중이에요" reason="조금 뒤에 다시 열어 주세요" />;
  if (id === 'new') return <LiveChat key={conv ?? 'new'} role="requester" title={conv ? '요청' : '새 요청'} conversationId={conv && isUuid(conv) ? conv : undefined} seed={!conv && seed ? seed.slice(0, 1000) : undefined} />;
  if (RFQ_NO.test(id)) return <DanchuRequest no={id} />;
  if (isUuid(id)) return <RequestProgress requestId={id} />;
  return <NotFound label="이 요청을 찾지 못했어요" />;
}
