// 이메일 인증 코드(가입 확인 또는 비밀번호 재설정). 6자리를 다 채우면 바로 확인한다.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/Button';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { authErrorText, digitsOnly, OTP_LENGTH, RESEND_SECONDS } from '@/lib/authRules';
import { useAuth } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function Verify() {
  const { email = '', mode = 'signup' } = useLocalSearchParams<{ email?: string; mode?: 'signup' | 'recovery' }>();
  const { setRecovery } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(RESEND_SECONDS);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const check = async (value: string) => {
    if (!supabase || value.length !== OTP_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    if (mode === 'recovery') setRecovery(true);
    const { error: e } = await supabase.auth.verifyOtp({ email, token: value, type: mode === 'recovery' ? 'recovery' : 'signup' });
    setBusy(false);
    if (e) {
      if (mode === 'recovery') setRecovery(false);
      setError(authErrorText({ ...e, code: e.code ?? 'otp_expired' }));
      setCode('');
      input.current?.focus();
      return;
    }
    if (mode === 'recovery') router.replace('/new-password');
    // 가입 확인은 로그인 상태가 바뀌며 다음 화면(조직 만들기)으로 넘어간다.
  };

  const resend = async () => {
    if (!supabase) return;
    setLeft(RESEND_SECONDS);
    setError(null);
    const { error: e } = mode === 'recovery' ? await supabase.auth.resetPasswordForEmail(email) : await supabase.auth.resend({ type: 'signup', email });
    if (e) setError(authErrorText(e));
  };

  return (
    <AuthScreen title="인증 코드" back footer={<Button title="확인" tall disabled={code.length !== OTP_LENGTH} loading={busy} onPress={() => check(code)} />}>
      <View style={styles.email}>
        <Txt variant="body" numberOfLines={1} style={{ flex: 1 }}>
          {email}
        </Txt>
        <Button title="변경" kind="ghost" onPress={() => router.back()} />
      </View>
      <View>
        <Press label="인증 코드 입력" onPress={() => input.current?.focus()} style={styles.boxes}>
          {Array.from({ length: OTP_LENGTH }, (_, i) => (
            <View key={i} style={[styles.box, i === code.length && !busy && styles.cur, !!error && styles.err]}>
              <Txt variant="title" tabular style={{ fontFamily: fonts.semibold }}>
                {code[i] ?? ''}
              </Txt>
            </View>
          ))}
        </Press>
        <TextInput
          ref={input}
          value={code}
          onChangeText={(t) => {
            const v = digitsOnly(t);
            setCode(v);
            if (v.length === OTP_LENGTH) void check(v);
          }}
          autoFocus
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          accessibilityLabel="인증 코드"
          caretHidden
          style={styles.hidden}
        />
        {error ? (
          <Txt variant="small" color={tokens.danger} style={{ marginTop: space.md }} accessibilityLiveRegion="polite">
            {error}
          </Txt>
        ) : null}
        {left > 0 ? (
          <Txt variant="small" color={tokens.muted} tabular style={{ marginTop: space.lg }}>
            다시 받기 0:{String(left).padStart(2, '0')}
          </Txt>
        ) : (
          <View style={{ marginTop: space.sm, alignSelf: 'flex-start', marginLeft: -18 }}>
            <Button title="다시 받기" kind="ghost" onPress={resend} />
          </View>
        )}
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  email: { flexDirection: 'row', alignItems: 'center', height: 48, paddingLeft: space.lg, paddingRight: 4, borderRadius: radius.pill, backgroundColor: tokens.sunken },
  boxes: { flexDirection: 'row', gap: space.sm },
  box: { flex: 1, height: 60, borderRadius: radius.inner, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.borderInput, alignItems: 'center', justifyContent: 'center' },
  cur: { borderWidth: 2, borderColor: tokens.ink },
  err: { borderColor: tokens.danger },
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
