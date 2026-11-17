// 로그아웃 확인 팝업. 질문 한 줄, 왼쪽 닫기·오른쪽 로그아웃(토스 확인 팝업 배치, Mobbin aaa9c213).
// 로그아웃 뒤 무엇이 남는지는 확인 전이라 쓰지 않는다.
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Txt } from '@/components/ui/Txt';
import { space } from '@/constants/theme';

export function LogoutDialog({ visible, busy, onClose, onConfirm }: { visible: boolean; busy?: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog visible={visible} onClose={busy ? () => undefined : onClose}>
      <Txt variant="heading" accessibilityRole="header">
        로그아웃할까요?
      </Txt>
      <View style={styles.acts}>
        <Button title="닫기" kind="soft" tall flex={1} disabled={busy} onPress={onClose} />
        <Button title="로그아웃" tall flex={1} loading={busy} onPress={onConfirm} />
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  acts: { flexDirection: 'row', gap: space.sm, marginTop: space.xl },
});
