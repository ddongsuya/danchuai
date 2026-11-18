// 기관: AI와 견적 초안 만들기(단추 요청 번호로 연다). 단추 연동 모드에서만.
import { useLocalSearchParams } from 'expo-router';

import { NotFound } from '@/components/chat/NotFound';
import { DanchuQuoteChat } from '@/components/lab/DanchuQuoteChat';
import { agentConfigured } from '@/lib/agentClient';
import { RFQ_NO } from '@/lib/marketClient';

export default function LabQuoteRoute() {
  const { no } = useLocalSearchParams<{ no: string }>();
  if (!agentConfigured()) return <NotFound label="서버 연결 전이에요" reason="잠시 뒤 다시 열어 주세요." />;
  if (!RFQ_NO.test(no ?? '')) return <NotFound label="요청을 찾을 수 없어요" />;
  return <DanchuQuoteChat no={no} />;
}
