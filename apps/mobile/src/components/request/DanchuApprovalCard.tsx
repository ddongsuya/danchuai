// 단추에 견적 요청하기 전 마지막 확인(의뢰자, 단추 연동 모드).
// 에이전트가 대화에서 채운 값을 그대로 보여 주고, 빈 값만 시트로 하나씩 묻는다. 버튼은 하나.
// 참고: 토스 송금(질문형 제목, 아래 시트 선택, 큰 버튼 하나), ChatGPT 승인 카드(입력창 자리), Cash App 확인 목록.
// 받을 기관 수는 묻지 않는다. 분야가 맞는 참여 기관 전체에게 간다(2026-11-17 사용자 결정).
// 승인 기록(epoch + 해시)과 한 번만 실행은 서버가 맡는다. 화면은 보낼 값(payload)으로만 그린다.
import type { RequestSheet } from '@danchuai/core';
import { CaretDown, CaretRight, X } from 'phosphor-react-native';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { CheckMark } from '@/components/ui/Checkbox';
import { IconButton } from '@/components/ui/IconButton';
import { Press } from '@/components/ui/Press';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { DANCHU_URL } from '@/lib/danchuLinks';
import { lineEnter } from '@/lib/motion';
import { AGREEMENTS, FIELD_LABEL, FIELD_OPTIONS, nextMissing, type ChoiceField, type SendChoices } from '@/lib/danchuRequest';

const QUESTION: Record<ChoiceField, string> = {
  categories: '어떤 시험이에요?',
  purpose: '어디에 쓸 자료예요?',
  intent: '지금 어느 단계예요?',
  confid: '비밀유지 계약이 필요해요?',
};

interface Props {
  sheet: RequestSheet;
  body: string;
  choices: SendChoices;
  onChange: (c: SendChoices) => void;
  sending: boolean;
  onClose: () => void;
  /** 동의까지 받은 값으로 접수 */
  onApprove: (c: SendChoices) => void;
}

export function DanchuApprovalCard({ sheet, body, choices: c, onChange, sending, onClose, onApprove }: Props) {
  const [asking, setAsking] = useState<ChoiceField | null>(null);
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const gap = nextMissing(sheet, c);
  const value = (f: ChoiceField) => (f === 'categories' ? c.categories.join(', ') : c[f]) || null;

  const rows: { key: string; label: string; value: string | null; field?: ChoiceField }[] = [
    { key: 'to', label: '받는 곳', value: '분야가 맞는 참여 기관 전체' },
    { key: 'substance', label: '시험물질', value: sheet.substance?.trim() || null },
    { key: 'categories', label: FIELD_LABEL.categories, value: value('categories'), field: 'categories' },
    { key: 'purpose', label: FIELD_LABEL.purpose, value: value('purpose'), field: 'purpose' },
    { key: 'intent', label: FIELD_LABEL.intent, value: value('intent'), field: 'intent' },
    { key: 'confid', label: FIELD_LABEL.confid, value: value('confid'), field: 'confid' },
    { key: 'reply', label: '회신 기한', value: c.replyBy || '7영업일 후' },
  ];

  const primary =
    gap === 'substance'
      ? { title: '시험물질 알려 주기', onPress: onClose }
      : gap && gap !== 'agreed'
        ? { title: `${FIELD_LABEL[gap]} 정하기`, onPress: () => setAsking(gap) }
        : { title: '동의하고 요청하기', onPress: () => onApprove({ ...c, agreed: true }) };

  return (
    <Animated.View entering={lineEnter(0, reduced)} style={styles.card} accessibilityViewIsModal>
      <View style={styles.head}>
        <Txt variant="heading" style={{ flex: 1 }} accessibilityRole="header">
          이대로 단추에 요청할까요?
        </Txt>
        <IconButton label="닫기" onPress={onClose}>
          <X size={18} color={tokens.muted} />
        </IconButton>
      </View>

      <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: 2 }}>
        {rows.map((r, i) => {
          const empty = !r.value;
          const inner = (
            <>
              <Txt variant="small" color={tokens.muted} style={styles.label}>
                {r.label}
              </Txt>
              <Txt variant="small" color={empty ? tokens.wait : tokens.text} style={styles.value} numberOfLines={2}>
                {r.value ?? '정해 주세요'}
              </Txt>
              {r.field && <CaretRight size={14} color={tokens.faint} />}
            </>
          );
          // 카드 안 줄도 위에서부터 한 줄씩(줄 단위 등장 규칙)
          return (
            <Animated.View key={r.key} entering={lineEnter(i + 1, reduced)}>
              {r.field ? (
                <Press label={`${r.label} ${r.value ?? '비어 있음'}`} onPress={() => setAsking(r.field!)} style={styles.row}>
                  {inner}
                </Press>
              ) : (
                <View style={styles.row}>{inner}</View>
              )}
            </Animated.View>
          );
        })}
        <Press label={open ? '요청 본문 접기' : '요청 본문 펼치기'} onPress={() => setOpen((v) => !v)} style={[styles.row, { alignItems: 'flex-start' }]}>
          <Txt variant="small" color={tokens.muted} style={styles.label}>
            요청 본문
          </Txt>
          <Txt variant="small" style={styles.value} numberOfLines={open ? undefined : 2} selectable={open}>
            {body}
          </Txt>
          <CaretDown size={14} color={tokens.faint} style={{ marginTop: 3, transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
        </Press>
      </ScrollView>

      <Txt variant="caption" color={tokens.muted} style={styles.agree}>
        {'요청하면 '}
        {AGREEMENTS.map((a, i) => (
          <Txt key={a.id} variant="caption" color={tokens.muted}>
            <Txt variant="caption" color={tokens.text} style={styles.link} accessibilityRole="link" onPress={() => void Linking.openURL(`${DANCHU_URL}${a.href}`)}>
              {a.label}
            </Txt>
            {i < AGREEMENTS.length - 1 ? ', ' : ''}
          </Txt>
        ))}
        에 동의해요
      </Txt>

      <View style={{ marginTop: space.md }}>
        <Button title={primary.title} tall loading={sending} onPress={primary.onPress} />
      </View>

      <Picker
        field={asking}
        choices={c}
        onClose={() => setAsking(null)}
        onPick={(next) => {
          onChange(next);
          setAsking(null);
        }}
      />
    </Animated.View>
  );
}

/** 아래에서 올라오는 질문 시트. 하나 고르면 바로 닫힌다(시험 항목만 여러 개). */
function Picker({ field, choices, onClose, onPick }: { field: ChoiceField | null; choices: SendChoices; onClose: () => void; onPick: (c: SendChoices) => void }) {
  const [many, setMany] = useState<string[]>([]);
  // 닫히는 동안에도 마지막 질문을 그대로 보여 준다(내려가는 중에 내용이 비지 않게).
  const [last, setLast] = useState<ChoiceField | null>(field);
  if (field !== null && field !== last) setLast(field);
  const f = field ?? last;
  const multi = f === 'categories';
  return (
    <Sheet visible={field !== null} onClose={onClose} onShow={() => setMany(choices.categories)}>
      {f && (
        <View style={styles.sheet}>
          <Txt variant="title" style={{ fontSize: 22, lineHeight: 30, marginBottom: space.md }} accessibilityRole="header">
            {QUESTION[f]}
          </Txt>
          <ScrollView style={{ maxHeight: 420 }}>
            {FIELD_OPTIONS[f].map((o) => {
              const on = multi ? many.includes(o) : choices[f] === o;
              return (
                <Press
                  key={o}
                  label={o}
                  accessibilityState={{ selected: on }}
                  style={styles.option}
                  onPress={() => (multi ? setMany((m) => (m.includes(o) ? m.filter((x) => x !== o) : [...m, o])) : onPick({ ...choices, [f]: o }))}
                >
                  <Txt variant="body" style={{ flex: 1, fontFamily: on ? fonts.semibold : fonts.regular }}>
                    {o}
                  </Txt>
                  <CheckMark on={on} />
                </Press>
              );
            })}
          </ScrollView>
          {multi && (
            <View style={{ marginTop: space.md }}>
              <Button title={many.length ? `${many.length}개 선택` : '선택 전'} tall disabled={!many.length} onPress={() => onPick({ ...choices, categories: many })} />
            </View>
          )}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.sm,
    backgroundColor: tokens.surface,
    borderRadius: radius.approval,
    borderWidth: 1,
    borderColor: tokens.border,
    paddingTop: 18,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    shadowColor: tokens.ink,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44, paddingVertical: 10, borderTopWidth: 1, borderTopColor: tokens.border },
  label: { width: 72 },
  value: { flex: 1, fontFamily: fonts.semibold },
  agree: { marginTop: space.md },
  link: { textDecorationLine: 'underline' },
  sheet: { backgroundColor: tokens.surface, borderTopLeftRadius: radius.approval, borderTopRightRadius: radius.approval, paddingTop: space.xxl, paddingHorizontal: space.xl, paddingBottom: 34 },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderTopWidth: 1, borderTopColor: tokens.border },
});
