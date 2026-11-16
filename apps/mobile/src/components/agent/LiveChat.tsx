// 서버와 연결된 대화 화면. 답은 흐르는 대로 보이고, 질문 카드·요약·보내기 전 승인 카드가 이어진다.
// 보내기는 사람이 승인 카드에서 누를 때만 일어난다. 에이전트는 보내지 못한다.
import { amountBlock, computeTotals, formatWonShort, SHEET_LABELS, type QuoteLine, type SheetField } from '@danchuai/core';
import { ArrowClockwise, CheckCircle, WarningCircle } from 'phosphor-react-native';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApprovalCard, type Recipient } from '@/components/chat/ApprovalCard';
import { ChatShell } from '@/components/chat/ChatShell';
import { Composer } from '@/components/chat/Composer';
import { AgentText, StepLog, UserMessage } from '@/components/chat/Messages';
import { QuestionCard } from '@/components/chat/QuestionCard';
import { LabPicker } from '@/components/request/LabPicker';
import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { useAgentChat } from '@/hooks/useAgentChat';
import { approveAndSend, createOutbound, type AgentRole, type OutboundDraftView } from '@/lib/agentClient';
import type { ChatErrorCode } from '@/lib/chat';

const ERROR_LABEL: Record<ChatErrorCode, string> = {
  agent_unavailable: '에이전트 연결 전이에요',
  turn_limit: '이 대화는 한도에 닿았어요',
  turn_in_progress: '앞 답을 기다리는 중이에요',
  refused: '이 요청에는 답할 수 없어요',
  truncated: '답이 길어 중간에 끊겼어요',
  provider_error: '답을 받지 못했어요',
  network: '연결이 끊겼어요',
  unauthorized: '로그인이 필요해요',
};
const RETRYABLE: readonly ChatErrorCode[] = ['provider_error', 'network', 'truncated', 'turn_in_progress', 'agent_unavailable'];

interface Props {
  role: AgentRole;
  title: string;
  /** 기관: 받은 요청 */
  requestId?: string;
  /** 이어서 열 대화 */
  conversationId?: string;
  /** 의뢰자: 사람이 고른 받는 곳(없으면 보내기 전에 받는 기관 고르기를 연다) */
  recipients?: Recipient[];
  /** 기관: 담당자가 넣은 견적 항목(원 단위). 합계는 코드가 계산한다. */
  quoteLines?: QuoteLine[];
  /** 기관: 담당자가 넣은 소요 기간(주) */
  durationWeeks?: number;
  /** 기관: 의뢰자가 승인해 보낸 요청 본문 */
  requestMessage?: string | null;
  /** 기관: 견적 금액 입력 화면 열기 */
  onEditQuote?: () => void;
  /** 보내기가 끝났을 때(화면이 결과를 다시 읽는다) */
  onSent?: () => void;
}

type SendState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done'; sent: number; unknown: number } | { kind: 'error' };

export function LiveChat({ role, title, requestId, conversationId, recipients: given = [], quoteLines = [], durationWeeks, requestMessage, onEditQuote, onSent }: Props) {
  const { state, send, retry } = useAgentChat(role, requestId, conversationId);
  // 이어 쓰는 대화는 요청서에서 제목을 만든다(서버 목록과 같은 규칙).
  const heading = conversationId && state.sheet ? sheetTitle(state.sheet) ?? title : title;
  const [reviewing, setReviewing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>(given);
  const [out, setOut] = useState<SendState>({ kind: 'idle' });
  // 만든 보내기 초안. 보내기가 중간에 실패하면 같은 초안으로 다시 보낸다(새로 만들지 않는다).
  const made = useRef<{ version: number; requestId: string | null; drafts: OutboundDraftView[]; sent: Set<string> } | null>(null);
  const [sentRequestId, setSentRequestId] = useState<string | null>(null);
  const busy = state.status !== 'idle';
  const draft = state.draft;
  const outBody = draft && role === 'cro' && quoteLines.length ? `${draft.body}\n\n${amountBlock(quoteLines)}` : draft?.body ?? '';

  const approve = async () => {
    if (!state.conversationId || !draft) return;
    setOut({ kind: 'sending' });
    try {
      if (!made.current || made.current.version !== draft.version) {
        const r = await createOutbound(role, state.conversationId, {
          version: draft.version,
          ...(role === 'requester' ? { recipientOrgIds: recipients.map((x) => x.id) } : { quoteLines, ...(durationWeeks ? { durationWeeks } : {}) }),
        });
        made.current = { version: draft.version, requestId: r.requestId, drafts: r.outbound, sent: new Set() };
      }
      const m = made.current;
      let unknown = 0;
      for (const d of m.drafts) {
        if (m.sent.has(d.id)) continue;
        if ((await approveAndSend(role, d)) === 'sent') m.sent.add(d.id);
        else unknown++;
      }
      setOut({ kind: 'done', sent: m.sent.size, unknown });
      setSentRequestId(m.requestId);
      setReviewing(false);
      if (!unknown) onSent?.();
    } catch {
      setOut({ kind: 'error' });
    }
  };

  const canReview = Boolean(draft) && !state.draftSent && out.kind !== 'done' && !busy;
  const needsQuote = role === 'cro' && !quoteLines.length;
  const openReview = () => {
    if (role === 'requester' && !recipients.length) return setPicking(true);
    if (needsQuote) return onEditQuote?.();
    setReviewing(true);
  };

  if (picking) {
    return (
      <LabPicker
        initial={recipients}
        onClose={() => setPicking(false)}
        onDone={(p) => {
          setRecipients(p);
          setPicking(false);
          if (draft) setReviewing(true);
        }}
      />
    );
  }

  const bottom =
    reviewing && draft ? (
      <ApprovalCard
        title={role === 'cro' ? '견적 회신 보내기' : '견적 요청 보내기'}
        recipients={role === 'cro' ? [{ id: 'requester', name: '의뢰자' }] : recipients}
        body={outBody}
        attachment={role === 'cro' ? '견적서 1건' : '요청서 1건'}
        hideRequester={role === 'requester'}
        guardPassed={out.kind !== 'sending'}
        onEdit={() => setReviewing(false)}
        onApprove={approve}
      />
    ) : (
      <Composer disabled={busy || !state.conversationId} onSend={(t) => void send(t)} />
    );

  return (
    <ChatShell title={heading} bottom={bottom} dim={reviewing}>
      {role === 'cro' && state.sheet && <SheetCard sheet={state.sheet} message={requestMessage} />}
      {role === 'requester' && !state.messages.length && state.status !== 'starting' && !state.error && (
        <AgentText>어떤 시험 견적이 필요해요?</AgentText>
      )}
      {role === 'cro' && !state.messages.length && !draft && !quoteLines.length && state.status === 'idle' && !state.error && (
        <AgentText>견적 금액부터 넣을까요?</AgentText>
      )}
      {state.status === 'starting' && <StepLog steps={[{ label: '대화 여는 중', state: 'now' }]} />}

      {state.messages.map((m) => (m.role === 'user' ? <UserMessage key={m.id} text={m.text} /> : <AgentText key={m.id}>{m.text}</AgentText>))}

      {state.status === 'streaming' && (
        <View>
          <StepLog steps={[{ label: state.step ?? '답 준비', state: 'now' }]} />
          {state.streaming ? <AgentText>{state.streaming}</AgentText> : null}
        </View>
      )}

      {state.summary && !busy && (
        <View style={styles.card}>
          <Txt variant="label" style={{ fontFamily: fonts.bold, marginBottom: space.sm }}>
            요청 요약
          </Txt>
          {state.summary.map((p) => (
            <Txt key={p} variant="small" color={tokens.muted}>
              {p}
            </Txt>
          ))}
        </View>
      )}

      {state.question && !busy && (
        <QuestionCard
          title={SHEET_LABELS[state.question.field as SheetField] ?? '확인할 항목'}
          questions={[{ id: state.question.field, label: state.question.question, options: state.question.options }]}
          onSubmit={(a) => void send(`${labelOf(state.question!.field)}: ${a[state.question!.field]}`)}
          onSkip={() => void send(`${labelOf(state.question!.field)}: 미정`)}
        />
      )}

      {/* 기관: 초안 전에도 다음 할 일이 보이게. 금액은 사람이 넣고, 본문은 AI가 쓴다. */}
      {role === 'cro' && !draft && !state.draftSent && state.status === 'idle' && state.conversationId && out.kind === 'idle' && (
        <View style={styles.card}>
          {quoteLines.length > 0 && (
            <View style={[styles.to, { marginTop: 0, paddingTop: 0, borderTopWidth: 0, marginBottom: space.md }]}>
              <Txt variant="caption" color={tokens.muted} style={{ fontFamily: fonts.semibold }}>
                견적 총액
              </Txt>
              <Txt variant="small" tabular style={{ flex: 1, fontFamily: fonts.bold }}>
                {`${formatWonShort(computeTotals(quoteLines).totalWithVatWon)}${durationWeeks ? `, ${durationWeeks}주` : ''}`}
              </Txt>
              <Button title="고치기" kind="ghost" onPress={onEditQuote} />
            </View>
          )}
          <View style={styles.next}>
            {!quoteLines.length && <Button title="견적 금액 넣기" flex={1} onPress={onEditQuote} />}
            <Button title="회신 초안 만들기" kind={quoteLines.length ? 'ink' : 'line'} flex={1} onPress={() => void send('회신 초안을 써 주세요.')} />
          </View>
        </View>
      )}

      {canReview && !reviewing && (
        <View style={styles.card}>
          <Txt variant="label" style={{ fontFamily: fonts.bold, marginBottom: space.sm }}>
            {role === 'cro' ? '회신 초안' : '요청 본문 초안'}
          </Txt>
          <Txt variant="small">{draft!.body}</Txt>
          {role === 'requester' && (
            <View style={styles.to}>
              <Txt variant="caption" color={tokens.muted} style={{ fontFamily: fonts.semibold }}>
                받는 기관
              </Txt>
              <Txt variant="small" style={{ flex: 1, fontFamily: fonts.semibold }} numberOfLines={2}>
                {recipients.length ? recipients.map((r) => r.name).join(', ') : '선택 전'}
              </Txt>
              {recipients.length > 0 && <Button title="바꾸기" kind="ghost" onPress={() => setPicking(true)} />}
            </View>
          )}
          {draft!.dropped > 0 && (
            <Txt variant="caption" color={tokens.wait} style={{ marginTop: space.sm }}>
              {`점검에서 뺀 문장 ${draft!.dropped}개`}
            </Txt>
          )}
          {role === 'cro' && quoteLines.length > 0 && (
            <View style={styles.to}>
              <Txt variant="caption" color={tokens.muted} style={{ fontFamily: fonts.semibold }}>
                견적 총액
              </Txt>
              <Txt variant="small" tabular style={{ flex: 1, fontFamily: fonts.bold }}>
                {`${formatWonShort(computeTotals(quoteLines).totalWithVatWon)}${durationWeeks ? `, ${durationWeeks}주` : ''}`}
              </Txt>
              <Button title="고치기" kind="ghost" onPress={onEditQuote} />
            </View>
          )}
          <View style={styles.act}>
            <Button
              title={role === 'requester' && !recipients.length ? '받는 기관 고르기' : needsQuote ? '견적 금액 넣기' : '확인하기'}
              onPress={openReview}
            />
          </View>
        </View>
      )}

      {out.kind === 'done' && (
        <View style={styles.row} accessibilityLiveRegion="polite">
          <CheckCircle size={16} weight="fill" color={out.unknown ? tokens.wait : tokens.accent} />
          <Txt variant="caption" color={out.unknown ? tokens.wait : tokens.accent} style={{ fontFamily: fonts.semibold, flex: 1 }}>
            {out.unknown ? `${out.sent}곳 보냄, ${out.unknown}곳 결과 확인 필요` : role === 'cro' ? '회신을 보냈어요' : `${out.sent}곳에 보냈어요`}
          </Txt>
          {role === 'requester' && sentRequestId && (
            <Button title="진행 보기" kind="line" onPress={() => router.replace({ pathname: '/requester/[id]', params: { id: sentRequestId } })} />
          )}
        </View>
      )}
      {state.draftSent && out.kind !== 'done' && (
        <View style={styles.row}>
          <CheckCircle size={16} weight="fill" color={tokens.accent} />
          <Txt variant="caption" color={tokens.accent} style={{ fontFamily: fonts.semibold, flex: 1 }}>
            보낸 본문
          </Txt>
        </View>
      )}
      {out.kind === 'error' && <ErrorLine label="보내지 못했어요" onRetry={() => void approve()} />}

      {state.error && <ErrorLine label={ERROR_LABEL[state.error]} onRetry={RETRYABLE.includes(state.error) ? retry : undefined} />}
    </ChatShell>
  );
}

const sheetTitle = (s: Record<string, string | null>) => [s.species, s.duration, s.testType].filter(Boolean).join(' ') || null;

const labelOf = (f: string) => SHEET_LABELS[f as SheetField] ?? f;

/** 받은 요청을 코드가 짧은 줄로 묶는다(AI 요약 전 원문). */
function SheetCard({ sheet, message }: { sheet: Record<string, string | null>; message?: string | null }) {
  const join = (...v: (string | null)[]) => v.filter(Boolean).join(' ');
  const lines = [
    join(sheet.species, sheet.route, sheet.duration),
    join(sheet.testType, sheet.glp, sheet.substance),
    sheet.dueDate && `회신 기한 ${sheet.dueDate}`,
    sheet.notes,
  ].filter((l): l is string => Boolean(l));
  return (
    <View style={styles.card}>
      <Txt variant="label" style={{ fontFamily: fonts.bold, marginBottom: space.sm }}>
        받은 요청
      </Txt>
      {lines.map((l) => (
        <Txt key={l} variant="small" color={tokens.muted}>
          {l}
        </Txt>
      ))}
      {message ? (
        <Txt variant="small" style={styles.msg}>
          {message}
        </Txt>
      ) : null}
    </View>
  );
}

function ErrorLine({ label, onRetry }: { label: string; onRetry?: () => void }) {
  return (
    <View style={styles.row} accessibilityRole="alert">
      <WarningCircle size={16} weight="fill" color={tokens.danger} />
      <Txt variant="caption" color={tokens.danger} style={{ fontFamily: fonts.semibold, flex: 1 }}>
        {label}
      </Txt>
      {onRetry && <Button title="다시 시도" kind="line" icon={<ArrowClockwise size={14} color={tokens.text} />} onPress={onRetry} />}
    </View>
  );
}

const styles = StyleSheet.create({
  next: { flexDirection: 'row', gap: space.sm },
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, padding: space.lg, gap: 6 },
  act: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  msg: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: tokens.border },
  to: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: tokens.border, minHeight: 44 },
});
