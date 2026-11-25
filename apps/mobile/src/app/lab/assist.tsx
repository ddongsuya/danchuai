// 옛 기관 비서 주소. 비서는 이제 대화 탭(첫 화면)이다(Muse 시안 2026-11-25). 시연 모드에서는 기관 화면으로 연다.
import { Redirect } from 'expo-router';

export default function LabAssistRoute() {
  return <Redirect href={{ pathname: '/', params: { as: 'cro' } }} />;
}
