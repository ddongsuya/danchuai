// 설정 › 권한(시안 원본 m13). "단추에 기록하는 일"은 바로 하고 알리기 / 매번 묻기 중에 고른다(계정별로 서버에 저장).
// "밖으로 보내는 일"은 매번 묻기로 잠겨 있다(규칙 1: 사람이 허용한 본문만, 한 번만). "권한 관리"는 연결된 곳과 예약 작업 수.
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FullPage, Group, GroupLabel, Li } from '@/components/ui/Muse';
import { MIcon } from '@/components/ui/MIcon';
import { Txt } from '@/components/ui/Txt';
import { tokens } from '@/constants/theme';
import type { RecordMode } from '@/lib/accountClient';
import { useAuth } from '@/lib/session';

export default function PermissionsRoute() {
  const { prefs, setPrefs, org } = useAuth();
  const [error, setError] = useState(false);
  return (
    <PermissionsView
      mode={prefs.recordMode}
      cro={org?.kind !== 'requester'}
      error={error}
      onMode={(m) => {
        setError(false);
        setPrefs({ recordMode: m }).catch(() => setError(true));
      }}
    />
  );
}

const tick = <MIcon name="check" size={18} width={2.2} color={tokens.text} />;

/** 화면 모양만(미리보기에서도 쓴다) */
export function PermissionsView({ mode, cro = true, error, onMode }: { mode: RecordMode; cro?: boolean; error?: boolean; onMode: (m: RecordMode) => void }) {
  return (
    <FullPage title="권한" onBack={() => (router.canGoBack() ? router.back() : router.replace('/' as Href))}>
      {cro && (
        <>
          <GroupLabel>단추에 기록하는 일</GroupLabel>
          <Group>
            <Li first title="바로 하고 알리기" sub="할 일, 일정, 미팅 기록, 안건 단계. 7일 안 되돌리기" selected={mode === 'auto'} onPress={() => onMode('auto')} right={mode === 'auto' ? tick : <View style={{ width: 18 }} />} />
            <Li title="매번 묻기" sub="기록하기 전에 매번" selected={mode === 'ask'} onPress={() => onMode('ask')} right={mode === 'ask' ? tick : <View style={{ width: 18 }} />} />
          </Group>
          {error ? (
            <Txt variant="mSmall" color={tokens.danger} style={{ marginTop: 6, marginHorizontal: 6 }} accessibilityLiveRegion="polite">
              바꾸지 못했어요. 한 번 더 해 볼까요?
            </Txt>
          ) : null}
        </>
      )}
      <GroupLabel>밖으로 보내는 일</GroupLabel>
      <Group>
        <Li
          first
          title="매번 묻기"
          sub={cro ? '참여, 질의 답변, 견적 제출, 계약 보고' : '요청 보내기, 질의, 기관 선정, 계약 결과'}
          label="밖으로 보내는 일, 매번 묻기, 바꿀 수 없어요"
          right={
            <>
              <MIcon name="lock" size={16} color={tokens.muted} />
              {tick}
            </>
          }
        />
      </Group>
      <GroupLabel>권한 관리</GroupLabel>
      <Group>
        <Li first icon="plug" title="연결" value="단추" chevron={false} />
        <Li icon="clock" title="예약 작업" value="0" chevron={false} />
      </Group>
    </FullPage>
  );
}
