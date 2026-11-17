// 국외 이전 고지 본문. 동의 화면과 미리보기(/preview)가 같이 쓴다.
// 진단 문서 A03 "② 토스식 접기"(사용자 선택 2026-11-17, Mobbin 280b81aa): 받는 곳마다 [필수] 행 하나, 누르면 고지 항목이 펼쳐진다.
// 접어 둬도 고지 의무(개인정보 보호법 제28조의8)를 채우는지는 법 확인이 필요하다(추측, 출시 전 확인 목록).
import { CaretDown } from 'phosphor-react-native';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, space, tokens } from '@/constants/theme';
import { TRANSFERS, type TransferRow } from '@/lib/consent';
import { DANCHU_URL } from '@/lib/danchuLinks';
import { lineEnter } from '@/lib/motion';

export function ConsentBody() {
  return (
    <View style={{ gap: space.lg }}>
      <View style={styles.card}>
        {TRANSFERS.map((t, i) => (
          <Item key={t.to} t={t} first={i === 0} />
        ))}
      </View>
      <Txt variant="small" color={tokens.muted}>
        동의하지 않아도 단추 웹은 그대로 쓸 수 있어요.
      </Txt>
    </View>
  );
}

/** 받는 곳 이름에서 괄호 속 리전은 펼친 뒤에 보인다 */
const shortName = (to: string) => to.replace(/\s*\(.*\)\s*$/, '');

function Item({ t, first }: { t: TransferRow; first: boolean }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  return (
    <View style={[styles.item, !first && styles.line]}>
      <Press
        label={`[필수] ${shortName(t.to)} ${t.country}, ${t.purpose}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.head}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="small">
            <Txt variant="small" style={{ fontFamily: fonts.semibold }}>
              [필수] {shortName(t.to)}
            </Txt>{' '}
            <Txt variant="small" color={tokens.muted}>
              {t.country}
            </Txt>
          </Txt>
          <Txt variant="caption" color={tokens.muted}>
            {t.purpose}
          </Txt>
        </View>
        <View style={open && styles.flip}>
          <CaretDown size={18} color={tokens.text} />
        </View>
      </Press>
      {open && (
        <Animated.View entering={lineEnter(0, reduced)} style={styles.more}>
          <Row k="받는 곳" v={t.to} />
          <Row k="항목" v={t.items} />
          <Row k="보관" v={t.keep} />
          <Row k="이전 방법" v="이용할 때마다 암호화 통신으로 전송" />
          <Txt variant="caption" color={tokens.muted} style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL(`${DANCHU_URL}/privacy`)}>
            개인정보 처리방침
          </Txt>
        </Animated.View>
      )}
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Txt variant="caption" color={tokens.muted} style={styles.k}>
        {k}
      </Txt>
      <Txt variant="caption" style={{ flex: 1 }}>
        {v}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: 16, borderWidth: 1, borderColor: tokens.border, paddingHorizontal: space.lg },
  item: { paddingVertical: space.md },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  flip: { transform: [{ rotate: '180deg' }] },
  more: { gap: 6, paddingTop: space.sm },
  row: { flexDirection: 'row', gap: space.md },
  k: { width: 64 },
  link: { textDecorationLine: 'underline', marginTop: space.xs },
});
