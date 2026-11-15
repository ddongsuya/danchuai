// 구성원 초대(조직 소유자만). 코드는 이 화면에서 한 번만 보이고, 서버에는 해시만 남는다.
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Clock, Copy, ShareNetwork, User } from 'phosphor-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { AccountError, createInvite } from '@/lib/accountClient';
import { useAuth } from '@/lib/session';

const daysLeft = (iso: string) => Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000));

export default function Invite() {
  const { org } = useAuth();
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(
    () =>
      createInvite().then(
        (r) => setInvite(r),
        (e: unknown) => setError(e instanceof AccountError && e.status === 403 ? '조직 소유자만 초대할 수 있어요.' : '코드를 만들지 못했어요. 다시 해 주세요.'),
      ),
    [],
  );
  const make = () => {
    setError(null);
    void load();
  };

  useEffect(() => {
    void load();
  }, [load]);

  const share = () => {
    if (!invite) return;
    void Share.share({ message: `견적 에이전트 ${org?.name ?? ''} 초대 코드: ${invite.code}` });
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <Txt variant="heading" accessibilityRole="header">
        구성원 초대
      </Txt>
      {error ? (
        <View style={{ gap: space.md }}>
          <Txt variant="body" color={tokens.danger} accessibilityLiveRegion="polite">
            {error}
          </Txt>
          <Button title="다시 만들기" kind="line" onPress={make} />
        </View>
      ) : (
        <>
          <View style={styles.code}>
            {invite ? (
              <Txt variant="title" tabular selectable style={styles.codeText}>
                {invite.code}
              </Txt>
            ) : (
              <View style={styles.skeleton} accessibilityLabel="코드 만드는 중" />
            )}
          </View>
          <View style={{ gap: space.sm }}>
            <View style={styles.meta}>
              <Clock size={16} color={tokens.muted} />
              <Txt variant="small" color={tokens.muted}>
                {invite ? `${daysLeft(invite.expiresAt)}일 후 만료` : '7일 후 만료'}
              </Txt>
            </View>
            <View style={styles.meta}>
              <User size={16} color={tokens.muted} />
              <Txt variant="small" color={tokens.muted}>
                1명만 사용
              </Txt>
            </View>
          </View>
          <View style={styles.acts}>
            <Button
              title={copied ? '복사됨' : '복사'}
              kind="line"
              tall
              flex={1}
              disabled={!invite}
              icon={<Copy size={18} color={tokens.text} />}
              onPress={async () => {
                if (!invite) return;
                await Clipboard.setStringAsync(invite.code);
                setCopied(true);
              }}
            />
            <Button title="공유" tall flex={1} disabled={!invite} icon={<ShareNetwork size={18} weight="bold" color={tokens.onInk} />} onPress={share} />
          </View>
        </>
      )}
      <Button title="닫기" kind="ghost" onPress={() => router.back()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.surface, paddingHorizontal: space.xxl, paddingTop: space.xxl, gap: space.xl },
  code: { height: 84, borderRadius: radius.card, backgroundColor: tokens.sunken, alignItems: 'center', justifyContent: 'center' },
  codeText: { fontFamily: fonts.bold, fontSize: 30, letterSpacing: 2.4 },
  skeleton: { width: 180, height: 28, borderRadius: 8, backgroundColor: tokens.border },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  acts: { flexDirection: 'row', gap: 10 },
});
