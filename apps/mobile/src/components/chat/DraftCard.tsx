// 초안 카드: 이름, 본문, 덧붙는 줄(받는 기관·견적 총액), 점검에서 뺀 문장 수, 아래 주 버튼 하나.
// 대화 화면과 미리보기(/preview)가 같이 쓴다.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';

export function DraftCard({ title, body, dropped = 0, children, action, onAction }: { title: string; body: string; dropped?: number; children?: ReactNode; action: string; onAction: () => void }) {
  return (
    <View style={styles.card}>
      <Txt variant="label" style={{ fontFamily: fonts.bold, marginBottom: space.sm }}>
        {title}
      </Txt>
      {/* 본문 전체는 다음 카드(접수 확인)에서 펼쳐 본다. 여기서는 세 줄까지(진단 문서 A07 반영안) */}
      <Txt variant="small" color={tokens.muted} numberOfLines={3}>
        {body}
      </Txt>
      {children}
      {dropped > 0 && (
        <Txt variant="caption" color={tokens.wait} style={{ marginTop: space.sm }} tabular>
          {`점검에서 뺀 문장 ${dropped}개`}
        </Txt>
      )}
      <View style={styles.act}>
        <Button title={action} tall onPress={onAction} />
      </View>
    </View>
  );
}

/** 카드 안 한 줄(이름, 값, 오른쪽 글자 버튼) */
export function DraftLine({ k, v, bold, right }: { k: string; v: string; bold?: boolean; right?: ReactNode }) {
  return (
    <View style={styles.to}>
      <Txt variant="caption" color={tokens.muted} style={{ fontFamily: fonts.semibold }}>
        {k}
      </Txt>
      <Txt variant="small" tabular style={{ flex: 1, fontFamily: bold ? fonts.bold : fonts.semibold }} numberOfLines={2}>
        {v}
      </Txt>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, padding: space.lg, gap: 6 },
  act: { marginTop: space.md },
  to: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: tokens.border, minHeight: 44 },
});
