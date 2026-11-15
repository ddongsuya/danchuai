// 기관 견적 초안. 금액은 단가표 줄을 코드(computeTotals)로 더한 값만 쓴다. AI가 쓴 금액은 쓰지 않는다.
import { computeTotals, formatWonShort, type QuoteLine } from '@danchuai/core';
import { Calculator } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';

export function QuoteDraftCard({ lines, onEdit, onWrite }: { lines: (QuoteLine & { note: string })[]; onEdit?: () => void; onWrite: () => void }) {
  const t = computeTotals(lines);
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, flex: 1 }}>
          견적 초안
        </Txt>
        <Chip label="단가표 계산" icon={(c) => <Calculator size={13} weight="bold" color={c} />} />
      </View>
      {lines.map((l) => (
        <View key={l.label} style={styles.ln}>
          <Txt variant="small" color={tokens.muted}>
            {l.label}
            <Txt variant="caption" color={tokens.faint}>
              {'  '}
              {l.note}
            </Txt>
          </Txt>
          <Txt variant="small" tabular>
            {formatWonShort(l.amountWon)}
          </Txt>
        </View>
      ))}
      <View style={styles.sum}>
        <Line label="공급가" value={formatWonShort(t.subtotalWon)} />
        <Line label="부가세" value={formatWonShort(t.vatWon)} />
        <Line label="견적 총액" value={formatWonShort(t.totalWithVatWon)} total />
      </View>
      <View style={styles.act}>
        <Button title="항목 고치기" kind="line" flex={1} onPress={onEdit} />
        <Button title="회신 본문 쓰기" flex={1} onPress={onWrite} />
      </View>
    </View>
  );
}

function Line({ label, value, total }: { label: string; value: string; total?: boolean }) {
  const s = total ? { fontFamily: fonts.bold, fontSize: 17 } : undefined;
  return (
    <View style={[styles.sumLn, total && { paddingTop: space.xs }]}>
      <Txt variant="small" color={total ? tokens.text : tokens.muted} style={s}>
        {label}
      </Txt>
      <Txt variant="small" tabular style={s}>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, marginTop: space.md, overflow: 'hidden' },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 10 },
  ln: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.sm, paddingHorizontal: 14 },
  sum: { marginTop: 6, paddingVertical: space.md, paddingHorizontal: 14, backgroundColor: tokens.sunken, gap: 6 },
  sumLn: { flexDirection: 'row', justifyContent: 'space-between' },
  act: { flexDirection: 'row', gap: space.sm, padding: 10 },
});
