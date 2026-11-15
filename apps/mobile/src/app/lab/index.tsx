// 기관 요청함
import { InboxScreen } from '@/components/inbox/InboxScreen';
import { labRequests } from '@/data/demo';

export default function LabInbox() {
  return (
    <InboxScreen
      items={labRequests}
      filters={[
        { label: '전체', match: null },
        { label: '새 요청', match: ['new'] },
        { label: '승인 대기', match: ['waiting'] },
        { label: '보냄', match: ['sent'] },
      ]}
      hrefOf={(id) => ({ pathname: '/lab/[id]', params: { id } })}
      switchTo="/"
      switchLabel="의뢰자 화면으로 바꾸기"
      newLabel="새 대화"
    />
  );
}
