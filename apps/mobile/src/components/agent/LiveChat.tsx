// 서버와 연결된 대화 화면. 답은 흐르는 대로 보이고, 질문 카드·요약·보내기 전 승인 카드가 이어진다.
// 보내기는 사람이 승인 카드에서 누를 때만 일어난다. 에이전트는 보내지 못한다.
import { amountBlock, SHEET_LABELS, type QuoteLine, type SheetField } from '@danchuai/core';
import { ArrowClockwise, CheckCircle, WarningCircle } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApprovalCard, type Recipient } from '@/components/chat/ApprovalCard';
import { ChatShell } from '@/components/chat/ChatShell';
import { Composer } from '@/components/chat/Composer';
import { AgentText, StepLog, UserMessage } from '@/components/chat/Messages';
import { QuestionCard } from '@/components/chat/QuestionCard';
import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { useAgentChat } from '@/hooks/useAgentChat';
import { approveAndSend, createOutbound, type AgentRole } from '@/lib/agentClient';
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
  /** 의뢰자: 사람이 고른 받는 곳 */
  recipients?: Recipient[];
  /** 기관: 담당자가 넣은 견적 항목(원 단위). 합계는 코드가 계산한다. */
  quoteLines?: QuoteLine[];
}

type SendState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done'; sent: number; unknown: number } | { kind: 'error' };

export function LiveChat({ role, title, requestId, recipients = [], quoteLines = [] }: Props) {
  const { state, send, retry } = useAgentChat(role, requestId);
  const [reviewing, setReviewing] = useState(false);
  const [out, setOut] = useState<SendState>({ kind: 'idle' });
  const busy = state.status !== 'idle';
  const draft = state.draft;
  const outBody = draft && role === 'cro' && quoteLines.length ? `${draft.body}\n\n${amountBlock(quoteLines)}` : draft?.body ?? '';

  const approve = async () => {
    if (!state.conversationId || !draft) return;
    setOut({ kind: 'sending' });
    try {
      const { outbound } = await createOutbound(role, state.conversationId, {
        version: draft.version,
        ...(role === 'requester' ? { recipientOrgIds: recipients.map((r) => r.id) } : { quoteLines }),
      });
      let sent = 0;
      let unknown = 0;
      for (const d of outbound) {
        if ((await approveAndSend(role, d)) === 'sent') sent++;
        else unknown++;
      }
      setOut({ kind: 'done', sent, unknown });
      setReviewing(false);
    } catch {
      setOut({ kind: 'error' });
    }
  };

  const canReview = Boolean(draft) && out.kind !== 'done' && !busy && (role === 'cro' || recipients.length > 0);
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
    <ChatShell title={title} bottom={bottom} dim={reviewing}>
      {role === 'cro' && state.sheet && !state.messages.length && <SheetCard sheet={state.sheet} />}
      {role === 'requester' && !state.messages.length && state.status !== 'starting' && !state.error && (
        <AgentText>어떤 시험 견적이 필요해요?</AgentText>
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

      {canReview && !reviewing && (
        <View style={styles.card}>
          <Txt variant="label" style={{ fontFamily: fonts.bold, marginBottom: space.sm }}>
            {role === 'cro' ? '회신 초안' : '요청 본문 초안'}
          </Txt>
          <Txt variant="small">{draft!.body}</Txt>
          {draft!.dropped > 0 && (
            <Txt variant="caption" color={tokens.wait} style={{ marginTop: space.sm }}>
              {`점검에서 뺀 문장 ${draft!.dropped}개`}
            </Txt>
          )}
          <View style={styles.act}>
            <Button title="확인하기" onPress={() => setReviewing(true)} />
          </View>
        </View>
      )}

      {out.kind === 'done' && (
        <View style={styles.row} accessibilityLiveRegion="polite">
          <CheckCircle size={16} weight="fill" color={out.unknown ? tokens.wait : tokens.accent} />
          <Txt variant="caption" color={out.unknown ? tokens.wait : tokens.accent} style={{ fontFamily: fonts.semibold }}>
            {out.unknown ? `${out.sent}곳 보냄, ${out.unknown}곳 결과 확인 필요` : `${out.sent}곳에 보냈어요`}
          </Txt>
        </View>
      )}
      {out.kind === 'error' && <ErrorLine label="보내지 못했어요" onRetry={() => void approve()} />}

      {state.error && <ErrorLine label={ERROR_LABEL[state.error]} onRetry={RETRYABLE.includes(state.error) ? retry : undefined} />}
    </ChatShell>
  );
}

const labelOf = (f: string) => SHEET_LABELS[f as SheetField] ?? f;

/** 받은 요청을 코드가 짧은 줄로 묶는다(AI 요약 전 원문). */
function SheetCard({ sheet }: { sheet: Record<string, string | null> }) {
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
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, padding: space.lg, gap: 6 },
  act: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
