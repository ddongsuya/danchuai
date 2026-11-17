// 단추 계정 로그인(이메일·비밀번호). 틀리면 어느 쪽이 틀렸는지 밝히지 않는다.
// 이메일 확인·비밀번호 재설정은 단추 웹에서 한다.
import { useRef, useState } from 'react';
import { Linking, type TextInput, View } from 'react-native';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { space } from '@/constants/theme';
import { authErrorText, isEmail } from '@/lib/authRules';
import { DANCHU_URL } from '@/lib/danchuLinks';
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
    setBusy(false);
    if (e?.code === 'email_not_confirmed') return setError('단추 가입 메일의 확인 링크를 먼저 눌러 주세요.');
    if (e) setError(authErrorText(e));
  };

  return (
    <AuthScreen
      title="단추 계정으로 로그인"
      back
      footer={
        <>
          <Button title="로그인" tall disabled={!ready} loading={busy} onPress={submit} />
          <Button title="비밀번호 찾기" kind="text" disabled={busy} onPress={() => Linking.openURL(`${DANCHU_URL}/forgot`)} />
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
