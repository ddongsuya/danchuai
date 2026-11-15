import { WarningCircle } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { fonts, tokens } from '@/constants/theme';

import { ChatShell } from './ChatShell';

/** 열 수 없는 요청(없는 주소, 서버 연결 전) */
export function NotFound({ label }: { label: string }) {
  return (
    <ChatShell title="요청" bottom={null}>
      <View style={styles.row} accessibilityRole="alert">
        <WarningCircle size={16} weight="fill" color={tokens.danger} />
        <Txt variant="caption" color={tokens.danger} style={{ fontFamily: fonts.semibold }}>
          {label}
        </Txt>
      </View>
    </ChatShell>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 8 } });
