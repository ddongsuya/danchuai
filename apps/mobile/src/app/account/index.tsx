// 계정(진단 문서 A13 반영안, 사용자 선택 2026-11-17): 큰 제목, 행 목록, 로그아웃도 행 하나 + 확인 팝업.
// 이름·비밀번호·담당자 관리는 단추에서 한다(연동 2단계).
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { CaretRight, X } from 'phosphor-react-native';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoutDialog } from '@/components/auth/LogoutDialog';
import { IconButton } from '@/components/ui/IconButton';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { space, tokens, u } from '@/constants/theme';
import { DANCHU_URL } from '@/lib/danchuLinks';
import { useAuth } from '@/lib/session';

/** ISO 시각을 "11.17"로(기기 날짜) */
const monthDay = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

export default function Account() {
  const { status, org, consentAt, signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const manage = `${DANCHU_URL}/${org?.kind === 'cro' ? 'cro' : 'app'}/profile`;

  const logout = async () => {
    setLeaving(true);
    await signOut();
    router.replace('/welcome');
  };

  return (
    <>
      <AccountView
        name={org?.displayName ?? '이름 없음'}
        role={org?.kind === 'cro' ? '기관' : '의뢰자'}
        consent={monthDay(consentAt)}
        onManage={() => void Linking.openURL(manage)}
        onLogout={status === 'ready' ? () => setAsking(true) : undefined}
      />
      <LogoutDialog visible={asking} busy={leaving} onClose={() => setAsking(false)} onConfirm={() => void logout()} />
    </>
  );
}

/** 화면에 그리는 부분만. 미리보기(/preview)는 예시 값으로 이것만 쓴다. */
export function AccountView({ name, role, consent, onManage, onLogout }: { name: string; role: string; consent: string | null; onManage: () => void; onLogout?: () => void }) {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.nav}>
        <IconButton label="닫기" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <X size={u(22)} color={tokens.text} />
        </IconButton>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Txt variant="title" accessibilityRole="header" style={styles.title}>
          계정
        </Txt>
        <Row label={name} right={role} first strong />
        <Row label="개인정보 국외 이전" right={consent ? `${consent} 동의` : '동의함'} />
        <Press label="단추에서 계정 관리" accessibilityRole="link" onPress={onManage} style={styles.row}>
          <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
            단추에서 계정 관리
          </Txt>
          <CaretRight size={u(16)} color={tokens.muted} />
        </Press>
        {onLogout && (
          <Press label="로그아웃" accessibilityRole="button" onPress={onLogout} style={styles.row}>
            <Txt variant="body" color={tokens.muted}>
              로그아웃
            </Txt>
          </Press>
        )}
      </ScrollView>
      <Txt variant="caption" color={tokens.faint} tabular style={styles.ver}>
        {`v${Constants.expoConfig?.version ?? ''}`}
      </Txt>
    </SafeAreaView>
  );
}

function Row({ label, right, first, strong }: { label: string; right: string; first?: boolean; strong?: boolean }) {
  return (
    <View style={[styles.row, first && styles.first]} accessible accessibilityLabel={`${label} ${right}`}>
      <Txt variant={strong ? 'label' : 'body'} style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Txt>
      <Txt variant="small" color={tokens.muted} tabular>
        {right}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  nav: { flexDirection: 'row', alignItems: 'center', height: u(50), paddingHorizontal: u(6) },
  title: { paddingTop: space.xs, paddingBottom: space.md },
  body: { paddingHorizontal: space.xl, paddingBottom: space.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: u(46), borderTopWidth: 1, borderTopColor: tokens.border },
  first: { borderTopWidth: 0 },
  ver: { textAlign: 'center', paddingBottom: space.md },
});
