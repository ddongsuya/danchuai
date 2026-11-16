// 의뢰자: 단추 비교표에서 기관 선정(연동 5단계). 토스 송금처럼 "고르기 → 확인 → 버튼 하나".
// 목록은 회신 도착 순 그대로(추천·순위 없음). 금액은 단추가 저장한 값 그대로.
// 선정은 되돌릴 수 없어서 고른 뒤 한 번 더 확인한다. 승인 기록과 한 번만 실행은 서버가 맡는다.
import { CaretRight, CheckCircle, WarningCircle } from 'phosphor-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { approveDanchuAction, draftDanchuAction } from '@/lib/agentClient';
import type { DanchuCompareColumn } from '@/lib/marketClient';

const won = (n: number | null) => (n == null ? '금액 미기재' : `${n.toLocaleString('ko-KR')}원`);
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
  const close = () => {
    if (step.kind === 'sending') return;
    setStep({ kind: 'pick' });
    onClose();
  };

  const select = async (col: DanchuCompareColumn) => {
    if (!col.quoteId || !col.revision) return;
    setStep({ kind: 'sending', col });
    try {
      const d = await draftDanchuAction('requester', 'select', { quoteId: col.quoteId, revision: col.revision }, no);
      const r = await approveDanchuAction('requester', d);
      if (r.status === 'sent') {
        setStep({ kind: 'pick' });
        onDone();
        return;
      }
      const reason = typeof r.result?.error === 'string' ? r.result.error : null;
      setStep({ kind: 'error', col, message: r.status === 'failed' ? (reason ?? '단추가 받지 않았어요') : '결과 확인 필요' });
    } catch {
      setStep({ kind: 'error', col, message: '연결이 끊겼어요' });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel="닫기" />
      <View style={styles.sheet} accessibilityViewIsModal>
        {step.kind === 'pick' ? (
          <>
            <Txt variant="title" style={styles.q} accessibilityRole="header">
              어느 기관을 선정할까요?
            </Txt>
            <ScrollView style={{ maxHeight: 420 }}>
              {columns.map((c, i) => {
                const ok = !!c.selectable && !!c.quoteId && !!c.revision;
                return (
                  <Press key={c.quoteId ?? i} label={`${c.lab} ${won(c.total)}`} disabled={!ok} onPress={() => setStep({ kind: 'confirm', col: c })} style={styles.option}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt variant="body" style={{ fontFamily: fonts.semibold }}>
                        {c.lab}
                      </Txt>
                      <Txt variant="small" color={tokens.muted} tabular>
                        {ok ? `${won(c.total)}, ${weeks(c.weeks)}` : '정식 견적서 전'}
                      </Txt>
                    </View>
                    {ok && <CaretRight size={16} color={tokens.faint} />}
                  </Press>
                );
              })}
            </ScrollView>
          </>
        ) : (
          <>
            <Txt variant="title" style={styles.q} accessibilityRole="header">
              {`${step.col.lab}\n선정할까요?`}
            </Txt>
            <View style={styles.facts}>
              <Fact k="견적 총액" v={won(step.col.total)} strong />
              <Fact k="소요 기간" v={weeks(step.col.weeks)} />
              <Fact k="견적 판" v={step.col.revision ? `${step.col.revision}판` : '-'} />
            </View>
            <View style={styles.notes}>
              <Txt variant="small" color={tokens.muted}>
                선정 취소 불가
              </Txt>
              <Txt variant="small" color={tokens.muted}>
                회사명·연락처 이 기관에 공개
              </Txt>
              <Txt variant="small" color={tokens.muted}>
                다른 기관 미선정 처리
              </Txt>
            </View>
            {step.kind === 'error' && (
              <View style={styles.err} accessibilityRole="alert">
                <WarningCircle size={16} weight="fill" color={tokens.danger} />
                <Txt variant="caption" color={tokens.danger} style={{ fontFamily: fonts.semibold, flex: 1 }}>
                  {step.message}
                </Txt>
              </View>
            )}
            <View style={{ marginTop: space.lg, gap: space.sm }}>
              <Button
                title="선정하기"
                tall
                loading={step.kind === 'sending'}
                icon={<CheckCircle size={18} weight="bold" color={tokens.onInk} />}
                onPress={() => void select(step.col)}
              />
              <Button title="다른 기관 보기" kind="ghost" disabled={step.kind === 'sending'} onPress={() => setStep({ kind: 'pick' })} />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

function Fact({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <View style={styles.fact}>
      <Txt variant="small" color={tokens.muted} style={{ width: 72 }}>
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
  sheet: { backgroundColor: tokens.surface, borderTopLeftRadius: radius.approval, borderTopRightRadius: radius.approval, paddingTop: space.xxl, paddingHorizontal: space.xl, paddingBottom: 34 },
  q: { fontSize: 22, lineHeight: 30, marginBottom: space.md },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: 10, borderTopWidth: 1, borderTopColor: tokens.border, gap: space.md },
  facts: { borderTopWidth: 1, borderTopColor: tokens.border },
  fact: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderBottomWidth: 1, borderBottomColor: tokens.border, gap: space.md },
  notes: { marginTop: space.md, gap: 4 },
  err: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.md },
});
