// 조직 만들기: 조직이 없는 사람만 본다. 만든 사람이 소유자가 된다.
import { router } from 'expo-router';
import { Flask, Microscope } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { AccountError, createOrg } from '@/lib/accountClient';
import { joinErrorText } from '@/lib/authRules';
import { useAuth } from '@/lib/session';

const kinds = [
  { kind: 'requester', label: '의뢰자', Icon: Flask },
  { kind: 'cro', label: '시험기관', Icon: Microscope },
] as const;

export default function CreateOrg() {
  const { refresh } = useAuth();
  const [kind, setKind] = useState<'requester' | 'cro'>('requester');
  const [name, setName] = useState('');
  const [me, setMe] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = name.trim().length > 0 && me.trim().length > 0;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await createOrg({ kind, name: name.trim(), displayName: me.trim() });
      await refresh();
    } catch (e) {
      setError(joinErrorText(e instanceof AccountError ? e.code : 'unknown'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      title="조직 만들기"
      footer={
        <>
          <Button title="만들기" tall disabled={!ready} loading={busy} onPress={submit} />
          <Button title="초대 코드로 참여" kind="ghost" onPress={() => router.push('/join')} />
        </>
      }
    >
      <View style={{ gap: space.xl }}>
        <View>
          <Txt variant="small" style={styles.label}>
            조직 종류
          </Txt>
          <View style={styles.seg} accessibilityRole="radiogroup">
            {kinds.map(({ kind: k, label, Icon }) => {
              const on = k === kind;
              return (
                <Press key={k} label={label} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setKind(k)} style={[styles.opt, on && styles.on]}>
                  <Icon size={24} color={on ? tokens.ink : tokens.muted} />
                  <Txt variant="label" style={{ fontFamily: fonts.semibold }}>
                    {label}
                  </Txt>
                </Press>
              );
            })}
          </View>
        </View>
        <Field label="조직 이름" value={name} onChangeText={setName} placeholder="회사 또는 기관 이름" maxLength={60} autoComplete="organization" />
        <Field label="내 이름" value={me} onChangeText={setMe} placeholder="이름" maxLength={40} autoComplete="name" error={error} onSubmitEditing={submit} />
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.semibold, marginBottom: space.sm },
  seg: { flexDirection: 'row', gap: 10 },
  opt: { flex: 1, gap: space.md, padding: space.lg, borderRadius: radius.card, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border },
  on: { borderWidth: 2, borderColor: tokens.ink, padding: space.lg - 1 },
});
