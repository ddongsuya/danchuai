// 단추에 견적 요청하기 전 마지막 확인(의뢰자, 단추 연동 모드).
// 에이전트가 대화에서 채운 값을 그대로 보여 주고, 빈 값만 시트로 하나씩 묻는다. 버튼은 하나.
// 참고: 토스 송금(질문형 제목, 아래 시트 선택, 큰 버튼 하나), ChatGPT 승인 카드(입력창 자리), Cash App 확인 목록.
// 받을 기관 수는 묻지 않는다. 분야가 맞는 참여 기관 전체에게 간다(2026-11-17 사용자 결정).
// 승인 기록(epoch + 해시)과 한 번만 실행은 서버가 맡는다. 화면은 보낼 값(payload)으로만 그린다.
// 단추 양식을 받았으면 분야마다 시험 종류와 조건부 필수 칸(PK 동물 시험의 군 수·군당 마릿수)을 줄로 보여 주고, 비면 묻는다.
import type { RequestSheet } from '@danchuai/core';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ConfirmCard } from '@/components/chat/ConfirmCard';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { CheckMark } from '@/components/ui/Checkbox';
import { Press } from '@/components/ui/Press';
import { Sheet, SheetBody } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { DANCHU_URL, openWeb } from '@/lib/danchuLinks';
import { haptic } from '@/lib/haptics';
import { lineEnter } from '@/lib/motion';
import { subjName } from '@/lib/format';
import { useAgentName } from '@/lib/session';
import {
  AGREEMENTS,
  FIELD_LABEL,
  FIELD_OPTIONS,
  nextMissing,
  requiredDetails,
  showDetail,
  type ChoiceField,
  type RequestSchemaView,
  type SchemaField,
  type SendChoices,
} from '@/lib/danchuRequest';

type Ask = ChoiceField | { detail: SchemaField } | null;
const MULTI = new Set(['chips']);
/** 분야 칸 질문. 시험 종류는 분야 이름을 함께 */
const detailQuestion = (f: SchemaField) => {
  const cat = f.key.slice(0, f.key.lastIndexOf('.'));
  if (f.key.endsWith('.items') || f.key.endsWith('.segment')) return `${cat} 중 어떤 시험이에요?`;
  return `${f.label}${f.requiredIf ? '는 몇이에요?' : '을 정해 주세요'}`;
};

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
  /** 단추 요청서 양식. 없으면 분야만 보낸다 */
  schema?: RequestSchemaView | null;
  /** 단추 검사에서 걸린 문구(보내기 전 검사) */
  issue?: string | null;
  sending: boolean;
  onClose: () => void;
  /** 동의까지 받은 값으로 접수 */
  onApprove: (c: SendChoices) => void;
}

export function DanchuApprovalCard({ sheet, body, choices: c, onChange, schema, issue, sending, onClose, onApprove }: Props) {
  const agentName = useAgentName();
  const [asking, setAsking] = useState<Ask>(null);
  const reduced = useReducedMotion();
  const gap = nextMissing(sheet, c, schema);
  const many = c.categories.length > 1;
  const value = (f: ChoiceField) => (f === 'categories' ? c.categories.join(', ') : c[f]) || null;

  // 시안 A08(사용자 선택 2026-11-17, 고르기 보드 "시안대로"): 받는 곳, 시험물질, 의뢰 목적, 회신 기한 4줄만.
  // 나머지 칸(시험 항목·요청 성격·기밀 등급)은 비어 있을 때만 주 버튼이 "○○ 정하기"로 묻는다.
  // 단추 양식이 있으면 분야마다 시험 종류와 지금 필수인 칸(PK 군 수·군당 마릿수)을 시험물질 아래에 둔다
  const detailRows = requiredDetails(c, schema).map((f) => {
    const cat = f.key.slice(0, f.key.lastIndexOf('.'));
    const items = f.key.endsWith('.items') || f.key.endsWith('.segment');
    const v = showDetail(c.details?.[f.key]);
    return { key: f.key, label: items ? '시험 종류' : f.label, value: v && items && many ? `${cat}: ${v}` : v, field: { detail: f } as Ask };
  });
  const rows: { key: string; label: string; value: string | null; field?: Ask }[] = [
    { key: 'substance', label: '시험물질', value: sheet.substance?.trim() || null },
    ...detailRows,
    { key: 'purpose', label: FIELD_LABEL.purpose, value: value('purpose'), field: 'purpose' },
    { key: 'reply', label: '회신 기한', value: c.replyBy || '7영업일 후' },
  ];

  const primary =
    gap === 'substance'
      ? { title: '시험물질 알려 주기', onPress: onClose }
      : gap && typeof gap === 'object'
        ? { title: `${gap.detail.key.endsWith('.items') || gap.detail.key.endsWith('.segment') ? '시험 종류' : gap.detail.label} 정하기`, onPress: () => setAsking(gap) }
        : gap && gap !== 'agreed'
          ? { title: `${FIELD_LABEL[gap]} 정하기`, onPress: () => setAsking(gap) }
          : { title: '허용', onPress: () => onApprove({ ...c, agreed: true }) };

  return (
    <>
      <ConfirmCard
        title={`${subjName(agentName)} 기관에 견적 요청을 보내려고 해요`}
        note="요청서 내용을 확인한 뒤 허용해 주세요."
        preview={
          <View style={styles.rows}>
            {rows.map((r, i) => {
              const empty = !r.value;
              const inner = (
                <>
                  <Txt variant="small" color={tokens.muted} style={styles.label}>
                    {r.label}
                  </Txt>
                  <Txt variant="small" color={empty ? tokens.wait : tokens.text} style={styles.value} numberOfLines={2}>
                    {r.value ?? '아직 정하지 않았어요'}
                  </Txt>
                </>
              );
              // 카드 안 줄도 위에서부터 한 줄씩(줄 단위 등장 규칙)
              return (
                <Animated.View key={r.key} entering={lineEnter(i + 1, reduced)}>
                  {r.field ? (
                    <Press label={`${r.label} ${r.value ?? '비어 있음'}`} onPress={() => setAsking(r.field!)} style={[styles.row, i > 0 && styles.line]}>
                      {inner}
                    </Press>
                  ) : (
                    <View style={[styles.row, i > 0 && styles.line]}>{inner}</View>
                  )}
                </Animated.View>
              );
            })}
          </View>
        }
        recipient={{ title: '받는 곳: 분야가 맞는 참여 기관 전체', sub: '의뢰자 정보는 선정 뒤에 보여요', icon: 'person' }}
        issue={issue}
        rejectLabel="거절"
        allowLabel={sending ? '보내는 중이에요' : primary.title}
        busy={sending}
        onReject={onClose}
        onAllow={primary.onPress}
        foot={
          <View style={{ gap: 4 }}>
            <Txt variant="caption" color={tokens.muted} style={styles.center}>
              허용하면 이 내용 그대로 한 번 보내요
            </Txt>
            <Txt variant="caption" color={tokens.muted} style={styles.center}>
              {AGREEMENTS.map((a, i) => (
                <Txt key={a.id} variant="caption" color={tokens.muted}>
                  <Txt variant="caption" color={tokens.muted} accessibilityRole="link" onPress={() => void openWeb(`${DANCHU_URL}${a.href}`)}>
                    {a.label}
                  </Txt>
                  {i < AGREEMENTS.length - 1 ? ', ' : ''}
                </Txt>
              ))}
              에 동의해요
            </Txt>
          </View>
        }
      />
      <Picker
        field={asking}
        choices={c}
        onClose={() => setAsking(null)}
        onPick={(next) => {
          onChange(next);
          setAsking(null);
        }}
      />
    </>
  );
}

/** 아래에서 올라오는 질문 시트. 하나 고르면 바로 닫힌다(여러 개 고르는 칸과 숫자 칸은 정하기 버튼). */
function Picker({ field, choices, onClose, onPick }: { field: Ask; choices: SendChoices; onClose: () => void; onPick: (c: SendChoices) => void }) {
  const [many, setMany] = useState<string[]>([]);
  const [text, setText] = useState('');
  // 닫히는 동안에도 마지막 질문을 그대로 보여 준다(내려가는 중에 내용이 비지 않게).
  const [last, setLast] = useState<Ask>(field);
  if (field !== null && field !== last) setLast(field);
  const f = field ?? last;
  const detail = f && typeof f === 'object' ? f.detail : null;
  const options = detail ? detail.options ?? null : f ? FIELD_OPTIONS[f as ChoiceField] : null;
  const multi = detail ? MULTI.has(detail.type) : f === 'categories';
  const current = (): string[] => {
    if (detail) {
      const v = choices.details?.[detail.key];
      return Array.isArray(v) ? v : v ? [v] : [];
    }
    return f === 'categories' ? choices.categories : [];
  };
  const setDetail = (v: string | string[]) => ({ ...choices, details: { ...choices.details, [detail!.key]: v } });
  const pickMany = () => onPick(detail ? setDetail(many) : { ...choices, categories: many });
  const title = detail ? detailQuestion(detail) : f ? QUESTION[f as ChoiceField] : '';
  const primary = !options ? (
    <Button title={text.trim() ? '정하기' : '적기 전'} tall disabled={!text.trim()} onPress={() => onPick(setDetail(text.trim()))} />
  ) : multi ? (
    <Button title={many.length ? `${many.length}개 정하기` : '고르기 전'} tall disabled={!many.length} onPress={pickMany} />
  ) : undefined;
  return (
    <Sheet
      visible={field !== null}
      onClose={onClose}
      onShow={() => {
        setMany(current());
        setText(current()[0] ?? '');
      }}
    >
      {f && (
        <SheetBody title={title} onClose={onClose} primary={primary}>
          {options ? (
            <ScrollView style={{ maxHeight: u(420) }}>
              {options.map((o) => {
                const on = multi ? many.includes(o) : detail ? current()[0] === o : choices[f as Exclude<ChoiceField, 'categories'>] === o;
                return (
                  <Press
                    key={o}
                    label={o}
                    accessibilityRole={multi ? 'checkbox' : 'radio'}
                    accessibilityState={multi ? { checked: on } : { selected: on }}
                    style={styles.option}
                    onPress={() => {
                      haptic.tap();
                      if (multi) setMany((m) => (m.includes(o) ? m.filter((x) => x !== o) : [...m, o]));
                      else onPick(detail ? setDetail(o) : { ...choices, [f as ChoiceField]: o });
                    }}
                  >
                    <Txt variant="body" style={{ flex: 1, fontFamily: on ? fonts.semibold : fonts.regular }}>
                      {o}
                    </Txt>
                    <CheckMark on={on} />
                  </Press>
                );
              })}
            </ScrollView>
          ) : (
            <TextInput
              value={text}
              onChangeText={setText}
              accessibilityLabel={detail?.label}
              selectionColor={tokens.accent}
              cursorColor={tokens.accent}
              keyboardType={detail?.requiredIf ? 'number-pad' : 'default'}
              autoFocus
              style={styles.input}
            />
          )}
        </SheetBody>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  rows: { paddingHorizontal: 14, paddingVertical: 4 },
  center: { textAlign: 'center' },
  // 시안 .kv: 이름표 88, 간격 12, 위아래 9, 값은 보통 굵기, 줄 사이에만 선
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: u(9) },
  line: { borderTopWidth: 1, borderTopColor: tokens.line },
  label: { width: u(80) },
  value: { flex: 1 },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: u(56), borderTopWidth: 1, borderTopColor: tokens.border },
  input: { height: u(52), borderRadius: radius.inner, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.borderInput, paddingHorizontal: space.lg, fontFamily: fonts.regular, fontSize: u(16), color: tokens.text },
});
