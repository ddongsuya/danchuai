// 이메일 로그인. 틀리면 어느 쪽이 틀렸는지 밝히지 않는다.
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { type TextInput, View } from 'react-native';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { space } from '@/constants/theme';
import { authErrorText, isEmail } from '@/lib/authRules';
import { supabase } from '@/lib/supabase';

type InputRef = React.ComponentRef<typeof TextInput>;

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pw = useRef<InputRef>(null);
  const ready = isEmail(email) && password.length > 0;

  const submit = async () => {
    if (!supabase || !ready) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (e?.code === 'email_not_confirmed') {
      // 비밀번호가 맞은 경우에만 오는 오류다. 인증 코드를 다시 보내고 그 화면으로 간다.
      await supabase.auth.resend({ type: 'signup', email: email.trim() });
      setBusy(false);
      return router.push({ pathname: '/verify', params: { email: email.trim(), mode: 'signup' } });
    }
    setBusy(false);
    if (e) setError(authErrorText(e));
  };

  const reset = async () => {
    if (!supabase) return;
    if (!isEmail(email)) return setError('이메일을 먼저 넣어 주세요.');
    setBusy(true);
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (e) return setError(authErrorText(e));
    router.push({ pathname: '/verify', params: { email: email.trim(), mode: 'recovery' } });
  };

  return (
    <AuthScreen
      title="로그인"
      back
      footer={
        <>
          <Button title="로그인" tall disabled={!ready} loading={busy} onPress={submit} />
          <Button title="비밀번호 재설정" kind="ghost" disabled={busy} onPress={reset} />
        </>
      }
    >
      <View style={{ gap: space.xl }}>
        <Field
          label="이메일"
          value={email}
          onChangeText={setEmail}
          placeholder="you@company.kr"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => pw.current?.focus()}
        />
        <Field
          ref={pw}
          label="비밀번호"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          error={error}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </View>
    </AuthScreen>
  );
}
