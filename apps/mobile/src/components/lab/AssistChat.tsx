// 기관 비서(에이전트 액션 등록부 1~3단계). 단추 고객관리·일정·할 일을 말로 맡긴다.
// 비서는 기관 안 기록만 바로 하고(실행 카드, 되돌리기), 밖으로 나가는 일은 받은 요청 화면의 확인 카드로만 나간다.
// 처음 열면 단추 브리핑(오늘 할 일·손이 필요한 안건)을 보여 준다. 숫자·금액은 단추가 계산한 화면에서 본다.
// 기관의 대화 탭이다(Muse 시안 2026-11-25): 위 가운데 비서 캐릭터·이름·상태, 왼쪽 서랍(탭·따로 하는 대화·설정),
// 답을 준비하는 동안 말풍선에 점 셋이 튀고 위 상태는 "일하는 중".
import { ArrowCounterClockwise, CheckCircle, MinusCircle, Question, WarningCircle } from 'phosphor-react-native';
import { router, type Href } from 'expo-router';
import { Fragment, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChatShell } from '@/components/chat/ChatShell';
import { ConfirmCard } from '@/components/chat/ConfirmCard';
import { Composer } from '@/components/chat/Composer';
import { AgentText, StepLog, TaskCard, TimeLine, UserMessage } from '@/components/chat/Messages';
import { TypingBubble } from '@/components/chat/TypingBubble';
import { LookupCard } from '@/components/agent/LookupCard';
import { RecordSheet } from '@/components/agent/RecordSheet';
import { AgentHeader } from '@/components/shell/AgentHeader';
import { InviteButton } from '@/components/shell/InviteButton';
import { useShell } from '@/components/shell/ShellContext';
import { ERROR_LABEL, ErrorLine, RETRYABLE } from '@/components/agent/LiveChat';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, tokens, uc } from '@/constants/theme';
import { useAgentChat } from '@/hooks/useAgentChat';
import { AgentHttpError, readDanchu, runDanchu, undoRun, type AssistBriefView, type QuoteHitView } from '@/lib/agentClient';
import { hasBatchim, subjName } from '@/lib/format';
import { useAgentName } from '@/lib/session';
import type { ActionCard, ChatErrorCode, ChatMessage, LookupCard as LookupItem } from '@/lib/chat';

/** 브리핑 카드 단추로 보낼 말(나머지 제안은 맡길 일 탭) */
const STARTERS = ['오늘 아침 브리핑 보여 줘'] as const;

export function AssistChat() {
  const { state, send, retry, markUndone, patchAction } = useAgentChat('cro', undefined, undefined, 'assist');
  const [allowing, setAllowing] = useState<string | null>(null);
  const [brief, setBrief] = useState<AssistBriefView | null | 'error'>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<ChatErrorCode | null>(null);
  // 맡길 일 탭에서 넘긴 일: 보낼 말은 대화가 준비되면 한 번 보내고, 녹음은 녹음 시트를 연다
  const { pending, handoff } = useShell();
  useEffect(() => {
    if (pending?.kind !== 'send' || !state.conversationId || state.status !== 'idle') return;
    handoff(null);
    void send(pending.text);
  }, [pending, handoff, send, state.conversationId, state.status]);

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

  // 권한 "매번 묻기": 사람이 허용한 그 동작·본문으로 한 번만 부른다(서버가 실행 기록을 남긴다)
  const allow = async (card: ActionCard) => {
    if (!card.ask) return;
    setAllowing(card.key);
    try {
      const r = await runDanchu(card.ask.action, card.ask.body);
      patchAction(card.key, { outcome: r.run.outcome, runId: r.run.id, undoable: r.run.undoable, ask: null, message: null });
    } catch {
      patchAction(card.key, { outcome: 'unknown', ask: null, message: '결과를 확인해 주세요' });
    } finally {
      setAllowing(null);
    }
  };

  const busy = state.status !== 'idle';
  return (
    <AssistView
      brief={brief}
      messages={state.messages}
      actions={state.actions}
      lookups={state.lookups}
      streaming={state.status === 'streaming' ? { step: state.step, text: state.streaming } : null}
      starting={state.status === 'starting'}
      canSend={!busy && !!state.conversationId}
      error={undoError ?? state.error}
      onRetry={undoError ? undefined : RETRYABLE.includes(state.error as ChatErrorCode) ? retry : undefined}
      undoing={undoing}
      onSend={(t) => void send(t)}
      onTranscript={(t, minutes) => void send(`회의 녹음 정리해 줘 (${minutes}분)`, t)}
      onUndo={(id) => void undo(id)}
      allowing={allowing}
      onAllow={(c) => void allow(c)}
      onReject={(c) => patchAction(c.key, { outcome: 'skipped', ask: null, message: '거절했어요' })}
      recordRequested={pending?.kind === 'record'}
      onRecordClosed={() => handoff(null)}
    />
  );
}

export interface AssistViewProps {
  brief: AssistBriefView | null | 'error';
  messages: ChatMessage[];
  actions: ActionCard[];
  /** 찾기 카드(과거 견적 등). 카드가 단추를 직접 읽는다 */
  lookups?: LookupItem[];
  /** 미리보기에서 찾기 결과를 채워 보여 줄 때만 */
  lookupPreview?: QuoteHitView[];
  streaming: { step: string | null; text: string } | null;
  starting?: boolean;
  canSend: boolean;
  error: ChatErrorCode | null;
  onRetry?: () => void;
  undoing?: string | null;
  onSend: (text: string) => void;
  /** 회의 녹음 전사본을 비서에게 맡긴다. 없으면 마이크 버튼을 숨긴다 */
  onTranscript?: (transcript: string, minutes: number) => void;
  /** 미리보기에서 녹음 시트를 연 채로 보여 줄 때만 */
  initialRecordOpen?: boolean;
  onUndo: (runId: string) => void;
  /** "매번 묻기"로 멈춘 카드 허용·거절 */
  allowing?: string | null;
  onAllow?: (card: ActionCard) => void;
  onReject?: (card: ActionCard) => void;
  /** 맡길 일 탭에서 녹음을 맡겼다(시트를 연다) */
  recordRequested?: boolean;
  onRecordClosed?: () => void;
}

/** 화면 모양만(미리보기에서도 쓴다) */
export function AssistView({ brief, messages, actions, lookups = [], lookupPreview, streaming, starting, canSend, error, onRetry, undoing, onSend, onTranscript, initialRecordOpen = false, onUndo, allowing, onAllow, onReject, recordRequested, onRecordClosed }: AssistViewProps) {
  const agentName = useAgentName();
  const [recordOpen, setRecordOpen] = useState(initialRecordOpen);
  if (recordRequested && onTranscript && !recordOpen) setRecordOpen(true);
  const closeRecord = () => {
    onRecordClosed?.();
    setRecordOpen(false);
  };
  const empty = !messages.length && !streaming;
  const cardsAt = (i: number) => actions.filter((a) => a.at === i);
  const findsAt = (i: number) => lookups.filter((a) => a.at === i);
  // 답 글 없이 끝난 턴의 카드는 맨 뒤에
  const tail = actions.filter((a) => a.at >= messages.length);
  const findTail = lookups.filter((a) => a.at >= messages.length);
  const thinking = !!streaming && !streaming.text;
  // 위 막대: 서랍, 가운데 비서 캐릭터·이름·상태(답을 준비하는 동안 "일하는 중"), 오른쪽 초대
  const nav = <AgentHeader working={!!streaming || !!starting} right={<InviteButton />} />;
  return (
    <ChatShell
      title="비서"
      tabs
      nav={nav}
      bottom={<Composer disabled={!canSend} placeholder="메시지" onSend={onSend} onPlus={() => router.navigate('/ideas' as Href)} onMic={onTranscript ? () => setRecordOpen(true) : undefined} />}
    >
      {onTranscript && <RecordSheet visible={recordOpen} onClose={closeRecord} onTranscript={onTranscript} />}
      {/* 오늘 대화는 늘 브리핑으로 시작한다(시안 m02: 비서 말 → 카드 → 시각 → 대화) */}
      <AgentText>{brief && brief !== 'error' ? '오늘 할 일을 한 장으로 모아 봤어요.' : '오늘은 무엇을 맡아 드릴까요?'}</AgentText>
      <BriefCard brief={brief} onMore={canSend && empty ? () => onSend(STARTERS[0]) : undefined} />
      {!empty && brief && brief !== 'error' ? <TimeLine>{md(brief.date)}</TimeLine> : null}
      {messages.map((m, i) => (
        <Fragment key={m.id}>
          {m.role === 'user' ? <UserMessage text={m.text} /> : <AgentText>{m.text}</AgentText>}
          {m.role === 'agent' && cardsAt(i).map((a) => <RunCard key={a.key} card={a} busy={undoing === a.runId} onUndo={onUndo} agentName={agentName} allowing={allowing === a.key} onAllow={onAllow} onReject={onReject} />)}
          {m.role === 'agent' && findsAt(i).map((a) => <LookupCard key={a.key} card={a} initial={lookupPreview} />)}
        </Fragment>
      ))}

      {thinking && <TypingBubble label={streaming!.step} />}
      {streaming?.text ? <AgentText>{streaming.text}</AgentText> : null}
      {!streaming && tail.map((a) => <RunCard key={a.key} card={a} busy={undoing === a.runId} onUndo={onUndo} agentName={agentName} allowing={allowing === a.key} onAllow={onAllow} onReject={onReject} />)}
      {!streaming && findTail.map((a) => <LookupCard key={a.key} card={a} initial={lookupPreview} />)}

      {error && <ErrorLine label={ERROR_LABEL[error]} onRetry={onRetry} />}
    </ChatShell>
  );
}

const md = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00+09:00`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${'일월화수목금토'[d.getUTCDay()]}요일`;
};

/** 오늘 브리핑(.task 모양): 오늘 할 일(시간순, 기한 지난 것 먼저)과 손이 필요한 안건. 단추 오늘 화면과 같은 계산 */
function BriefCard({ brief, onMore }: { brief: AssistBriefView | null | 'error'; onMore?: () => void }) {
  if (brief === null) return <StepLog steps={[{ label: '오늘 할 일을 살펴보는 중이에요', state: 'now' }]} />;
  if (brief === 'error') return <ErrorLine label="오늘 할 일을 못 불러왔어요. 조금 뒤에 다시 열어 주세요" />;
  const today = brief.today.filter((x) => !x.done).slice(0, 4);
  const need = brief.need.slice(0, 3);
  const body = today.length || need.length ? undefined : '오늘은 아직 할 일이 없어요. 새 요청이 오면 알려 드릴게요.';
  return (
    <TaskCard icon="clock" title="오늘 브리핑" sub={md(brief.date)} body={body} action={onMore ? '브리핑 자세히 보기' : undefined} onAction={onMore}>
      {today.map((x, i) => (
        <View key={`t${i}`} style={styles.row}>
          <Txt style={styles.time} color={tokens.muted} tabular>
            {x.time ?? '종일'}
          </Txt>
          <Txt style={styles.rowText} numberOfLines={1}>
            {x.title}
          </Txt>
          {x.overdue && (
            <Txt style={styles.flag} color={tokens.danger}>
              기한 지남
            </Txt>
          )}
        </View>
      ))}
      {need.map((x) => (
        <View key={x.dealId} style={styles.row}>
          <Txt style={styles.time} color={tokens.primary}>
            확인
          </Txt>
          <Txt style={styles.rowText} numberOfLines={1}>
            {[x.title, x.reason].filter(Boolean).join(', ')}
          </Txt>
        </View>
      ))}
    </TaskCard>
  );
}

const OUTCOME = {
  done: { label: '다 했어요', Icon: CheckCircle, color: tokens.accent },
  failed: { label: '거절했어요', Icon: WarningCircle, color: tokens.danger },
  unknown: { label: '결과를 확인해 주세요', Icon: Question, color: tokens.muted },
  skipped: { label: '하지 않았어요', Icon: MinusCircle, color: tokens.muted },
  pending: { label: '허용을 기다려요', Icon: Question, color: tokens.primary },
} as const;

/** 확인 카드에 보일 칸(단추 동작 본문의 사람이 읽는 값만). 아이디·기술 값은 보이지 않는다 */
const ASK_FIELD: Record<string, string> = { title: '제목', name: '이름', due: '기한', dueAt: '기한', date: '날짜', start: '시작', startAt: '시작', end: '끝', endAt: '끝', stage: '단계', summary: '내용', note: '메모', body: '내용', kind: '종류', company: '회사' };
const askRows = (body: Record<string, unknown>): [string, string][] =>
  Object.entries(body)
    .filter(([k, v]) => ASK_FIELD[k] && (typeof v === 'string' || typeof v === 'number') && String(v).trim())
    .slice(0, 5)
    .map(([k, v]) => [ASK_FIELD[k], String(v).slice(0, 200)]);

/** 실행 카드: 비서가 단추에서 바로 한 일 한 줄과 되돌리기 */
function RunCard({ card, busy, onUndo, agentName, allowing, onAllow, onReject }: { card: ActionCard; busy: boolean; onUndo: (runId: string) => void; agentName: string; allowing?: boolean; onAllow?: (c: ActionCard) => void; onReject?: (c: ActionCard) => void }) {
  if (card.outcome === 'pending' && card.ask && onAllow && onReject) {
    const rows = askRows(card.ask.body);
    return (
      <ConfirmCard
        title={`${subjName(agentName)} 단추에 ${card.label}${hasBatchim(card.label) ? '을' : '를'} 하려고 해요`}
        note="권한이 매번 묻기라서 기록하기 전에 여쭤봐요."
        preview={
          rows.length ? (
            <View style={styles.askRows}>
              {rows.map(([k, v]) => (
                <View key={k} style={styles.askRow}>
                  <Txt style={styles.askK} color={tokens.muted}>
                    {k}
                  </Txt>
                  <Txt style={styles.askV}>{v}</Txt>
                </View>
              ))}
            </View>
          ) : undefined
        }
        onReject={() => onReject(card)}
        onAllow={() => onAllow(card)}
        busy={allowing}
        foot="허용하면 단추에 한 번 기록해요. 7일 안에 되돌릴 수 있어요."
      />
    );
  }
  const o = card.undone ? { label: '되돌렸어요', Icon: ArrowCounterClockwise, color: tokens.muted } : OUTCOME[card.outcome];
  return (
    <View style={styles.run} accessible={!card.undoable} accessibilityLabel={`${card.label}, ${o.label}`}>
      <o.Icon size={uc(18)} weight={card.outcome === 'done' && !card.undone ? 'fill' : 'regular'} color={o.color} />
      <View style={{ flex: 1, gap: uc(2) }}>
        <Txt variant="chatSmall" style={{ fontFamily: fonts.semibold }} numberOfLines={1}>
          {card.label}
        </Txt>
        <Txt variant="chatCaption" color={o.color === tokens.accent ? tokens.accent : o.color}>
          {card.message ?? o.label}
        </Txt>
      </View>
      {card.undoable && card.runId && (
        <Press label="되돌리기" disabled={busy} onPress={() => onUndo(card.runId!)} style={styles.undo}>
          <Txt variant="chatLabel" color={busy ? tokens.faint : tokens.muted}>
            {busy ? '되돌리는 중' : '되돌리기'}
          </Txt>
        </Press>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  time: { width: 36, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 20 },
  rowText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  flag: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 18 },
  undo: { minHeight: uc(36), paddingHorizontal: uc(10), justifyContent: 'center' },
  askRows: { padding: 14, gap: 8 },
  askRow: { flexDirection: 'row', gap: 12 },
  askK: { width: 44, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  askV: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  run: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: uc(10),
    minHeight: uc(52),
    paddingHorizontal: uc(14),
    paddingVertical: uc(10),
    borderRadius: uc(18),
    borderWidth: 1,
    borderColor: tokens.border,
    backgroundColor: tokens.surface,
  },
});
