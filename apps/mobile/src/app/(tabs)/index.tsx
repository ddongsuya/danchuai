// 대화 탭. 의뢰자는 비서 홈(대화로 새 요청 시작), 기관은 기관 비서 대화.
import { AssistChat } from '@/components/lab/AssistChat';
import { RequesterHome } from '@/components/agent/RequesterHome';
import { NotFound } from '@/components/chat/NotFound';
import { useShell } from '@/components/shell/ShellContext';
import { agentConfigured } from '@/lib/agentClient';

export default function ChatTab() {
  const { role, chatKey } = useShell();
  if (role === 'cro') return agentConfigured() ? <AssistChat key={chatKey} /> : <NotFound label="서버 연결 전이에요" reason="잠시 뒤 다시 열어 주세요." />;
  return <RequesterHome />;
}
