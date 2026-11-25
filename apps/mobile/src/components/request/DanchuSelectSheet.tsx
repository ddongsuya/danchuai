// 의뢰자: 단추 비교표에서 기관 선정(연동 5단계). 토스 송금처럼 "고르기 → 확인 → 버튼 하나".
// 목록은 회신 도착 순 그대로(추천·순위 없음). 금액은 단추가 저장한 값 그대로.
// 선정은 되돌릴 수 없어서 고른 뒤 한 번 더 확인한다. 확인 단계에서 선정 사유를 고를 수 있다(고르지 않아도 선정).
// 승인 기록과 한 번만 실행은 서버가 맡는다.
import { formatWonShort } from '@danchuai/core';
import { CaretRight, CheckCircle, WarningCircle } from 'phosphor-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { approveDanchuAction, draftDanchuAction } from '@/lib/agentClient';
import type { DanchuCompareColumn } from '@/lib/marketClient';
import { SELECT_NOTE_MAX, SELECT_REASONS, selectBody, toggleReason, type SelectReason } from '@/lib/selectReasons';

/** 확인 단계: 되돌릴 수 없으니 원 단위 그대로 */
const won = (n: number | null) => (n == null ? '금액 미기재' : `${n.toLocaleString('ko-KR')}원`);
/** 고르기 목록: 비교표와 같은 만 원 표기 */
const wonShort = (n: number | null) => (n == null ? '금액 미기재' : `${formatWonShort(n)} 원`);
const weeks = (n: number | null) => (n ? `${n}주` : '기간 미기재');

interface Props {
  no: string;
  visible: boolean;
  columns: DanchuCompareColumn[];
  onClose: () => void;
  /** 선정이 끝났다(화면이 다시 읽는다) */
  onDone: () => void;
}

type Step = { kind: 'pick' } | { kind: 'confirm'; col: DanchuCompareColumn } | { kind: 'sending'; col: DanchuCompareColumn } | { kind: 'error'; col: DanchuCompareColumn; message: string };

export function DanchuSelectSheet({ no, visible, columns, onClose, onDone }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [reasons, setReasons] = useState<SelectReason[]>([]);
  const [note, setNote] = useState('');
  const sending = step.kind === 'sending';
  // 시트는 화면의 90%까지. 확인 단계는 내용만 스크롤하고 버튼은 늘 보이게
  const { height } = useWindowDimensions();

  /** 다른 기관을 고르면 사유도 처음부터 */
  const toPick = () => {
    setStep({ kind: 'pick' });
    setReasons([]);
    setNote('');
  };
  const close = () => {
    if (sending) return;
    toPick();
    onClose();
  };

  const select = async (col: DanchuCompareColumn) => {
    if (!col.quoteId || !col.revision) return;
    setStep({ kind: 'sending', col });
    try {
      const d = await draftDanchuAction('requester', 'select', selectBody({ quoteId: col.quoteId, revision: col.revision }, reasons, note), no);
      const r = await approveDanchuAction('requester', d);
      if (r.status === 'sent') {
        toPick();
        onDone();
        return;
      }
      const reason = typeof r.result?.error === 'string' ? r.result.error : null;
      setStep({
        kind: 'error',
        col,
        message: r.status === 'failed' ? (reason ?? '단추가 받지 않았어요. 확인하고 다시 보내 주세요') : '결과를 확인해 주세요',
      });
    } catch {
      setStep({ kind: 'error', col, message: '연결이 잠깐 끊겼어요' });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel="닫기" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { maxHeight: height * 0.9 }]} accessibilityViewIsModal>
          {step.kind === 'pick' ? (
            <>
              <Txt variant="title" style={styles.q} accessibilityRole="header">
                어느 기관을 선정할까요?
              </Txt>
              <ScrollView style={{ maxHeight: u(420) }}>
                {columns.map((c, i) => {
                  const ok = !!c.selectable && !!c.quoteId && !!c.revision;
                  return (
                    <Press key={c.quoteId ?? i} label={`${c.lab} ${won(c.total)}`} disabled={!ok} onPress={() => setStep({ kind: 'confirm', col: c })} style={styles.option}>
                      <View style={{ flex: 1, gap: u(2) }}>
                        <Txt variant="body" style={{ fontFamily: fonts.semibold }}>
                          {c.lab}
                        </Txt>
                        <Txt variant="small" color={tokens.muted} tabular>
                          {ok ? `${wonShort(c.total)}, ${weeks(c.weeks)}` : '정식 견적서 전'}
                        </Txt>
                      </View>
                      {ok && <CaretRight size={u(16)} color={tokens.faint} />}
                    </Press>
                  );
                })}
              </ScrollView>
            </>
          ) : (
            <>
              <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
                <Txt variant="title" style={styles.q} accessibilityRole="header">
                  {`${step.col.lab}\n선정할까요?`}
                </Txt>
                <View style={styles.facts}>
                  <Fact k="견적 총액" v={won(step.col.total)} strong />
                  <Fact k="소요 기간" v={weeks(step.col.weeks)} />
                  <Fact k="견적 판" v={step.col.revision ? `${step.col.revision}판` : '-'} />
                </View>

                <View style={styles.why}>
                  <Txt variant="small" color={tokens.muted} nativeID="select-reasons">
                    선정 사유
                  </Txt>
                  <View style={styles.pills} accessibilityLabelledBy="select-reasons">
                    {SELECT_REASONS.map((r) => {
                      const on = reasons.includes(r);
                      return (
                        <Press
                          key={r}
                          label={r}
                          accessibilityRole="checkbox"
                          accessibilityState={{
                            checked: on,
                            disabled: sending,
                          }}
                          disabled={sending}
                          onPress={() => setReasons((p) => toggleReason(p, r))}
                          style={[styles.pill, on && styles.pillOn]}
                        >
                          <Txt variant="small" color={on ? tokens.onInk : tokens.text} style={{ fontFamily: fonts.semibold }}>
                            {r}
                          </Txt>
                        </Press>
                      );
                    })}
                  </View>
                  {reasons.includes('기타') && <Field label="기타 사유" value={note} onChangeText={setNote} maxLength={SELECT_NOTE_MAX} editable={!sending} returnKeyType="done" />}
                </View>

                {step.kind === 'error' && (
                  <View style={styles.err} accessibilityRole="alert">
                    <WarningCircle size={u(16)} weight="fill" color={tokens.danger} />
                    <Txt variant="caption" color={tokens.danger} style={{ fontFamily: fonts.semibold, flex: 1 }}>
                      {step.message}
                    </Txt>
                  </View>
                )}
              </ScrollView>
              <View style={styles.actions}>
                <View style={styles.notes}>
                  <Txt variant="caption" color={tokens.muted}>
                    선정 취소 불가
                  </Txt>
                  <Txt variant="caption" color={tokens.muted}>
                    회사명·연락처 이 기관에 공개
                  </Txt>
                  <Txt variant="caption" color={tokens.muted}>
                    다른 기관 미선정 처리
                  </Txt>
                </View>
                <Button title="선정하기" tall loading={sending} icon={<CheckCircle size={u(18)} weight="bold" color={tokens.onInk} />} onPress={() => void select(step.col)} />
                <Button title="다른 기관 보기" kind="text" disabled={sending} onPress={toPick} />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Fact({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <View style={styles.fact}>
      <Txt variant="small" color={tokens.muted} style={{ width: u(72) }}>
        {k}
      </Txt>
      <Txt variant={strong ? 'heading' : 'small'} tabular style={{ flex: 1, fontFamily: strong ? fonts.bold : fonts.semibold }}>
        {v}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(30, 31, 34, 0.32)' },
  sheet: {
    backgroundColor: tokens.surface,
    borderTopLeftRadius: radius.approval,
    borderTopRightRadius: radius.approval,
    paddingTop: space.xxl,
    paddingHorizontal: space.xl,
    paddingBottom: u(34),
  },
  q: { fontSize: u(22), lineHeight: u(30), marginBottom: space.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: u(64),
    paddingVertical: u(10),
    borderTopWidth: 1,
    borderTopColor: tokens.border,
    gap: space.md,
  },
  facts: { borderTopWidth: 1, borderTopColor: tokens.border },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: u(48),
    borderBottomWidth: 1,
    borderBottomColor: tokens.border,
    gap: space.md,
  },
  why: { marginTop: space.lg, gap: space.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pill: {
    height: u(36),
    paddingHorizontal: u(14),
    borderRadius: radius.pill,
    backgroundColor: tokens.sunken,
    justifyContent: 'center',
  },
  pillOn: { backgroundColor: tokens.ink },
  notes: { gap: u(2), marginBottom: space.xs },
  err: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: u(8),
    marginTop: space.md,
  },
  actions: {
    paddingTop: space.md,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: tokens.border,
    marginTop: space.md,
  },
});
