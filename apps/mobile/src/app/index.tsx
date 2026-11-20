// 첫 화면. 의뢰자는 비서(대화로 새 요청 시작, 요청함·질문하기·계정은 메뉴), 기관은 기관 비서.
import { Redirect, type Href } from 'expo-router';

import { RequesterHome } from '@/components/agent/RequesterHome';
import { useAuth } from '@/lib/session';

export default function Home() {
  const { status, org } = useAuth();
  if (status === 'signedOut') return <Redirect href="/welcome" />;
  if (status === 'needsConsent') return <Redirect href={'/consent' as Href} />;
  // 기관의 첫 화면은 비서(받은 요청은 메뉴에서)
  if (org?.kind === 'cro') return <Redirect href="/lab/assist" />;
  return <RequesterHome />;
}
