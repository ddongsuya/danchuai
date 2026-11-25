// 맡길 일 탭(Muse 아이디어 자리). 비서가 먼저 내놓는 일 목록은 다음 단계에서 채운다.
import { Lightbulb } from 'phosphor-react-native';

import { EmptyTab } from '@/components/shell/EmptyTab';
import { TabPage } from '@/components/shell/TabPage';

export default function IdeasTab() {
  return (
    <TabPage title="맡길 일">
      <EmptyTab Icon={Lightbulb} title="아직 맡길 일이 없어요" body="제가 먼저 할 수 있는 일이 생기면 여기에 올려 둘게요." />
    </TabPage>
  );
}
