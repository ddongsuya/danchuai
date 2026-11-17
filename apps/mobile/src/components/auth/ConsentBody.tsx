// 국외 이전 고지 본문. 동의 화면과 미리보기(/preview)가 같이 쓴다.
import { Linking, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { space, tokens } from '@/constants/theme';
import { TRANSFERS } from '@/lib/consent';
import { DANCHU_URL } from '@/lib/danchuLinks';

/** 고지 항목(개인정보 보호법 제28조의8)은 접지 않고 펼친 채로 둔다(결정 E2 ①). 미리보기도 이것을 쓴다. */
export function ConsentBody() {
  return (
    <View style={{ gap: space.lg }}>
      {TRANSFERS.map((t) => (
        <View key={t.to} style={styles.block}>
          <View style={styles.head}>
            <Txt variant="label" style={{ flex: 1 }}>
              {t.to}
            </Txt>
            <Txt variant="caption" color={tokens.muted}>
              {t.country}
            </Txt>
          </View>
          <Row k="목적" v={t.purpose} />
          <Row k="항목" v={t.items} />
          <Row k="보관" v={t.keep} />
        </View>
      ))}
      <Row k="이전 방법" v="이용할 때마다 암호화 통신으로 전송" />
      <Row k="동의하지 않으면" v="에이전트를 쓸 수 없어요. 단추 웹은 그대로 이용해요." />
      <Txt variant="caption" color={tokens.muted} style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL(`${DANCHU_URL}/privacy`)}>
        개인정보 처리방침
      </Txt>
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Txt variant="small" color={tokens.muted} style={styles.k}>
        {k}
      </Txt>
      <Txt variant="small" style={{ flex: 1 }}>
        {v}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 6,
    paddingBottom: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.border,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    marginBottom: 2,
  },
  row: { flexDirection: 'row', gap: space.md },
  k: { width: 104 },
  link: { textDecorationLine: 'underline', marginTop: space.sm },
});
