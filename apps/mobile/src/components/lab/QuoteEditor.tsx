// 기관: 견적 항목·금액·소요 기간 입력. 사람이 넣은 원 단위 금액만 쓰고, 합계는 코드(computeTotals)가 낸다.
import { computeTotals, formatWonShort, type QuoteLine } from '@danchuai/core';
import { Plus, Trash, X } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { groupDigits, MAX_ROWS, parseWeeks, readQuote, type QuoteRow } from '@/lib/quoteForm';

interface Props {
  initial: QuoteLine[];
  initialWeeks?: number;
  onClose: () => void;
  onSave: (lines: QuoteLine[], weeks: number) => void;
}

let seq = 0;
const row = (label = '', amount = ''): QuoteRow => ({ key: `r${++seq}`, label, amount });

export function QuoteEditor({ initial, initialWeeks, onClose, onSave }: Props) {
  const [rows, setRows] = useState<QuoteRow[]>(() =>
    initial.length ? initial.map((l) => row(l.label, groupDigits(String(l.amountWon)))) : [row()],
  );
  const [weeks, setWeeks] = useState(initialWeeks ? String(initialWeeks) : '');
  const [tried, setTried] = useState(false);
  const { lines, errors } = useMemo(() => readQuote(rows), [rows]);
  const wk = parseWeeks(weeks);
  // 입력 중에도 맞게 넣은 줄만 더해 보여 준다.
  const partial = useMemo(() => readQuote(rows.filter((r) => !errors[r.key])).lines ?? [], [rows, errors]);
  const totals = computeTotals(partial);

  const set = (key: string, patch: Partial<QuoteRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const save = () => {
    setTried(true);
    if (lines && wk) onSave(lines, wk);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.nav}>
          <IconButton label="닫기" onPress={onClose}>
            <X size={20} color={tokens.text} />
          </IconButton>
          <Txt variant="nav" style={styles.title} accessibilityRole="header">
            견적 금액
          </Txt>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={[styles.head, styles.grid]}>
              <Txt variant="caption" color={tokens.muted} style={styles.colLabel}>
                항목
              </Txt>
              <Txt variant="caption" color={tokens.muted} style={styles.colAmount}>
                금액(원)
              </Txt>
              <View style={styles.colDel} />
            </View>
            {rows.map((r, i) => {
              const e = tried ? errors[r.key] : null;
              const won = groupDigits(r.amount);
              return (
                <View key={r.key} style={[styles.grid, styles.line]}>
                  <TextInput
                    value={r.label}
                    onChangeText={(t) => set(r.key, { label: t })}
                    placeholder="항목 이름"
                    accessibilityLabel={`${i + 1}번 항목 이름`}
                    maxLength={60}
                    placeholderTextColor={tokens.faint}
                    selectionColor={tokens.accent}
                    style={[styles.input, styles.colLabel, e === 'label' && styles.bad]}
                  />
                  <TextInput
                    value={won}
                    onChangeText={(t) => set(r.key, { amount: groupDigits(t) })}
                    placeholder="0"
                    accessibilityLabel={`${i + 1}번 항목 금액(원)`}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    placeholderTextColor={tokens.faint}
                    selectionColor={tokens.accent}
                    style={[styles.input, styles.colAmount, styles.num, e === 'amount' && styles.bad]}
                  />
                  <View style={styles.colDel}>
                    {rows.length > 1 && (
                      <IconButton label={`${i + 1}번 항목 빼기`} plain onPress={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                        <Trash size={18} color={tokens.muted} />
                      </IconButton>
                    )}
                  </View>
                </View>
              );
            })}
            {rows.length < MAX_ROWS && (
              <View style={[styles.line, styles.add]}>
                <Button title="항목 추가" kind="text" icon={<Plus size={16} weight="bold" color={tokens.muted} />} onPress={() => setRows((rs) => [...rs, row()])} />
              </View>
            )}
          </View>

          {tried && Object.keys(errors).length > 0 && (
            <Txt variant="small" color={tokens.danger} accessibilityLiveRegion="polite">
              항목 이름과 금액(원)을 모두 넣어 주세요
            </Txt>
          )}

          <View style={styles.weeks}>
            <Txt variant="small" style={{ fontFamily: fonts.semibold }} nativeID="weeks-label">
              소요 기간(주)
            </Txt>
            <TextInput
              value={weeks}
              onChangeText={(t) => setWeeks(t.replace(/\D/g, '').slice(0, 3))}
              placeholder="0"
              accessibilityLabel="소요 기간(주)"
              accessibilityLabelledBy="weeks-label"
              keyboardType="number-pad"
              inputMode="numeric"
              placeholderTextColor={tokens.faint}
              selectionColor={tokens.accent}
              style={[styles.input, styles.num, styles.weekInput, tried && !wk && styles.bad]}
            />
            {tried && !wk && (
              <Txt variant="small" color={tokens.danger}>
                1~520주
              </Txt>
            )}
          </View>

          <View style={styles.sum} accessibilityLabel={`견적 총액 ${formatWonShort(totals.totalWithVatWon)}`}>
            <Sum label="공급가" value={formatWonShort(totals.subtotalWon)} />
            <Sum label="부가세" value={formatWonShort(totals.vatWon)} />
            <Sum label="견적 총액" value={formatWonShort(totals.totalWithVatWon)} total />
          </View>
        </ScrollView>

        <View style={styles.foot}>
          <Button title="저장" tall onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Sum({ label, value, total }: { label: string; value: string; total?: boolean }) {
  const s = total ? { fontFamily: fonts.bold, fontSize: 17 } : undefined;
  return (
    <View style={styles.sumLn}>
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
  root: { flex: 1, backgroundColor: tokens.bg },
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10 },
  title: { flex: 1, textAlign: 'center' },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xl, gap: space.lg },
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' },
  head: { backgroundColor: tokens.sunken, paddingVertical: space.sm },
  grid: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.md, paddingRight: 4, minHeight: 56 },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  colLabel: { flex: 1.3, minWidth: 0 },
  colAmount: { flex: 1, minWidth: 0 },
  colDel: { width: 44, alignItems: 'center' },
  input: { height: 44, borderRadius: radius.inner, backgroundColor: tokens.bg, borderWidth: 1, borderColor: tokens.border, paddingHorizontal: 10, fontFamily: fonts.regular, fontSize: 16, color: tokens.text },
  num: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  bad: { borderColor: tokens.danger, borderWidth: 2, paddingHorizontal: 9 },
  add: { paddingVertical: 4, alignItems: 'flex-start' },
  weeks: { gap: space.sm },
  weekInput: { width: 120, backgroundColor: tokens.surface, borderColor: tokens.borderInput },
  sum: { padding: space.lg, borderRadius: radius.card, backgroundColor: tokens.sunken, gap: 6 },
  sumLn: { flexDirection: 'row', justifyContent: 'space-between' },
  foot: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm, borderTopWidth: 1, borderTopColor: tokens.border, backgroundColor: tokens.bg },
});
