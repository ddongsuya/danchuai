// 비밀번호 바꾸기(로그인한 상태). 이메일 코드로만 가입했어도 여기서 비밀번호를 정할 수 있다.
import { router } from 'expo-router';
import { useState } from 'react';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { authErrorText, PASSWORD_MIN, passwordOk } from '@/lib/authRules';
import { supabase } from '@/lib/supabase';

export default function Password() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!supabase || !passwordOk(password) || busy) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (e) return setError(authErrorText(e));
    router.back();
  };

  return (
    <AuthScreen back title="비밀번호" footer={<Button title="저장" tall disabled={!passwordOk(password)} loading={busy} onPress={() => void save()} />}>
      <Field
        label="새 비밀번호"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoFocus
        autoComplete="new-password"
        textContentType="newPassword"
        help={`${PASSWORD_MIN}자 이상`}
        error={error}
        onSubmitEditing={() => void save()}
      />
    </AuthScreen>
  );
}
