import { HourglassMedium } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { fonts, space, tokens } from '@/constants/theme';

export function PendingRow({ label, due }: { label: string; due: string }) {
  return (
    <View style={styles.row}>
      <HourglassMedium size={16} weight="bold" color={tokens.wait} />
      <Txt variant="small" color={tokens.wait} style={{ fontFamily: fonts.semibold, flex: 1 }}>
        {label}
      </Txt>
      <Txt variant="caption" color={tokens.wait} tabular>
        기한 {due}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: space.md, backgroundColor: tokens.waitSoft, borderRadius: 14, paddingVertical: space.md, paddingHorizontal: 14 },
});
