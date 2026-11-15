// 의뢰자: 일 맡기기 → 보내기 전 승인 → 회신 비교. 시연은 화면 안에서 단계를 넘긴다(stage 파라미터로 바로 열 수도 있다).
import { useLocalSearchParams } from 'expo-router';
import { CheckCircle } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LiveChat } from '@/components/agent/LiveChat';
import { ApprovalCard } from '@/components/chat/ApprovalCard';
import { ChatShell } from '@/components/chat/ChatShell';
import { CompareTable } from '@/components/chat/CompareTable';
import { Composer } from '@/components/chat/Composer';
import { AgentText, FoldedLog, StepLog, UserMessage, WaitingLine } from '@/components/chat/Messages';
import { PendingRow } from '@/components/chat/PendingRow';
import { QuestionCard } from '@/components/chat/QuestionCard';
import { Txt } from '@/components/ui/Txt';
import { fonts, space, tokens } from '@/constants/theme';
import { questionSet, recipients, replies, replyDue, requestBody, requesterAsk, requestTitle } from '@/data/demo';
import { agentConfigured } from '@/lib/agentClient';
import { bodyPasses } from '@/lib/guard';

type Stage = 'ask' | 'approve' | 'compare';
const stages: Stage[] = ['ask', 'approve', 'compare'];

export default function RequesterRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // 서버가 연결돼 있으면 새 요청은 실제 대화로 연다. 그 밖에는 시연 화면.
  if (id === 'new' && agentConfigured()) return <LiveChat role="requester" title="새 요청" recipients={recipients} />;
  return <DemoRequest />;
}

function DemoRequest() {
  const { id, stage: initial } = useLocalSearchParams<{ id: string; stage?: string }>();
  const [stage, setStage] = useState<Stage>(stages.includes(initial as Stage) ? (initial as Stage) : 'ask');
  const title = requestTitle[id] ?? '새 요청';
  const nameOf = (rid: string) => recipients.find((r) => r.id === rid)?.name ?? rid;
  const waitingFor = recipients.filter((r) => !replies.some((x) => x.recipientId === r.id));

  if (stage === 'ask') {
    return (
      <ChatShell title={title} bottom={<Composer />}>
        <UserMessage text={requesterAsk} />
        <View>
          <StepLog
            steps={[
              { label: '요청 내용 읽기', state: 'done' },
              { label: '시험 조건 정리', state: 'done' },
              { label: '빈 항목 확인', state: 'now' },
            ]}
          />
          <AgentText>요청서 대부분을 채웠어요. 두 가지만 더 알려 주세요.</AgentText>
          <QuestionCard
            title="시험물질과 회신 기한"
            questions={questionSet}
            initial={{ form: '액상', due: '2주' }}
            onSubmit={() => setStage('approve')}
            onSkip={() => setStage('approve')}
          />
          <WaitingLine label="답을 기다리는 중" />
        </View>
      </ChatShell>
    );
  }

  if (stage === 'approve') {
    return (
      <ChatShell
        title={title}
        dim
        bottom={
          <ApprovalCard
            title="견적 요청 보내기"
            recipients={recipients}
            body={requestBody}
            attachment="요청서 1건"
            hideRequester
            guardPassed={bodyPasses(requestBody)}
            onEdit={() => setStage('ask')}
            onApprove={() => setStage('compare')}
          />
        }
      >
        <UserMessage text={requesterAsk} />
        <View>
          <FoldedLog count={5} />
          <AgentText>요청서와 본문을 준비했어요. 받는 곳은 직접 고르신 3곳이에요.</AgentText>
        </View>
      </ChatShell>
    );
  }

  return (
    <ChatShell title={title} bottom={<Composer />}>
      <View>
        <FoldedLog count={9} />
        <View style={styles.sent}>
          <CheckCircle size={16} weight="fill" color={tokens.accent} />
          <Txt variant="caption" color={tokens.accent} style={{ fontFamily: fonts.semibold }}>
            3곳에 보냈어요
          </Txt>
        </View>
        <AgentText>{`${recipients.length}곳 중 ${replies.length}곳이 회신했어요. 도착 순으로 정리했어요.`}</AgentText>
        <CompareTable replies={replies} nameOf={nameOf} />
        {waitingFor.map((r) => (
          <PendingRow key={r.id} label={`${r.name} 회신 전`} due={replyDue} />
        ))}
      </View>
    </ChatShell>
  );
}

const styles = StyleSheet.create({
  sent: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.md },
});
