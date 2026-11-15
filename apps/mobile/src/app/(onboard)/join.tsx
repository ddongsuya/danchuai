// 초대 코드로 기존 조직에 참여한다.
import { useState } from 'react';
import { View } from 'react-native';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { space } from '@/constants/theme';
import { AccountError, joinOrg } from '@/lib/accountClient';
import { formatInviteInput, joinErrorText } from '@/lib/authRules';
import { useAuth } from '@/lib/session';

export default function Join() {
  const { refresh } = useAuth();
  const [code, setCode] = useState('');
  const [me, setMe] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = code.length === 9 && me.trim().length > 0;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await joinOrg({ code, displayName: me.trim() });
      await refresh();
    } catch (e) {
      setError(joinErrorText(e instanceof AccountError ? e.code : 'unknown'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen title="초대 코드" back footer={<Button title="참여하기" tall disabled={!ready} loading={busy} onPress={submit} />}>
      <View style={{ gap: space.xl }}>
        <Field
          label="코드"
          value={code}
          onChangeText={(t) => {
            setCode(formatInviteInput(t));
            setError(null);
          }}
          placeholder="XXXX-XXXX"
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          error={error}
        />
        <Field label="내 이름" value={me} onChangeText={setMe} placeholder="이름" maxLength={40} autoComplete="name" onSubmitEditing={submit} />
      </View>
    </AuthScreen>
  );
}
