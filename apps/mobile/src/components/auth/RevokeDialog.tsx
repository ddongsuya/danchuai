// 에이전트 이용 동의 철회 확인 팝업(처리방침 3항, 앱 안에서 철회). 왼쪽 닫기·오른쪽 철회하기.
// 철회하면 서버가 단추에 철회를 남기고 이 사람의 에이전트 대화·초안·실행 기록을 지운다. 단추 계정은 그대로다.
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Txt } from '@/components/ui/Txt';
import { space, tokens, u } from '@/constants/theme';

export function RevokeDialog({ visible, busy, error, onClose, onConfirm }: { visible: boolean; busy?: boolean; error?: string | null; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog visible={visible} onClose={busy ? () => undefined : onClose}>
      <Txt variant="heading" accessibilityRole="header">
        에이전트 동의를 철회할까요?
      </Txt>
      <Txt variant="small" color={tokens.muted} style={{ marginTop: u(6) }}>
        에이전트 대화와 기록이 지워져요. 단추 계정은 그대로예요.
      </Txt>
      {error ? (
        <Txt variant="small" color={tokens.danger} accessibilityRole="alert" style={{ marginTop: u(6) }}>
          {error}
        </Txt>
      ) : null}
      <View style={styles.acts}>
        <Button title="닫기" kind="soft" flex={1} disabled={busy} onPress={onClose} />
        <Button title="철회하기" flex={1} loading={busy} onPress={onConfirm} />
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  acts: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
});
