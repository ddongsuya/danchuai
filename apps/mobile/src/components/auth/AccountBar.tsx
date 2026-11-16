// 지금 로그인한 계정과 빠져나가는 버튼. 조직이 없거나 비밀번호를 바꾸는 중에도 다른 계정으로 갈 수 있게 한다.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { radius, space, tokens } from '@/constants/theme';
import { useAuth } from '@/lib/session';

export function AccountBar({ action = '로그아웃' }: { action?: string }) {
  const { session, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const email = session?.user.email ?? '';
  return (
    <View style={styles.row}>
      <Txt variant="body" numberOfLines={1} style={{ flex: 1 }} selectable>
        {email}
      </Txt>
      <Button
        title={action}
        kind="ghost"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          await signOut();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', height: 48, paddingLeft: space.lg, paddingRight: 4, borderRadius: radius.pill, backgroundColor: tokens.sunken },
});
