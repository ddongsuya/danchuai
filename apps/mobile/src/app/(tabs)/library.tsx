// 자료 탭(Muse 라이브러리 자리). 결과물·파일 목록은 다음 단계에서 채운다.
import { SquaresFour } from 'phosphor-react-native';

import { EmptyTab } from '@/components/shell/EmptyTab';
import { TabPage } from '@/components/shell/TabPage';

export default function LibraryTab() {
  return (
    <TabPage title="자료">
      <EmptyTab Icon={SquaresFour} title="아직 만든 게 없어요" body="견적서나 보고서를 만들면 여기 모여요." />
    </TabPage>
  );
}
