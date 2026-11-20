// 기관: 견적 확인(말로 맡기는 견적 2단계). 에이전트가 대화로 다듬은 단추 견적 초안을 사람이 보고 제출한다.
// 2026-11-20(단추 #141·#142): 제출 금액은 단추 견적서 툴 계산값만이다. 이 카드는 단추 제출 미리보기(quote_submit_preview)가 준
// 줄 금액(할인 반영)·기간·설계 설명을 그대로 보이고, 제출 때 그 견적서 판(docUpdatedAt)을 함께 보낸다. 그사이 견적서가 바뀌면
// 단추가 막고(changed) 카드가 새로 불러온다. 사람이 본 금액만 나간다(규칙 1). 합계는 코드가 낸다(부가세 별도).
// 견적서가 없으면 먼저 만든다(의뢰자에게 안 보임). 시험 목록·단가표에 금액이 없는 줄은 여기서 넣고(quote_doc_set_amount, 누른 것이 승인),
// 설계를 고치거나 견적서에 없는 시험을 넣는 것은 견적서 툴에서 한다.
// 버튼을 누른 것이 승인이다. 실행은 서버 보내기 장부가 한 번만 한다(draft → approve → dispatch).
// 레퍼런스: Mobbin Snapchat 홍보 검토(구역별 확인 + 아래 합계·주 버튼), Instacart 항목 목록(줄마다 금액 강조).
import { CheckCircle, WarningCircle } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ErrorLine } from '@/components/agent/LiveChat';
import { ChatShell } from '@/components/chat/ChatShell';
import { StepLog } from '@/components/chat/Messages';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { AgentHttpError, approveDanchuAction, draftDanchuAction, readDanchu, runDanchu } from '@/lib/agentClient';
import { DANCHU_URL, openWeb } from '@/lib/danchuLinks';
import { docBlockedLabel, docLines, docQuoteBody, formatWonInput, parseWonInput, quoteSubmittedNow, sameAsSubmitted, type DanchuQuoteDraft, type DocLine, type QuoteSubmitPreview } from '@/lib/danchuQuote';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

/** 단추가 제출·금액 넣기를 막은 까닭(단추 quote_submit·quote_doc_set_amount 오류) */
const REFUSED: Record<string, string> = {
  changed: '견적서가 바뀌어 새로 불러왔어요',
  amount_missing: '금액 없는 줄이 있어요',
  mismatched: '요청서와 시험 이름이 다른 줄이 있어요',
  doc_missing: '견적서가 없어요',
};
/** 단추 웹 처리의 한국어 오류 문장은 그대로, 영문 코드는 보이지 않는다 */
const refusedText = (code: string | null, fallback: string) => (code && REFUSED[code]) ?? (code && /[가-힣]/.test(code) ? code : fallback);

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
  /** 미리보기 화면에서만: 단추 제출 미리보기 값 */
  initialPreview?: QuoteSubmitPreview;
}

type Doc = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; p: QuoteSubmitPreview };
type Run = { kind: 'idle' } | { kind: 'sending'; what: 'submit' | 'save' } | { kind: 'done'; what: 'submit' | 'save' } | { kind: 'error'; message: string };
type Put = { uid: string; busy: boolean; error: string | null };

/** 제출 미리보기를 읽는다. 견적서가 아직 없으면(404) 만든 뒤 다시 읽는다 */
async function loadPreview(no: string): Promise<QuoteSubmitPreview> {
  try {
    return await readDanchu<QuoteSubmitPreview>('quote_submit_preview', {}, no);
  } catch (e) {
    if (!(e instanceof AgentHttpError) || e.status !== 404) throw e;
    await runDanchu('quote_doc', {}, no);
    return readDanchu<QuoteSubmitPreview>('quote_submit_preview', {}, no);
  }
}

export function DanchuQuoteReview({ no, line, quote, conversationId, onBack, onSubmitted, initialPreview }: QuoteReviewProps) {
  const [doc, setDoc] = useState<Doc>(initialPreview ? { kind: 'ready', p: initialPreview } : { kind: 'loading' });
  const [tick, setTick] = useState(0);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [put, setPut] = useState<Put | null>(null);
  const [run, setRun] = useState<Run>({ kind: 'idle' });
  const [toolError, setToolError] = useState(false);

  useEffect(() => {
    if (initialPreview && tick === 0) return;
    let live = true;
    loadPreview(no)
      .then((p) => live && setDoc({ kind: 'ready', p }))
      .catch(() => live && setDoc({ kind: 'error' }));
    return () => {
      live = false;
    };
  }, [no, tick, initialPreview]);

  const reload = () => {
    setDoc({ kind: 'loading' });
    setTick((t) => t + 1);
  };

  const p = doc.kind === 'ready' ? doc.p : null;
  const lines = p ? docLines(quote, p) : [];
  const built = p ? docQuoteBody(quote, p, true) : null;
  const blocked = built ? docBlockedLabel(built) : '견적서 불러오는 중';
  const sending = run.kind === 'sending' || !!put?.busy;
  const submittedNow = !!p && quoteSubmittedNow(quote) && sameAsSubmitted(quote, p);

  const openTool = async () => {
    if (!p) return;
    setToolError(false);
    try {
      await openWeb(`${DANCHU_URL}${p.path}`);
    } catch {
      setToolError(true);
    }
  };

  // 시험 목록·단가표에 금액이 없는 견적서 시험에 금액을 넣는다. 누른 것이 승인이다
  const setAmount = async (uid: string) => {
    const n = parseWonInput(typed[uid]);
    if (!p || !n || n <= 0) return;
    setPut({ uid, busy: true, error: null });
    try {
      const d = await draftDanchuAction('cro', 'quote_doc_set_amount', { updatedAt: p.updatedAt, uid, amount: n }, no);
      const r = await approveDanchuAction('cro', d);
      if (r.status === 'sent') {
        setPut(null);
        setTyped(({ [uid]: _done, ...rest }) => rest);
        reload();
        return;
      }
      const code = typeof r.result?.error === 'string' ? r.result.error : null;
      if (code === 'changed') {
        setPut(null);
        setRun({ kind: 'error', message: REFUSED.changed });
        reload();
        return;
      }
      setPut({ uid, busy: false, error: r.status === 'failed' ? refusedText(code, '견적서에 넣지 못했어요') : '결과 확인 필요' });
    } catch {
      setPut({ uid, busy: false, error: '연결이 끊겼어요' });
    }
  };

  const go = async (what: 'submit' | 'save') => {
    if (!p) return;
    const b = docQuoteBody(quote, p, what === 'submit');
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
      const code = typeof r.result?.error === 'string' ? r.result.error : null;
      setRun({ kind: 'error', message: r.status === 'failed' ? refusedText(code, '단추가 받지 않았어요') : '결과 확인 필요' });
      // 견적서와 어긋나서 막혔으면 지금 견적서를 다시 읽는다
      if (code && code in REFUSED) reload();
    } catch {
      setRun({ kind: 'error', message: '연결이 끊겼어요' });
    }
  };

  const title = quote.submittedVersion == null ? '견적 제출' : '수정 내용 제출';
  const submitted = run.kind === 'done' && run.what === 'submit';
  return (
    <ChatShell
      title={no}
      bottom={
        <View style={styles.bar}>
          <View style={styles.totalRow} accessible accessibilityLabel={built?.ok ? `합계 ${won(built.total)}, 부가세 별도` : `합계, ${blocked}`}>
            <Txt variant="label" color={tokens.muted}>
              합계(부가세 별도)
            </Txt>
            <Txt variant="heading" tabular color={built?.ok ? tokens.text : tokens.faint}>
              {built?.ok ? won(built.total) : '-'}
            </Txt>
          </View>
          <Button
            title={submitted ? '제출했어요' : (blocked ?? title)}
            tall
            disabled={!built?.ok || sending || submittedNow || submitted}
            loading={run.kind === 'sending' && run.what === 'submit'}
            onPress={() => void go('submit')}
          />
          <View style={styles.subRow}>
            {onBack && <Button title="대화로 돌아가기" kind="text" disabled={sending} onPress={onBack} />}
            <Button title="단추에 임시 저장" kind="text" disabled={sending || !p} loading={run.kind === 'sending' && run.what === 'save'} onPress={() => void go('save')} />
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

      {doc.kind === 'loading' && <StepLog steps={[{ label: '단추 견적서 불러오는 중', state: 'now' }]} />}
      {doc.kind === 'error' && <ErrorLine label="견적서를 불러오지 못했어요" onRetry={reload} />}

      {p && (
        <View style={styles.card}>
          {lines.map((l, i) => (
            <Line
              key={l.seq}
              l={l}
              first={i === 0}
              typed={typed}
              put={put}
              disabled={sending}
              onType={(uid, t) => setTyped((m) => ({ ...m, [uid]: t }))}
              onPut={(uid) => void setAmount(uid)}
            />
          ))}
        </View>
      )}

      {p && (
        <View style={styles.toolRow}>
          {toolError && (
            <Txt variant="caption" color={tokens.danger} style={{ flex: 1 }}>
              견적서를 열지 못했어요
            </Txt>
          )}
          <Button title="다시 불러오기" kind="text" disabled={sending} onPress={reload} />
          <Button title="견적서 툴에서 열기" kind="text" disabled={sending} onPress={() => void openTool()} />
        </View>
      )}

      <View style={[styles.card, styles.facts]}>
        {p ? <Fact k="견적서" v={p.docNo} /> : null}
        <Fact k="착수 가능일" v={quote.common.startDate || '미정'} line={!!p} />
        <Fact k="견적 유효기간" v={quote.common.validUntil || '-'} line />
        <Fact k="결제 조건" v={quote.common.payTerms || '-'} line />
        {p && p.discount > 0 ? <Fact k="할인" v={`${won(p.discount)}, 줄마다 나눠 반영`} line /> : null}
        {p && p.unlinked.length ? <Fact k="제출 제외" v={p.unlinked.join(', ')} line /> : null}
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
        {submittedNow ? '제출한 견적, 비교표 열리기 전까지 수정 가능' : '견적서 금액 기준, 비교표 열리기 전까지 수정 가능'}
      </Txt>
    </ChatShell>
  );
}

/** 카드 한 줄. 금액은 단추 견적서 계산값만 보인다. 금액이 없는 견적서 시험은 여기서 넣는다 */
function Line({ l, first, typed, put, disabled, onType, onPut }: { l: DocLine; first: boolean; typed: Record<string, string>; put: Put | null; disabled: boolean; onType: (uid: string, t: string) => void; onPut: (uid: string) => void }) {
  const live = l.state !== 'off' && l.state !== 'undecided';
  return (
    <View style={[styles.item, !first && styles.line]}>
      <View style={styles.top}>
        <Txt variant="label" style={{ flex: 1, fontFamily: fonts.bold }} color={l.state === 'off' ? tokens.muted : tokens.text} numberOfLines={2}>
          {l.name}
        </Txt>
        {l.state === 'off' ? (
          <Txt variant="label" color={tokens.muted}>
            불가
          </Txt>
        ) : l.state === 'undecided' ? (
          <Chip label="가능 여부 미정" kind="wait" />
        ) : l.state === 'priced' && l.amount != null ? (
          <Txt variant="label" tabular style={{ fontFamily: fonts.bold }}>
            {won(l.amount)}
          </Txt>
        ) : null}
      </View>
      <View style={styles.top}>
        <Txt variant="caption" color={tokens.muted} tabular style={{ flex: 1 }}>
          {[live ? l.avail : null, l.weeks ? `${l.weeks}주` : null, l.reason || null].filter(Boolean).join(', ') || ' '}
        </Txt>
        {l.state === 'priced' && <Chip label="견적서 금액" />}
        {l.state === 'manual' && <Chip label="금액 넣기 필요" kind="wait" />}
        {l.state === 'no_test' && <Chip label="견적서에 없음" kind="wait" />}
        {l.state === 'mismatched' && <Chip label="시험 이름 다름" kind="wait" />}
      </View>
      {l.extra.length > 0 && (
        <View style={styles.extra}>
          {l.extra.map(([k, v]) => (
            <Txt key={k} variant="caption" color={tokens.muted} numberOfLines={2}>
              {`${k}: ${v}`}
            </Txt>
          ))}
        </View>
      )}
      {/* 금액 넣을 견적서 시험마다 한 줄 전체로(이름·금액이 좁아지지 않게) */}
      {l.manual.map((t) => {
        const v = typed[t.uid] ?? '';
        const mine = put?.uid === t.uid;
        return (
          <View key={t.uid} style={{ gap: u(4) }}>
            {l.manual.length > 1 && (
              <Txt variant="caption" color={tokens.muted} numberOfLines={1}>
                {t.title}
              </Txt>
            )}
            <View style={styles.putRow}>
              <View style={[styles.input, !v && styles.inputEmpty]}>
                <TextInput
                  value={formatWonInput(v)}
                  onChangeText={(x) => onType(t.uid, x)}
                  keyboardType="number-pad"
                  placeholder="금액"
                  placeholderTextColor={tokens.faint}
                  accessibilityLabel={`${t.title} 금액`}
                  editable={!disabled}
                  style={styles.inputText}
                  selectionColor={tokens.accent}
                />
                <Txt variant="label">원</Txt>
              </View>
              <Button title="넣기" kind="soft" disabled={disabled || !(parseWonInput(v) ?? 0)} loading={mine && put.busy} onPress={() => onPut(t.uid)} />
            </View>
            {mine && put.error && (
              <Txt variant="caption" color={tokens.danger} accessibilityRole="alert">
                {put.error}
              </Txt>
            )}
          </View>
        );
      })}
    </View>
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
  extra: { gap: u(2) },
  putRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: u(4) },
  input: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: u(6), height: u(44), paddingHorizontal: u(14), borderRadius: radius.inner, borderWidth: 1, borderColor: tokens.borderInput },
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
