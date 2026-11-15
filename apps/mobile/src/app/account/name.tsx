// 내 이름(조직 안에서 보이는 이름). 서버가 로그인한 사용자 것만 바꾼다.
import { router } from 'expo-router';
import { useState } from 'react';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { AccountError, renameMe } from '@/lib/accountClient';
import { useAuth } from '@/lib/session';

export default function Name() {
  const { org, refresh } = useAuth();
  const [name, setName] = useState(org?.displayName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = name.trim().length >= 1 && name.trim().length <= 40 && name.trim() !== (org?.displayName ?? '');

  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      await renameMe(name.trim());
      await refresh();
      router.back();
    } catch (e) {
      setError(e instanceof AccountError && e.status === 0 ? '연결이 끊겼어요. 다시 시도해 주세요.' : '저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen back title="이름" footer={<Button title="저장" tall disabled={!ok} loading={busy} onPress={() => void save()} />}>
      <Field label="이름" value={name} onChangeText={setName} maxLength={40} autoFocus autoComplete="name" textContentType="name" error={error} onSubmitEditing={() => void save()} />
    </AuthScreen>
  );
}
