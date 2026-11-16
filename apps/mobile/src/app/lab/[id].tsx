// 기관: 받은 요청 → 회신 채팅(견적 금액은 사람이 넣고 코드가 합계) → 보낸 회신·선정 결과.
import { useLocalSearchParams } from 'expo-router';

import { NotFound } from '@/components/chat/NotFound';
import { DanchuLab } from '@/components/lab/DanchuLab';
import { LabRequest } from '@/components/lab/LabRequest';
import { agentConfigured } from '@/lib/agentClient';
import { isUuid } from '@/lib/format';
import { RFQ_NO } from '@/lib/marketClient';

export default function LabRequestRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!agentConfigured()) return <NotFound label="서버 연결 전이에요" />;
  if (RFQ_NO.test(id)) return <DanchuLab no={id} />;
  if (isUuid(id)) return <LabRequest requestId={id} />;
  return <NotFound label="요청을 찾을 수 없어요" />;
}
