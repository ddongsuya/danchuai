// 계정: 단추 계정 정보(이름·메일·소속)와 로그아웃. 이름·비밀번호·담당자 관리는 단추에서 한다(연동 2단계).
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ArrowSquareOut, Buildings, ShieldCheck, SignOut, X } from 'phosphor-react-native';
import { useState, type ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoutDialog } from '@/components/auth/LogoutDialog';
import { IconButton } from '@/components/ui/IconButton';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { DANCHU_URL } from '@/lib/danchuLinks';
import { initialOf } from '@/lib/format';
import { useAuth } from '@/lib/session';

export default function Account() {
  const { status, session, org, signOut } = useAuth();
  const signedIn = status === 'ready';
  const [leaving, setLeaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const name = org?.displayName ?? '이름 없음';
  const email = session?.user.email ?? '';
  const manage = `${DANCHU_URL}/${org?.kind === 'cro' ? 'cro' : 'app'}/profile`;

  const logout = async () => {
    setLeaving(true);
    await signOut();
    router.replace('/welcome');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.nav}>
        <IconButton label="닫기" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <X size={20} color={tokens.text} />
        </IconButton>
        <Txt variant="nav" style={styles.title} accessibilityRole="header">
          계정
        </Txt>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.prof}>
          <View style={styles.pav}>
            <Txt variant="heading" color={tokens.muted}>
              {initialOf(name)}
            </Txt>
          </View>
          <Txt variant="heading">{name}</Txt>
          {email ? (
            <Txt variant="small" color={tokens.muted} selectable>
              {email}
            </Txt>
          ) : null}
        </View>

        <Txt variant="caption" color={tokens.muted} style={styles.gh}>
          단추 계정
        </Txt>
        <View style={styles.grp}>
          <Item icon={<Buildings size={20} color={tokens.muted} />} label={org?.kind === 'cro' ? org.name : '의뢰자'} right={org?.kind === 'cro' ? '기관' : undefined} />
          <Item icon={<ShieldCheck size={20} color={tokens.muted} />} label="개인정보 국외 이전" right="동의함" line />
          <Item icon={<ArrowSquareOut size={20} color={tokens.muted} />} label="단추에서 계정 관리" onPress={() => Linking.openURL(manage)} line />
        </View>

        {signedIn && (
          <View style={[styles.grp, styles.out]}>
            <Item icon={<SignOut size={20} color={tokens.muted} />} label="로그아웃" onPress={() => setAsking(true)} role="button" />
          </View>
        )}
        <Txt variant="caption" color={tokens.faint} tabular style={styles.ver}>
          {`버전 ${Constants.expoConfig?.version ?? ''}`}
        </Txt>
      </ScrollView>
      <LogoutDialog visible={asking} busy={leaving} onClose={() => setAsking(false)} onConfirm={() => void logout()} />
    </SafeAreaView>
  );
}

function Item({ icon, label, right, onPress, line, role = 'link' }: { icon: ReactNode; label: string; right?: string; onPress?: () => void; line?: boolean; role?: 'link' | 'button' }) {
  const inner = (
    <>
      {icon}
      <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Txt>
      {right ? (
        <Txt variant="small" color={tokens.muted} tabular>
          {right}
        </Txt>
      ) : null}
    </>
  );
  return onPress ? (
    <Press label={label} accessibilityRole={role} onPress={onPress} style={[styles.gi, line && styles.line]}>
      {inner}
    </Press>
  ) : (
    <View style={[styles.gi, line && styles.line]} accessible accessibilityLabel={right ? `${label} ${right}` : label}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10 },
  title: { flex: 1, textAlign: 'center' },
  body: { paddingHorizontal: space.xl, paddingBottom: space.xxl },
  prof: { alignItems: 'center', gap: 4, paddingTop: space.sm, paddingBottom: space.xl },
  pav: { width: 64, height: 64, borderRadius: 32, backgroundColor: tokens.sunken, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  gh: { fontFamily: fonts.bold, paddingHorizontal: 4, paddingTop: space.md, paddingBottom: space.sm },
  grp: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' },
  gi: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 54 },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  out: { marginTop: space.xxl },
  ver: { textAlign: 'center', marginTop: space.lg },
});
