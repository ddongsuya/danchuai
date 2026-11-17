// 앱에 들어가기 전 막힌 상태(불러오기 실패, 기관 승인 전, 기관 요금제가 Pro가 아님, 에이전트를 쓰지 않는 계정). 상태 화면 한 틀로 그린다.
// 다시 확인을 누르면 끝날 때까지 버튼이 로딩 상태가 된다(두 번 누르기 방지).
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { tokens } from '@/constants/theme';

export type GateKind = 'error' | 'org_not_ready' | 'plan_required' | 'unsupported';

// 오류는 할 일이 다시 시도라 주 버튼(검정), 기다림은 할 일이 기다림뿐이라 회색 채움(진단 문서 A04 반영안)
const COPY: Record<GateKind, { tone: 'error' | 'wait' | 'empty'; title: string; reason: string; retry?: string; kind: 'ink' | 'soft' }> = {
  error: { tone: 'error', title: '계정 정보를\n불러오지 못했어요', reason: '인터넷 연결을 확인하고 다시 시도해 주세요.', retry: '다시 시도', kind: 'ink' },
  org_not_ready: { tone: 'wait', title: '기관 승인을\n기다리고 있어요', reason: '단추에서 승인이 끝나면 바로 쓸 수 있어요.', retry: '다시 확인', kind: 'soft' },
  // 기관은 Pro 요금제에서만(2026-11-18 사용자 결정). 단추 정식 서비스 뒤에만 나온다
  plan_required: { tone: 'empty', title: 'Pro 요금제에서\n쓸 수 있어요', reason: '단추에서 기관 요금제를 바꾸면 바로 쓸 수 있어요.', retry: '다시 확인', kind: 'soft' },
  unsupported: { tone: 'empty', title: '이 계정은\n에이전트를 쓰지 않아요', reason: '의뢰자 또는 기관 담당자 계정으로 로그인해 주세요.', kind: 'soft' },
};

export function GateState({ kind, onRetry, onSignOut }: { kind: GateKind; onRetry: () => unknown; onSignOut: () => unknown }) {
  const c = COPY[kind];
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StateView
        fill
        tone={c.tone}
        title={c.title}
        reason={c.reason}
        actions={
          <>
            {c.retry && <Button title={c.retry} kind={c.kind} tall loading={busy} loadingTitle="확인 중" onPress={() => void retry()} />}
            <Button title="로그아웃" kind="text" onPress={() => void onSignOut()} />
          </>
        }
      />
    </SafeAreaView>
  );
}
