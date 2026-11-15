// 계정(시안 v4 B2): 프로필, 조직·구성원·초대, 내 정보, 로그아웃.
import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { Buildings, CaretRight, Key, User, UserPlus, Users, X } from 'phosphor-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { useRemote } from '@/hooks/useRemote';
import { fetchMembers } from '@/lib/accountClient';
import { initialOf } from '@/lib/format';
import { useAuth } from '@/lib/session';

export default function Account() {
  const { status, session, org, signOut } = useAuth();
  const signedIn = status === 'ready';
  const load = useCallback(() => fetchMembers(), []);
  const members = useRemote(load, signedIn);
  const [leaving, setLeaving] = useState(false);
  const name = org?.displayName ?? '이름 없음';
  const email = session?.user.email ?? '';
  const count = members.state.kind === 'ready' ? `${members.state.data.length}명` : '';

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
          조직
        </Txt>
        <View style={styles.grp}>
          <Item icon={<Buildings size={20} color={tokens.muted} />} label={org?.name ?? '조직 없음'} right={org ? (org.kind === 'cro' ? '기관' : '의뢰자') : undefined} />
          <Item icon={<Users size={20} color={tokens.muted} />} label="구성원" right={count} href={signedIn ? '/account/members' : undefined} line />
          {org?.memberRole === 'owner' && <Item icon={<UserPlus size={20} color={tokens.muted} />} label="초대 코드" href="/invite" line />}
        </View>

        <Txt variant="caption" color={tokens.muted} style={styles.gh}>
          내 정보
        </Txt>
        <View style={styles.grp}>
          <Item icon={<User size={20} color={tokens.muted} />} label="이름" href={signedIn ? '/account/name' : undefined} />
          <Item icon={<Key size={20} color={tokens.muted} />} label="비밀번호" href={signedIn ? '/account/password' : undefined} line />
        </View>

        {signedIn && (
          <View style={styles.out}>
            <Button title="로그아웃" kind="line" tall loading={leaving} onPress={() => void logout()} />
          </View>
        )}
        <Txt variant="caption" color={tokens.faint} tabular style={styles.ver}>
          {`버전 ${Constants.expoConfig?.version ?? ''}`}
        </Txt>
      </ScrollView>
    </SafeAreaView>
  );
}

function Item({ icon, label, right, href, line }: { icon: ReactNode; label: string; right?: string; href?: Href; line?: boolean }) {
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
      {href ? <CaretRight size={16} color={tokens.faint} /> : null}
    </>
  );
  return href ? (
    <Press label={right ? `${label} ${right}` : label} onPress={() => router.push(href)} style={[styles.gi, line && styles.line]}>
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
