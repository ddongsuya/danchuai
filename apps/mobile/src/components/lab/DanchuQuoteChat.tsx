// 기관: AI와 견적 초안 만들기(말로 맡기는 견적 2단계). 단추 요청 번호로 대화를 열면 서버가 단추에서 요청서와 회신 초안을 읽어 온다.
// 에이전트는 대화로 초안의 가능 여부·기간·조건·전달 사항만 고친다(update_quote). 금액은 단추 계산 또는 담당자가 확인 화면에서 넣는다.
// 제출은 담당자가 확인 화면에서 누를 때만 일어난다. 에이전트는 제출하지 못한다.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChatShell } from '@/components/chat/ChatShell';
import { Composer } from '@/components/chat/Composer';
import { AgentText, StepLog, UserMessage } from '@/components/chat/Messages';
import { ERROR_LABEL, ErrorLine, RETRYABLE } from '@/components/agent/LiveChat';
import { DanchuQuoteReview } from '@/components/lab/DanchuQuoteReview';
import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { useAgentChat } from '@/hooks/useAgentChat';
import { blockedLabel, quoteSubmittedNow, reviewLines, type DanchuQuoteDraft } from '@/lib/danchuQuote';

/** 제목 위 한 줄: 분야와 시험물질 */
const lineOf = (q: DanchuQuoteDraft) => [q.request.categories.join(', '), q.request.substance].filter(Boolean).join(', ') || q.no;

export function DanchuQuoteChat({ no }: { no: string }) {
  const { state, send, retry, refresh } = useAgentChat('cro', no);
  const [reviewing, setReviewing] = useState(false);
  const busy = state.status !== 'idle';
  const q = state.quote;

  if (reviewing && q) {
    return <DanchuQuoteReview no={no} line={lineOf(q)} quote={q} conversationId={state.conversationId ?? undefined} onBack={() => setReviewing(false)} onSubmitted={() => void refresh()} />;
  }

  return (
    <ChatShell title={no} bottom={<Composer disabled={busy || !state.conversationId} onSend={(t) => void send(t)} />}>
      {state.status === 'starting' && <StepLog steps={[{ label: '단추에서 요청서 읽는 중', state: 'now' }]} />}
      {q && !state.messages.length && state.status === 'idle' && <AgentText>견적 초안에서 정할 것부터 짚어 볼까요?</AgentText>}
      {q && !state.messages.length && state.status === 'idle' && (
        <Button title="초안 점검" kind="soft" onPress={() => void send('견적 초안을 점검하고 정할 것을 알려 주세요.')} />
      )}

      {state.messages.map((m) => (m.role === 'user' ? <UserMessage key={m.id} text={m.text} /> : <AgentText key={m.id}>{m.text}</AgentText>))}

      {state.status === 'streaming' && (
        <View>
          <StepLog steps={[{ label: state.step ?? '답 준비 중', state: 'now' }]} />
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

      {q && !busy && <QuoteStatus quote={q} onReview={() => setReviewing(true)} />}

      {state.error && <ErrorLine label={ERROR_LABEL[state.error]} onRetry={RETRYABLE.includes(state.error) ? retry : undefined} />}
    </ChatShell>
  );
}

/** 대화 아래 견적 초안 상태: 항목 수, 남은 것, 제출 여부. 확인 화면으로 넘어간다 */
function QuoteStatus({ quote, onReview }: { quote: DanchuQuoteDraft; onReview: () => void }) {
  const lines = reviewLines(quote);
  const blocked = blockedLabel(quote, {});
  const manual = lines.filter((l) => l.source === 'manual' && (l.avail === '가능' || l.avail === '조건부 가능')).length;
  const submitted = quote.submittedVersion != null;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Txt variant="label" style={{ flex: 1, fontFamily: fonts.bold }}>
          견적 초안
        </Txt>
        <Txt variant="caption" color={submitted ? tokens.accent : tokens.muted} style={{ fontFamily: fonts.semibold }}>
          {submitted ? (quoteSubmittedNow(quote) ? '제출함' : '제출 뒤 고침') : '제출 전'}
        </Txt>
      </View>
      <Txt variant="small" color={tokens.muted} tabular>
        {[`시험 ${lines.length}개`, manual ? `금액 직접 입력 ${manual}줄` : null, blocked && !blocked.startsWith('금액') ? blocked : null].filter(Boolean).join(', ')}
      </Txt>
      <View style={{ marginTop: space.sm }}>
        <Button title="견적 확인" onPress={onReview} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, padding: space.lg, gap: u(6) },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
