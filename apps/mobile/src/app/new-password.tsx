// 비밀번호 재설정 코드를 확인한 뒤 새 비밀번호를 정한다.
import { useState } from 'react';

import { AccountBar } from '@/components/auth/AccountBar';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { authErrorText, PASSWORD_MIN, passwordOk } from '@/lib/authRules';
import { useAuth } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function NewPassword() {
  const { setRecovery, refresh } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!supabase || !passwordOk(password)) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (e) return setError(authErrorText(e));
    setRecovery(false);
    await refresh();
  };

  return (
    <AuthScreen title="새 비밀번호" top={<AccountBar action="취소" />} footer={<Button title="저장" tall disabled={!passwordOk(password)} loading={busy} onPress={save} />}>
      <Field
        label="비밀번호"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoFocus
        autoComplete="new-password"
        textContentType="newPassword"
        help={`${PASSWORD_MIN}자 이상`}
        error={error}
        onSubmitEditing={save}
      />
    </AuthScreen>
  );
}
