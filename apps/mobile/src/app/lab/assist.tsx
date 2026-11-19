// 기관 비서. 단추 연동 모드에서만(단추 고객관리·일정을 말로 맡긴다).
import { Redirect } from 'expo-router';

import { NotFound } from '@/components/chat/NotFound';
import { AssistChat } from '@/components/lab/AssistChat';
import { agentConfigured } from '@/lib/agentClient';
import { useAuth } from '@/lib/session';

export default function LabAssistRoute() {
  const { org } = useAuth();
  if (org?.kind === 'requester') return <Redirect href="/" />;
  if (!agentConfigured()) return <NotFound label="서버 연결 전이에요" reason="잠시 뒤 다시 열어 주세요." />;
  return <AssistChat />;
}
