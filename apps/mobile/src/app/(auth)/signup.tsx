// 회원가입: 이메일·비밀번호 → 이메일 인증 코드
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { type TextInput, View } from 'react-native';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { space } from '@/constants/theme';
import { alreadySignedUp, authErrorText, isEmail, PASSWORD_MIN, passwordOk } from '@/lib/authRules';
import { supabase } from '@/lib/supabase';

type InputRef = React.ComponentRef<typeof TextInput>;

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pw = useRef<InputRef>(null);
  const ready = isEmail(email) && passwordOk(password);

  const submit = async () => {
    if (!supabase || !ready) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (e) return setError(authErrorText(e));
    // 이미 있는 메일이면 Supabase는 오류 없이 빈 사용자를 돌려주고 코드를 보내지 않는다.
    if (alreadySignedUp(data.user)) return setError(authErrorText({ code: 'user_already_exists' }));
    // 인증을 끈 프로젝트면 바로 세션이 생긴다(로그인 상태가 화면을 넘긴다).
    if (!data.session) router.push({ pathname: '/verify', params: { email: email.trim(), mode: 'signup' } });
  };

  return (
    <AuthScreen title="회원가입" back footer={<Button title="가입하기" tall disabled={!ready} loading={busy} onPress={submit} />}>
      <View style={{ gap: space.xl }}>
        <Field
          label="업무 이메일"
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
          autoComplete="new-password"
          textContentType="newPassword"
          help={`${PASSWORD_MIN}자 이상`}
          error={error}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </View>
    </AuthScreen>
  );
}
