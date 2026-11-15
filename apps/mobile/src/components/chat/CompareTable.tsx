// 회신 비교표. 열은 도착 순으로만 놓고 순위·추천은 하지 않는다. 기관끼리 값이 다른 행만 청록 점과 굵기로 표시한다.
import { formatWonShort } from '@danchuai/core';
import { ArrowsOutSimple } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import type { Reply } from '@/data/demo';

interface Row {
  label: string;
  values: string[];
  money?: boolean;
}

export function byArrival(replies: readonly Reply[]): Reply[] {
  return [...replies].sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));
}

export function CompareTable({ replies, nameOf }: { replies: readonly Reply[]; nameOf: (id: string) => string }) {
  const cols = byArrival(replies);
  const rows: Row[] = [
    { label: '도착', values: cols.map((r) => r.receivedLabel) },
    { label: '견적 총액', values: cols.map((r) => formatWonShort(r.totalWithVatWon)), money: true },
    { label: '소요 기간', values: cols.map((r) => `${r.durationWeeks}주`) },
    { label: '회복군', values: cols.map((r) => `군당 ${r.recoveryPerGroup}`) },
    { label: 'TK 분석', values: cols.map((r) => (r.tk ? '포함' : '미포함')) },
  ];
  return (
    <View style={styles.card}>
      <View style={[styles.tr, styles.head]}>
        <View style={styles.k} />
        {cols.map((r) => (
          <Txt key={r.recipientId} variant="caption" style={[styles.v, { fontFamily: fonts.bold }]}>
            {nameOf(r.recipientId)}
          </Txt>
        ))}
      </View>
      {rows.map((row) => {
        // 도착일·금액은 늘 다르므로 차이 표시는 시험 조건 행에만 한다.
        const differs = !row.money && row.label !== '도착' && new Set(row.values).size > 1;
        return (
          <View key={row.label} style={[styles.tr, styles.line]} accessibilityLabel={`${row.label}${differs ? ', 기관끼리 다름' : ''}: ${row.values.join(', ')}`}>
            <View style={[styles.k, styles.kRow]}>
              {differs && <View style={styles.dot} />}
              <Txt variant="small" color={differs ? tokens.text : tokens.muted} style={differs && { fontFamily: fonts.semibold }}>
                {row.label}
              </Txt>
            </View>
            {row.values.map((v, i) => (
              <View key={i} style={[styles.v, styles.vRow]}>
                <Txt
                  variant="small"
                  tabular
                  style={[
                    row.money && { fontFamily: fonts.bold, fontSize: 15.5 },
                    differs && { fontFamily: fonts.bold },
                  ]}
                >
                  {v}
                </Txt>
                {row.money && (
                  <Txt variant="caption" color={tokens.accent} style={styles.src} accessibilityLabel={`출처 회신서 ${i + 1}`}>
                    {i + 1}
                  </Txt>
                )}
              </View>
            ))}
          </View>
        );
      })}
      <View style={[styles.foot, styles.line]}>
        <Txt variant="caption" color={tokens.muted}>
          부가세 포함
        </Txt>
        <Button title="크게 보기" kind="ghost" icon={<ArrowsOutSimple size={16} color={tokens.muted} />} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, marginTop: space.md, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14 },
  head: { backgroundColor: tokens.sunken },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  k: { flex: 1 },
  kRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  v: { width: 104, textAlign: 'right' },
  vRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: tokens.accent },
  src: { fontFamily: fonts.bold, fontSize: 10.5, lineHeight: 12, marginLeft: 2 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 14, paddingRight: 4, paddingVertical: 2 },
});
