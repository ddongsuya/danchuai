// 국외 이전·AI 처리 동의. 동의 전에는 서버가 AI 대화를 열지 않는다(403 consent_required).
import { useState } from 'react';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { ConsentBody } from '@/components/auth/ConsentBody';
import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { tokens, u } from '@/constants/theme';
import { agreeConsent } from '@/lib/accountClient';
import { CONSENT_VERSION } from '@/lib/consent';
import { useAuth } from '@/lib/session';

export default function Consent() {
  const { refresh, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agree = async () => {
    setBusy(true);
    setError(null);
    try {
      await agreeConsent(CONSENT_VERSION);
      await refresh();
    } catch {
      setError('저장하지 못했어요. 다시 눌러 주세요.');
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      title={'에이전트를 쓰려면\n국외 이전 동의가 필요해요'}
      titleVariant="title2"
      gap={u(14)}
      footer={
        <>
          {error && (
            <Txt variant="small" color={tokens.danger} style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
              {error}
            </Txt>
          )}
          <Button title="필수 동의하고 시작" tall loading={busy} onPress={agree} />
          <Button title="로그아웃" kind="text" disabled={busy} onPress={signOut} />
        </>
      }
    >
      <ConsentBody />
    </AuthScreen>
  );
}
