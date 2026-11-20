// 기관: 견적 확인(말로 맡기는 견적 2단계). 에이전트가 대화로 다듬은 단추 견적 초안을 사람이 보고 제출한다.
// 금액은 단추가 시험 목록 단가로 계산한 줄(단추 계산), 단추에 저장된 줄, 담당자가 여기서 넣는 줄(직접 입력)뿐이다. 합계는 코드가 낸다(부가세 별도).
// 직접 입력 줄은 단추 견적서 툴 계산(quote_price: 요청 조건 차이, 약동학 검체 수, 효력 단가표 사용량)으로 먼저 채운다(2026-11-20 B안).
// 담당자가 고치면 직접 입력이 된다. 견적서 툴에서 열면 단추 견적서(의뢰자에게 안 보임)를 만들어 연다.
// 버튼을 누른 것이 승인이다. 실행은 서버 보내기 장부가 한 번만 한다(draft → approve → dispatch).
// 레퍼런스: Mobbin Snapchat 홍보 검토(구역별 확인 + 아래 합계·주 버튼), Instacart 항목 목록(줄마다 금액 강조).
import { CheckCircle, WarningCircle } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ChatShell } from '@/components/chat/ChatShell';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { approveDanchuAction, draftDanchuAction, readDanchu, runDanchu, type QuotePriceView } from '@/lib/agentClient';
import { DANCHU_URL, openWeb } from '@/lib/danchuLinks';
import { blockedLabel, buildQuoteBody, formatWonInput, parseWonInput, quoteSubmittedNow, reviewLines, type DanchuQuoteDraft } from '@/lib/danchuQuote';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const SOURCE_LABEL = { danchu: '단추 계산', saved: '저장된 금액', manual: '직접 입력' } as const;

export interface QuoteReviewProps {
  no: string;
  /** 제목 위 한 줄(시험, 동물) */
  line: string;
  quote: DanchuQuoteDraft;
  /** 이 견적을 다듬은 대화. 제출되면 서버가 제출한 판을 이 대화에 남긴다 */
  conversationId?: string;
  onBack?: () => void;
  /** 단추가 제출을 받았다(화면이 대화 상태를 다시 읽는다) */
  onSubmitted?: () => void;
  /** 미리보기에서 직접 입력 칸을 채운 채로 보여 줄 때만 */
  initialManual?: Record<number, string>;
  /** 미리보기에서 단추 견적서 툴 계산을 채워 보여 줄 때만(seq → 금액) */
  initialCalc?: Record<number, number>;
}

type Run = { kind: 'idle' } | { kind: 'sending'; what: 'submit' | 'save' } | { kind: 'done'; what: 'submit' | 'save' } | { kind: 'error'; message: string };

export function DanchuQuoteReview({ no, line, quote, conversationId, onBack, onSubmitted, initialManual = {}, initialCalc }: QuoteReviewProps) {
  const [calc, setCalc] = useState<Record<number, number>>(initialCalc ?? {});
  const [manual, setManual] = useState<Record<number, string>>(() => ({ ...Object.fromEntries(Object.entries(initialCalc ?? {}).map(([k, v]) => [k, String(v)])), ...initialManual }));
  const [run, setRun] = useState<Run>({ kind: 'idle' });
  const [tool, setTool] = useState<'idle' | 'opening' | 'error' | 'off'>(initialCalc ? 'idle' : 'off');
  const lines = reviewLines(quote);

  // 직접 입력 줄을 단추 견적서 툴 계산으로 채운다. 이미 넣은 칸은 두고, 금액이 없는 줄(표준가 없음 등)은 비운다
  useEffect(() => {
    if (initialCalc) return;
    let live = true;
    readDanchu<{ price: QuotePriceView }>('quote_price', {}, no)
      .then((r) => {
        if (!live || !r?.price) return;
        // 직접 입력할 줄(가능·조건부 가능인데 단추 금액이 없는 줄)만. 단추 계산·저장된 줄은 그대로 둔다
        const open = new Set(reviewLines(quote).filter((l) => l.source === 'manual' && (l.avail === '가능' || l.avail === '조건부 가능')).map((l) => l.seq));
        const got = Object.fromEntries(r.price.rows.filter((x) => x.priced && x.amount != null && open.has(x.seq)).map((x) => [x.seq, x.amount as number]));
        setCalc(got);
        setTool('idle');
        setManual((m) => ({ ...Object.fromEntries(Object.entries(got).map(([k, v]) => [k, String(v)])), ...m }));
      })
      // 요금제·연결 문제로 못 읽으면 지금처럼 직접 입력
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [no, initialCalc, quote]);

  const openTool = async () => {
    setTool('opening');
    try {
      const r = await runDanchu<{ path?: string }>('quote_doc', {}, no);
      const path = typeof r.result?.path === 'string' && r.result.path.startsWith('/cro/docs/') ? r.result.path : null;
      if (!path) throw new Error('no_path');
      setTool('idle');
      await openWeb(`${DANCHU_URL}${path}`);
    } catch {
      setTool('error');
    }
  };
  const built = buildQuoteBody(quote, manual, true);
  const blocked = blockedLabel(quote, manual);
  const sending = run.kind === 'sending';
  // 단추 계산으로 채운 값을 그대로 둔 줄은 고친 것으로 보지 않는다
  const edited = Object.entries(manual).some(([k, v]) => calc[Number(k)] == null || parseWonInput(v) !== calc[Number(k)]);
  const submittedNow = quoteSubmittedNow(quote) && !edited;

  const go = async (what: 'submit' | 'save') => {
    const b = buildQuoteBody(quote, manual, what === 'submit');
    if (!b.ok) return;
    setRun({ kind: 'sending', what });
    try {
      const d = await draftDanchuAction('cro', what === 'submit' ? 'quote_submit' : 'quote_draft', b.body, no, conversationId);
      const r = await approveDanchuAction('cro', d);
      if (r.status === 'sent') {
        setRun({ kind: 'done', what });
        if (what === 'submit') onSubmitted?.();
        return;
      }
      const reason = typeof r.result?.error === 'string' ? r.result.error : null;
      setRun({ kind: 'error', message: r.status === 'failed' ? (reason ?? '단추가 받지 않았어요') : '결과 확인 필요' });
    } catch {
      setRun({ kind: 'error', message: '연결이 끊겼어요' });
    }
  };

  const title = quote.submittedVersion == null ? '견적 제출' : '수정 내용 제출';
  return (
    <ChatShell
      title={no}
      bottom={
        <View style={styles.bar}>
          <View style={styles.totalRow} accessible accessibilityLabel={built.ok ? `합계 ${won(built.total)}, 부가세 별도` : `합계, ${blocked}`}>
            <Txt variant="label" color={tokens.muted}>
              합계(부가세 별도)
            </Txt>
            <Txt variant="heading" tabular color={built.ok ? tokens.text : tokens.faint}>
              {built.ok ? won(built.total) : '-'}
            </Txt>
          </View>
          <Button
            title={run.kind === 'done' && run.what === 'submit' ? '제출했어요' : (blocked ?? title)}
            tall
            disabled={!built.ok || sending || submittedNow || (run.kind === 'done' && run.what === 'submit')}
            loading={sending && run.what === 'submit'}
            onPress={() => void go('submit')}
          />
          <View style={styles.subRow}>
            {onBack && <Button title="대화로 돌아가기" kind="text" disabled={sending} onPress={onBack} />}
            <Button title="단추에 임시 저장" kind="text" disabled={sending} loading={sending && run.what === 'save'} onPress={() => void go('save')} />
          </View>
        </View>
      }
    >
      <View style={{ gap: space.xs }}>
        <Txt variant="small" color={tokens.muted} numberOfLines={2}>
          {line}
        </Txt>
        <Txt variant="title" accessibilityRole="header">
          {'견적을\n확인해 주세요'}
        </Txt>
      </View>

      <View style={styles.card}>
        {lines.map((l, i) => {
          const off = l.avail === '불가';
          const undecided = !l.avail;
          const typed = manual[l.seq] ?? '';
          const needs = l.source === 'manual' && !off && !undecided;
          const empty = needs && !typed;
          return (
            <View key={l.seq} style={[styles.item, i > 0 && styles.line]}>
              <View style={styles.top}>
                <Txt variant="label" style={{ flex: 1, fontFamily: fonts.bold }} color={off ? tokens.muted : tokens.text} numberOfLines={2}>
                  {l.name}
                </Txt>
                {off ? (
                  <Txt variant="label" color={tokens.muted}>
                    불가
                  </Txt>
                ) : undecided ? (
                  <Chip label="가능 여부 미정" kind="wait" />
                ) : l.source === 'manual' ? null : (
                  <Txt variant="label" tabular style={{ fontFamily: fonts.bold }}>
                    {l.amount == null ? '-' : won(l.amount)}
                  </Txt>
                )}
              </View>
              <View style={styles.top}>
                <Txt variant="caption" color={tokens.muted} tabular style={{ flex: 1 }}>
                  {[off || undecided ? null : l.avail, l.weeks ? `${l.weeks}주` : null, l.reason || null].filter(Boolean).join(', ') || ' '}
                </Txt>
                {!off && !undecided && <Chip label={needs && calc[l.seq] != null && parseWonInput(typed) === calc[l.seq] ? '단추 계산' : SOURCE_LABEL[l.source]} kind={empty ? 'wait' : 'mute'} />}
              </View>
              {/* 직접 입력 줄은 금액 칸을 한 줄 전체로(이름·금액이 좁아지지 않게) */}
              {needs && (
                <View style={[styles.input, empty && styles.inputEmpty]}>
                  <TextInput
                    value={formatWonInput(typed)}
                    onChangeText={(t) => setManual((m) => ({ ...m, [l.seq]: t }))}
                    keyboardType="number-pad"
                    placeholder="금액"
                    placeholderTextColor={tokens.faint}
                    accessibilityLabel={`${l.name} 금액`}
                    editable={!sending}
                    style={styles.inputText}
                    selectionColor={tokens.accent}
                  />
                  <Txt variant="label">원</Txt>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {tool !== 'off' && (
        <View style={styles.toolRow}>
          {tool === 'error' && (
            <Txt variant="caption" color={tokens.danger} style={{ flex: 1 }}>
              견적서를 열지 못했어요
            </Txt>
          )}
          <Button title="견적서 툴에서 열기" kind="text" disabled={sending || tool === 'opening'} loading={tool === 'opening'} onPress={() => void openTool()} />
        </View>
      )}

      <View style={[styles.card, styles.facts]}>
        <Fact k="착수 가능일" v={quote.common.startDate || '미정'} />
        <Fact k="견적 유효기간" v={quote.common.validUntil || '-'} line />
        <Fact k="결제 조건" v={quote.common.payTerms || '-'} line />
        {quote.note ? <Fact k="전달 사항" v={quote.note} line /> : null}
      </View>

      {run.kind === 'done' && (
        <View style={styles.row} accessibilityLiveRegion="polite">
          <CheckCircle size={u(16)} weight="fill" color={tokens.accent} />
          <Txt variant="caption" color={tokens.accent} style={{ fontFamily: fonts.semibold, flex: 1 }}>
            {run.what === 'submit' ? '단추에 제출했어요' : '단추에 임시 저장했어요'}
          </Txt>
        </View>
      )}
      {run.kind === 'error' && (
        <View style={styles.row} accessibilityRole="alert">
          <WarningCircle size={u(16)} weight="fill" color={tokens.danger} />
          <Txt variant="caption" color={tokens.danger} style={{ fontFamily: fonts.semibold, flex: 1 }}>
            {run.message}
          </Txt>
        </View>
      )}

      <Txt variant="caption" color={tokens.muted}>
        {submittedNow ? '제출한 견적, 비교표 열리기 전까지 수정 가능' : '비교표 열리기 전까지 수정 가능'}
      </Txt>
    </ChatShell>
  );
}

function Fact({ k, v, line }: { k: string; v: string; line?: boolean }) {
  return (
    <View style={[styles.tr, line && styles.line]}>
      <Txt variant="small" color={tokens.muted} style={{ width: u(96) }}>
        {k}
      </Txt>
      <Txt variant="small" tabular style={{ flex: 1 }}>
        {v}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' },
  item: { paddingVertical: u(14), paddingHorizontal: space.lg, gap: u(6) },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  input: { flexDirection: 'row', alignItems: 'center', gap: u(6), height: u(44), marginTop: u(4), paddingHorizontal: u(14), borderRadius: radius.inner, borderWidth: 1, borderColor: tokens.borderInput },
  inputEmpty: { borderColor: tokens.wait, backgroundColor: tokens.waitSoft },
  inputText: { flex: 1, minWidth: 0, textAlign: 'right', fontFamily: fonts.bold, fontSize: u(15), color: tokens.text, paddingVertical: 0 },
  facts: { paddingHorizontal: space.lg },
  tr: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: u(12), gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: u(8) },
  bar: { paddingHorizontal: space.md, paddingTop: space.sm, gap: space.xs },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.sm, marginBottom: space.xs },
  subRow: { flexDirection: 'row', justifyContent: 'center', gap: space.sm },
  toolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space.sm, marginTop: -space.sm },
});
