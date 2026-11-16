// 국외 이전·AI 처리 동의. 동의 전에는 서버가 AI 대화를 열지 않는다(403 consent_required).
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { space, tokens } from '@/constants/theme';
import { agreeConsent } from '@/lib/accountClient';
import { CONSENT_VERSION, TRANSFERS } from '@/lib/consent';
import { DANCHU_URL } from '@/lib/danchuLinks';
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
      title="개인정보 국외 이전 동의"
      footer={
        <>
          {error && (
            <Txt variant="small" color={tokens.danger} style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
              {error}
            </Txt>
          )}
          <Button title="동의하고 시작" tall loading={busy} onPress={agree} />
          <Button title="로그아웃" kind="ghost" disabled={busy} onPress={signOut} />
        </>
      }
    >
      <View style={{ gap: space.lg }}>
        {TRANSFERS.map((t) => (
          <View key={t.to} style={styles.block}>
            <Txt variant="label">{t.to}</Txt>
            <Row k="나라" v={t.country} />
            <Row k="목적" v={t.purpose} />
            <Row k="항목" v={t.items} />
            <Row k="보관" v={t.keep} />
          </View>
        ))}
        <Row k="이전 방법" v="이용할 때마다 암호화 통신으로 전송" />
        <Row k="동의하지 않으면" v="에이전트를 쓸 수 없어요. 단추 웹은 그대로 이용해요." />
        <Txt variant="caption" color={tokens.muted} style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL(`${DANCHU_URL}/privacy`)}>
          개인정보 처리방침
        </Txt>
      </View>
    </AuthScreen>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Txt variant="small" color={tokens.muted} style={styles.k}>
        {k}
      </Txt>
      <Txt variant="small" style={{ flex: 1 }}>
        {v}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 6, paddingBottom: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
  row: { flexDirection: 'row', gap: space.md },
  k: { width: 88 },
  link: { textDecorationLine: 'underline', marginTop: space.sm },
});
