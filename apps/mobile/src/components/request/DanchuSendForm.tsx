// 단추 요청서로 보내기 전에 사람이 고르는 칸 (연동 4단계). 대화로 채운 시험물질·조건은 그대로 두고,
// 단추 요청서에만 있는 필수 선택(목적·성격·시험 항목·견적 수·기밀 등급)과 동의 세 가지를 받는다.
// 받는 기관은 고르지 않는다. 단추가 분야가 맞는 기관에 안내한다.
import { ArrowSquareOut, Check, X } from 'phosphor-react-native';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import type { RequestSheet } from '@danchuai/core';
import { DANCHU_URL } from '@/lib/danchuLinks';
import { AGREEMENTS, CATEGORIES, CONFIDS, CRO_COUNTS, INTENTS, missing, PURPOSES, type SendChoices } from '@/lib/danchuRequest';

interface Props {
  sheet: RequestSheet;
  initial: SendChoices;
  onClose: () => void;
  onDone: (c: SendChoices) => void;
}

export function DanchuSendForm({ sheet, initial, onClose, onDone }: Props) {
  const [c, setC] = useState<SendChoices>(initial);
  const gap = missing(sheet, c);
  const set = <K extends keyof SendChoices>(k: K, v: SendChoices[K]) => setC((x) => ({ ...x, [k]: v }));
  const toggleCat = (v: string) => set('categories', c.categories.includes(v) ? c.categories.filter((x) => x !== v) : [...c.categories, v]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.nav}>
        <IconButton label="닫기" onPress={onClose}>
          <X size={20} color={tokens.text} />
        </IconButton>
        <Txt variant="nav" style={styles.title} accessibilityRole="header">
          단추 요청서
        </Txt>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.fixed}>
          <Txt variant="caption" color={tokens.muted} style={{ fontFamily: fonts.semibold }}>
            시험물질
          </Txt>
          <Txt variant="label" style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>
            {sheet.substance?.trim() || '미정'}
          </Txt>
        </View>

        <Pick label="의뢰 목적" options={PURPOSES} value={c.purpose} onPick={(v) => set('purpose', v)} />
        <Pick label="요청 성격" options={INTENTS} value={c.intent} onPick={(v) => set('intent', v)} />
        <View style={styles.group} accessibilityLabel="시험 항목">
          <Txt variant="small" color={tokens.muted} style={styles.q}>
            시험 항목
          </Txt>
          <View style={styles.opts}>
            {CATEGORIES.map((o) => {
              const on = c.categories.includes(o);
              return (
                <Press key={o} label={o} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggleCat(o)} style={[styles.opt, on && styles.optOn]}>
                  <Txt variant="small" color={on ? tokens.onInk : tokens.text} style={{ fontFamily: fonts.medium }}>
                    {o}
                  </Txt>
                </Press>
              );
            })}
          </View>
        </View>
        <Pick label="받을 견적 수" options={CRO_COUNTS} value={c.croCount} onPick={(v) => set('croCount', v)} />
        <Pick label="기밀 등급" options={CONFIDS} value={c.confid} onPick={(v) => set('confid', v)} />
        <View style={styles.group}>
          <Field
            label="회신 희망일"
            value={c.replyBy}
            onChangeText={(t) => set('replyBy', t.trim())}
            placeholder="2026-12-01"
            inputMode="numeric"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={10}
            help="기본값 7영업일 뒤"
          />
        </View>

        <View style={[styles.group, styles.agree]}>
          {AGREEMENTS.map((a) => {
            const on = c.agreed[a.id];
            return (
              <View key={a.id} style={styles.agreeRow}>
                <Press
                  label={a.label}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => set('agreed', { ...c.agreed, [a.id]: !on })}
                  style={styles.agreeHit}
                >
                  <View style={[styles.ck, on && styles.ckOn]}>{on && <Check size={14} weight="bold" color={tokens.onInk} />}</View>
                  <Txt variant="small" style={{ flex: 1 }}>
                    {a.label}
                  </Txt>
                </Press>
                <IconButton label={`${a.label} 전문`} onPress={() => void Linking.openURL(`${DANCHU_URL}${a.href}`)}>
                  <ArrowSquareOut size={16} color={tokens.muted} />
                </IconButton>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.foot}>
        <Button title={gap ? `${gap} 확인` : '확인하기'} tall disabled={!!gap} onPress={() => onDone(c)} />
      </View>
    </SafeAreaView>
  );
}

function Pick<T extends string>({ label, options, value, onPick }: { label: string; options: readonly T[]; value: T | null; onPick: (v: T) => void }) {
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Txt variant="small" color={tokens.muted} style={styles.q}>
        {label}
      </Txt>
      <View style={styles.opts}>
        {options.map((o) => {
          const on = value === o;
          return (
            <Press key={o} label={o} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onPick(o)} style={[styles.opt, on && styles.optOn]}>
              <Txt variant="small" color={on ? tokens.onInk : tokens.text} style={{ fontFamily: fonts.medium }}>
                {o}
              </Txt>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10 },
  title: { flex: 1, textAlign: 'center' },
  body: { paddingHorizontal: space.xl, paddingBottom: space.xl },
  fixed: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingHorizontal: 14, borderRadius: radius.inner, backgroundColor: tokens.sunken },
  group: { marginTop: 22 },
  q: { marginBottom: space.sm, fontFamily: fonts.semibold },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  opt: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: tokens.sunken, justifyContent: 'center' },
  optOn: { backgroundColor: tokens.ink },
  agree: { borderTopWidth: 1, borderTopColor: tokens.border, paddingTop: space.md },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  agreeHit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  ck: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: tokens.borderInput, alignItems: 'center', justifyContent: 'center' },
  ckOn: { backgroundColor: tokens.ink, borderColor: tokens.ink },
  foot: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm, borderTopWidth: 1, borderTopColor: tokens.border, backgroundColor: tokens.bg },
});
