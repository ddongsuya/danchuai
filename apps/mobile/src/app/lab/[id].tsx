// 기관: 견적 초안(단가표 코드 계산) → 회신 보내기 전 승인. 선정 전에는 의뢰자 회사명·연락처를 보여 주지 않는다.
import { computeTotals, formatWonShort } from '@danchuai/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ApprovalCard } from '@/components/chat/ApprovalCard';
import { ChatShell } from '@/components/chat/ChatShell';
import { Composer } from '@/components/chat/Composer';
import { AgentText, FoldedLog, StepLog, UserMessage } from '@/components/chat/Messages';
import { QuoteDraftCard } from '@/components/chat/QuoteDraftCard';
import { LabRequest } from '@/components/lab/LabRequest';
import { labAsk, labDurationWeeks, labQuoteLines, requestTitle } from '@/data/demo';
import { agentConfigured } from '@/lib/agentClient';
import { bodyPasses } from '@/lib/guard';

type Stage = 'draft' | 'approve';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function LabRequestRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // 서버가 연결돼 있으면 받은 요청을 실제로 연다. 견적 항목 금액은 담당자 입력값, 합계는 코드 계산.
  if (agentConfigured() && UUID.test(id)) return <LabRequest requestId={id} />;
  return <DemoLab />;
}

function DemoLab() {
  const { id, stage: initial } = useLocalSearchParams<{ id: string; stage?: string }>();
  const [stage, setStage] = useState<Stage>(initial === 'approve' ? 'approve' : 'draft');
  const title = requestTitle[id] ?? '요청';

  // 금액은 코드가 계산해 본문에 넣는다.
  const total = formatWonShort(computeTotals(labQuoteLines).totalWithVatWon);
  const body = `안녕하세요. 요청하신 ${title} 견적을 보내 드려요. 견적 총액은 ${total} 원(부가세 포함)이고, 소요 기간은 ${labDurationWeeks}주예요. 항목별 금액은 첨부한 견적서에 있어요.`;

  if (stage === 'draft') {
    return (
      <ChatShell title={title} bottom={<Composer />}>
        <UserMessage text={labAsk} />
        <View>
          <StepLog
            steps={[
              { label: '요청서 읽기', state: 'done' },
              { label: '2026 하반기 단가표 적용', state: 'done' },
              { label: '금액 계산', state: 'done' },
            ]}
          />
          <AgentText>초안을 만들었어요. 회복군은 군당 5마리로 넣었어요.</AgentText>
          <QuoteDraftCard lines={labQuoteLines} onWrite={() => setStage('approve')} />
        </View>
      </ChatShell>
    );
  }

  return (
    <ChatShell
      title={title}
      dim
      bottom={
        <ApprovalCard
          title="견적 회신 보내기"
          recipients={[{ id: 'requester', name: '의뢰자' }]}
          body={body}
          attachment="견적서 1건"
          guardPassed={bodyPasses(body, { allowMoney: true })}
          onEdit={() => setStage('draft')}
          onApprove={() => router.replace('/lab')}
        />
      }
    >
      <UserMessage text="이대로 회신 본문 써 줘." />
      <View>
        <FoldedLog count={6} />
        <AgentText>회신 본문과 견적서를 준비했어요.</AgentText>
      </View>
    </ChatShell>
  );
}
