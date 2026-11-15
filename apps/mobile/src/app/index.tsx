// 의뢰자 요청함
import { InboxScreen } from '@/components/inbox/InboxScreen';
import { requesterRequests } from '@/data/demo';

export default function RequesterInbox() {
  return (
    <InboxScreen
      items={requesterRequests}
      filters={[
        { label: '전체', match: null },
        { label: '회신 도착', match: ['replied'] },
        { label: '승인 대기', match: ['waiting'] },
        { label: '작성 중', match: ['drafting'] },
      ]}
      hrefOf={(id) => ({ pathname: '/requester/[id]', params: { id } })}
      switchTo="/lab"
      switchLabel="기관 화면으로 바꾸기"
      newLabel="새 요청"
    />
  );
}
