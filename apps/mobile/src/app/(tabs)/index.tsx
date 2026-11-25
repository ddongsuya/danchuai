// 대화 탭. 의뢰자는 비서 홈(대화로 새 요청 시작), 기관은 기관 비서 대화.
import { AssistChat } from '@/components/lab/AssistChat';
import { RequesterHome } from '@/components/agent/RequesterHome';
import { NotFound } from '@/components/chat/NotFound';
import { useShell } from '@/components/shell/ShellContext';
import { agentConfigured } from '@/lib/agentClient';

export default function ChatTab() {
  const { role, chatKey } = useShell();
  if (role === 'cro') return agentConfigured() ? <AssistChat key={chatKey} /> : <NotFound label="아직 연결하는 중이에요" reason="조금 뒤에 다시 열어 주세요" />;
  return <RequesterHome />;
}
