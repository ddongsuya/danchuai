// 탭 빈 화면(Muse 말투: "아직 ~ 없어요" + 언제 채워지는지). 가운데 작은 그림과 두 줄.
import type { Icon as PhosphorIcon } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { tokens } from '@/constants/theme';

export function EmptyTab({ Icon, title, body }: { Icon: PhosphorIcon; title: string; body?: string }) {
  return (
    <View style={styles.wrap} accessible accessibilityLabel={body ? `${title}. ${body}` : title}>
      <View style={styles.ico}>
        <Icon size={24} color={tokens.muted} />
      </View>
      <Txt variant="museRow" style={styles.center}>
        {title}
      </Txt>
      {body ? (
        <Txt variant="museBody" color={tokens.muted} style={styles.center}>
          {body}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6, paddingHorizontal: 32, paddingTop: 96 },
  ico: { width: 52, height: 52, borderRadius: 16, backgroundColor: tokens.group, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  center: { textAlign: 'center' },
});
