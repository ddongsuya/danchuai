// 기관 비서(에이전트 액션 등록부 1~3단계). 단추 고객관리·일정·할 일을 말로 맡긴다.
// 비서는 기관 안 기록만 바로 하고(실행 카드, 되돌리기), 밖으로 나가는 일은 받은 요청 화면의 확인 카드로만 나간다.
// 처음 열면 단추 브리핑(오늘 할 일·손이 필요한 안건)을 보여 준다. 숫자·금액은 단추가 계산한 화면에서 본다.
import { ArrowCounterClockwise, CheckCircle, MinusCircle, Question, WarningCircle } from 'phosphor-react-native';
import { Fragment, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChatShell } from '@/components/chat/ChatShell';
import { Composer } from '@/components/chat/Composer';
import { AgentText, StepLog, UserMessage } from '@/components/chat/Messages';
import { ERROR_LABEL, ErrorLine, RETRYABLE } from '@/components/agent/LiveChat';
import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { useAgentChat } from '@/hooks/useAgentChat';
import { AgentHttpError, readDanchu, undoRun, type AssistBriefView } from '@/lib/agentClient';
import type { ActionCard, ChatErrorCode, ChatMessage } from '@/lib/chat';

/** 빈 대화에서 바로 보낼 말 */
const STARTERS = ['아침 브리핑', '이번 주 보고'] as const;

export function AssistChat() {
  const { state, send, retry, markUndone } = useAgentChat('cro', undefined, undefined, 'assist');
  const [brief, setBrief] = useState<AssistBriefView | null | 'error'>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<ChatErrorCode | null>(null);

  useEffect(() => {
    let live = true;
    readDanchu<{ brief: AssistBriefView }>('brief')
      .then((r) => live && setBrief(r.brief))
      .catch(() => live && setBrief('error'));
    return () => {
      live = false;
    };
  }, []);

  const undo = async (runId: string) => {
    setUndoing(runId);
    setUndoError(null);
    try {
      await undoRun(runId);
      markUndone(runId);
    } catch (e) {
      setUndoError(e instanceof AgentHttpError ? e.code : 'network');
    } finally {
      setUndoing(null);
    }
  };

  const busy = state.status !== 'idle';
  return (
    <AssistView
      brief={brief}
      messages={state.messages}
      actions={state.actions}
      streaming={state.status === 'streaming' ? { step: state.step, text: state.streaming } : null}
      starting={state.status === 'starting'}
      canSend={!busy && !!state.conversationId}
      error={undoError ?? state.error}
      onRetry={undoError ? undefined : RETRYABLE.includes(state.error as ChatErrorCode) ? retry : undefined}
      undoing={undoing}
      onSend={(t) => void send(t)}
      onUndo={(id) => void undo(id)}
    />
  );
}

export interface AssistViewProps {
  brief: AssistBriefView | null | 'error';
  messages: ChatMessage[];
  actions: ActionCard[];
  streaming: { step: string | null; text: string } | null;
  starting?: boolean;
  canSend: boolean;
  error: ChatErrorCode | null;
  onRetry?: () => void;
  undoing?: string | null;
  onSend: (text: string) => void;
  onUndo: (runId: string) => void;
}

/** 화면 모양만(미리보기에서도 쓴다) */
export function AssistView({ brief, messages, actions, streaming, starting, canSend, error, onRetry, undoing, onSend, onUndo }: AssistViewProps) {
  const empty = !messages.length && !streaming;
  const cardsAt = (i: number) => actions.filter((a) => a.at === i);
  // 답 글 없이 끝난 턴의 카드는 맨 뒤에
  const tail = actions.filter((a) => a.at >= messages.length);
  return (
    <ChatShell title="비서" bottom={<Composer disabled={!canSend} placeholder="비서에게 맡길 일" onSend={onSend} />}>
      {starting && <StepLog steps={[{ label: '단추에서 오늘 일정 읽는 중', state: 'now' }]} />}
      {empty && <BriefCard brief={brief} />}
      {empty && canSend && (
        <View style={styles.starters}>
          {STARTERS.map((t) => (
            <Button key={t} title={t} kind="soft" onPress={() => onSend(t)} />
          ))}
        </View>
      )}

      {messages.map((m, i) => (
        <Fragment key={m.id}>
          {m.role === 'user' ? <UserMessage text={m.text} /> : <AgentText>{m.text}</AgentText>}
          {m.role === 'agent' && cardsAt(i).map((a) => <RunCard key={a.key} card={a} busy={undoing === a.runId} onUndo={onUndo} />)}
        </Fragment>
      ))}

      {streaming && (
        <View>
          <StepLog steps={[{ label: streaming.step ?? '답 준비 중', state: 'now' }]} />
          {streaming.text ? <AgentText>{streaming.text}</AgentText> : null}
        </View>
      )}
      {!streaming && tail.map((a) => <RunCard key={a.key} card={a} busy={undoing === a.runId} onUndo={onUndo} />)}

      {error && <ErrorLine label={ERROR_LABEL[error]} onRetry={onRetry} />}
    </ChatShell>
  );
}

const md = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00+09:00`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${'일월화수목금토'[d.getUTCDay()]}요일`;
};

/** 오늘 브리핑: 오늘 할 일(시간순, 기한 지난 것 먼저)과 손이 필요한 안건. 단추 오늘 화면과 같은 계산 */
function BriefCard({ brief }: { brief: AssistBriefView | null | 'error' }) {
  if (brief === null) return <StepLog steps={[{ label: '오늘 할 일 읽는 중', state: 'now' }]} />;
  if (brief === 'error') return <ErrorLine label="오늘 할 일을 불러오지 못했어요" />;
  const today = brief.today.filter((x) => !x.done).slice(0, 6);
  const need = brief.need.slice(0, 4);
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, flex: 1 }} accessibilityRole="header">
          오늘
        </Txt>
        <Txt variant="caption" color={tokens.muted}>
          {md(brief.date)}
        </Txt>
      </View>
      {today.length ? (
        today.map((x, i) => (
          <View key={`t${i}`} style={[styles.row, i > 0 && styles.line]}>
            <Txt variant="caption" color={tokens.muted} tabular style={styles.time}>
              {x.time ?? '종일'}
            </Txt>
            <View style={{ flex: 1, gap: u(2) }}>
              <Txt variant="small" style={{ fontFamily: fonts.semibold }} numberOfLines={2}>
                {x.title}
              </Txt>
              {!!x.sub && (
                <Txt variant="caption" color={tokens.muted} numberOfLines={2}>
                  {x.sub}
                </Txt>
              )}
            </View>
            {x.overdue && (
              <Txt variant="caption" color={tokens.danger} style={{ fontFamily: fonts.semibold }}>
                기한 지남
              </Txt>
            )}
          </View>
        ))
      ) : (
        <Txt variant="small" color={tokens.muted}>
          오늘 할 일 없음
        </Txt>
      )}
      {need.length > 0 && (
        <>
          <Txt variant="caption" color={tokens.muted} style={styles.sub}>
            손이 필요한 안건
          </Txt>
          {need.map((x, i) => (
            <View key={x.dealId} style={[styles.row, i > 0 && styles.line]}>
              <View style={{ flex: 1, gap: u(2) }}>
                <Txt variant="small" style={{ fontFamily: fonts.semibold }} numberOfLines={1}>
                  {x.title}
                </Txt>
                <Txt variant="caption" color={tokens.muted} numberOfLines={1}>
                  {[x.company, x.reason].filter(Boolean).join(', ')}
                </Txt>
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const OUTCOME = {
  done: { label: '완료', Icon: CheckCircle, color: tokens.accent },
  failed: { label: '거절됨', Icon: WarningCircle, color: tokens.danger },
  unknown: { label: '결과 확인 필요', Icon: Question, color: tokens.muted },
  skipped: { label: '실행 안 함', Icon: MinusCircle, color: tokens.muted },
} as const;

/** 실행 카드: 비서가 단추에서 바로 한 일 한 줄과 되돌리기 */
function RunCard({ card, busy, onUndo }: { card: ActionCard; busy: boolean; onUndo: (runId: string) => void }) {
  const o = card.undone ? { label: '되돌림', Icon: ArrowCounterClockwise, color: tokens.muted } : OUTCOME[card.outcome];
  return (
    <View style={styles.run} accessible={!card.undoable} accessibilityLabel={`${card.label}, ${o.label}`}>
      <o.Icon size={u(18)} weight={card.outcome === 'done' && !card.undone ? 'fill' : 'regular'} color={o.color} />
      <View style={{ flex: 1, gap: u(2) }}>
        <Txt variant="small" style={{ fontFamily: fonts.semibold }} numberOfLines={1}>
          {card.label}
        </Txt>
        <Txt variant="caption" color={o.color === tokens.accent ? tokens.accent : o.color}>
          {card.message ?? o.label}
        </Txt>
      </View>
      {card.undoable && card.runId && <Button title="되돌리기" kind="text" loading={busy} disabled={busy} onPress={() => onUndo(card.runId!)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, paddingHorizontal: space.lg, paddingVertical: space.md, gap: u(2) },
  head: { flexDirection: 'row', alignItems: 'center', paddingBottom: u(6) },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: u(10) },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  time: { width: u(40), paddingTop: u(2) },
  sub: { marginTop: space.sm, fontFamily: fonts.semibold },
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  run: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: u(52),
    paddingHorizontal: space.lg,
    paddingVertical: u(10),
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: tokens.border,
    backgroundColor: tokens.surface,
  },
});
