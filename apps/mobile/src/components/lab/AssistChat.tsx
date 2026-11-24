// 기관 비서(에이전트 액션 등록부 1~3단계). 단추 고객관리·일정·할 일을 말로 맡긴다.
// 비서는 기관 안 기록만 바로 하고(실행 카드, 되돌리기), 밖으로 나가는 일은 받은 요청 화면의 확인 카드로만 나간다.
// 처음 열면 단추 브리핑(오늘 할 일·손이 필요한 안건)을 보여 준다. 숫자·금액은 단추가 계산한 화면에서 본다.
// 기관의 첫 화면이다(시안 2026-11-20): 가운데 위에 비서 캐릭터, 왼쪽 위 메뉴(받은 요청·실행 기록·질문하기·계정),
// 답을 준비하는 동안 말풍선에 점 셋이 튄다.
import { router } from 'expo-router';
import { ArrowCounterClockwise, Bell, ChatCircleText, CheckCircle, ClockCounterClockwise, List, Microphone, MinusCircle, PaperPlaneTilt, Question, Tray, UserCircle, UserSwitch, WarningCircle } from 'phosphor-react-native';
import { Fragment, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChatShell } from '@/components/chat/ChatShell';
import { Composer } from '@/components/chat/Composer';
import { AgentText, StepLog, UserMessage } from '@/components/chat/Messages';
import { TypingBubble } from '@/components/chat/TypingBubble';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { AgentStatus, useSentCheck, useUnreadAlerts } from '@/components/agent/AgentStatus';
import { AppMenu, type MenuItem } from '@/components/agent/AppMenu';
import { LookupCard } from '@/components/agent/LookupCard';
import { RecordSheet } from '@/components/agent/RecordSheet';
import { IconButton } from '@/components/ui/IconButton';
import { ERROR_LABEL, ErrorLine, RETRYABLE } from '@/components/agent/LiveChat';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, tokens, u, uc } from '@/constants/theme';
import { useAgentChat } from '@/hooks/useAgentChat';
import { AgentHttpError, readDanchu, undoRun, type AssistBriefView, type QuoteHitView } from '@/lib/agentClient';
import { useAuth } from '@/lib/session';
import type { ActionCard, ChatErrorCode, ChatMessage, LookupCard as LookupItem } from '@/lib/chat';

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
  const { org, status } = useAuth();
  const sent = useSentCheck('cro');
  const alerts = useUnreadAlerts('cro');
  return (
    <AssistView
      sent={sent}
      menu={{ title: '비서', sub: org?.name ?? null, items: croMenu(0, alerts), footer: status === 'disabled' ? [{ key: 'switch', label: '의뢰자 화면으로 바꾸기', icon: <UserSwitch size={u(20)} color={tokens.text} />, onPress: () => router.replace('/') }] : [] }}
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
    />
  );
}

/** 기관 메뉴: 받은 요청(목록), 알림(읽지 않은 수), 보낸 것(승인해 단추로 나간 것), 비서가 한 일(실행 기록), 가이드라인 질문, 계정 */
export function croMenu(newCount = 0, alertCount = 0): MenuItem[] {
  const ic = (I: typeof Tray) => <I size={u(20)} color={tokens.text} />;
  return [
    { key: 'inbox', label: '받은 요청', icon: ic(Tray), count: newCount, onPress: () => router.push('/lab') },
    { key: 'alerts', label: '알림', icon: ic(Bell), count: alertCount, onPress: () => router.push({ pathname: '/alerts', params: { role: 'cro' } }) },
    { key: 'sent', label: '보낸 것', icon: ic(PaperPlaneTilt), onPress: () => router.push({ pathname: '/sent', params: { role: 'cro' } }) },
    { key: 'runs', label: '실행 기록', icon: ic(ClockCounterClockwise), onPress: () => router.push('/lab/runs') },
    { key: 'ask', label: '질문하기', icon: ic(ChatCircleText), onPress: () => router.push({ pathname: '/ask', params: { role: 'cro' } }) },
    { key: 'account', label: '계정', icon: ic(UserCircle), onPress: () => router.push('/account') },
  ];
}

export interface AssistViewProps {
  menu: { title: string; sub?: string | null; items: MenuItem[]; footer?: MenuItem[] };
  /** 미리보기에서 메뉴를 연 채로 보여 줄 때만 */
  initialMenuOpen?: boolean;
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
  /** 캐릭터 밑 상태 줄: 보낸 것 가운데 결과 확인 필요 건수 */
  sent?: { check: number; onCheck: () => void };
}

/** 화면 모양만(미리보기에서도 쓴다) */
export function AssistView({ menu, initialMenuOpen = false, brief, messages, actions, lookups = [], lookupPreview, streaming, starting, canSend, error, onRetry, undoing, onSend, onTranscript, initialRecordOpen = false, onUndo, sent }: AssistViewProps) {
  const [menuOpen, setMenuOpen] = useState(initialMenuOpen);
  const [recordOpen, setRecordOpen] = useState(initialRecordOpen);
  const empty = !messages.length && !streaming;
  const cardsAt = (i: number) => actions.filter((a) => a.at === i);
  const findsAt = (i: number) => lookups.filter((a) => a.at === i);
  // 답 글 없이 끝난 턴의 카드는 맨 뒤에
  const tail = actions.filter((a) => a.at >= messages.length);
  const findTail = lookups.filter((a) => a.at >= messages.length);
  const thinking = !!streaming && !streaming.text;
  // 위 막대: 왼쪽 메뉴, 가운데는 대화가 시작되면 작은 캐릭터(처음에는 본문 가운데 큰 캐릭터)
  const nav = (
    <View style={styles.nav}>
      <IconButton label="메뉴" onPress={() => setMenuOpen(true)}>
        <List size={u(22)} color={tokens.text} />
      </IconButton>
      <View style={styles.navMid}>{!empty && <AgentAvatar size={uc(30)} state={streaming ? 'thinking' : 'idle'} />}</View>
      {onTranscript ? (
        <IconButton label="회의 녹음" onPress={() => canSend && setRecordOpen(true)}>
          <Microphone size={u(22)} color={canSend ? tokens.text : tokens.faint} />
        </IconButton>
      ) : (
        <View style={styles.navSpacer} />
      )}
    </View>
  );
  return (
    <ChatShell title="비서" nav={nav} bottom={<Composer disabled={!canSend} placeholder="비서에게 맡길 일" onSend={onSend} />}>
      <AppMenu visible={menuOpen} onClose={() => setMenuOpen(false)} title={menu.title} sub={menu.sub} items={menu.items} footer={menu.footer} />
      {onTranscript && <RecordSheet visible={recordOpen} onClose={() => setRecordOpen(false)} onTranscript={onTranscript} />}
      {empty && (
        <View style={styles.hero}>
          <AgentAvatar size={uc(64)} state={starting ? 'thinking' : 'idle'} />
          {sent && <AgentStatus working={starting} check={sent.check} onCheck={sent.onCheck} />}
          <Txt variant="chatTitle" style={styles.heroTitle} accessibilityRole="header">
            무엇을 맡길까요?
          </Txt>
        </View>
      )}
      {empty && canSend && (
        <View style={styles.starters}>
          {STARTERS.map((t) => (
            <Press key={t} label={t} onPress={() => onSend(t)} style={styles.chip}>
              <Txt variant="chatLabel">{t}</Txt>
            </Press>
          ))}
        </View>
      )}
      {empty && <BriefCard brief={brief} />}

      {messages.map((m, i) => (
        <Fragment key={m.id}>
          {m.role === 'user' ? <UserMessage text={m.text} /> : <AgentText>{m.text}</AgentText>}
          {m.role === 'agent' && cardsAt(i).map((a) => <RunCard key={a.key} card={a} busy={undoing === a.runId} onUndo={onUndo} />)}
          {m.role === 'agent' && findsAt(i).map((a) => <LookupCard key={a.key} card={a} initial={lookupPreview} />)}
        </Fragment>
      ))}

      {thinking && <TypingBubble label={streaming!.step} />}
      {streaming?.text ? <AgentText>{streaming.text}</AgentText> : null}
      {!streaming && tail.map((a) => <RunCard key={a.key} card={a} busy={undoing === a.runId} onUndo={onUndo} />)}
      {!streaming && findTail.map((a) => <LookupCard key={a.key} card={a} initial={lookupPreview} />)}

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
        <Txt variant="chatLabel" style={{ fontFamily: fonts.bold, flex: 1 }} accessibilityRole="header">
          오늘
        </Txt>
        <Txt variant="chatCaption" color={tokens.muted}>
          {md(brief.date)}
        </Txt>
      </View>
      {today.length ? (
        today.map((x, i) => (
          <View key={`t${i}`} style={[styles.row, i > 0 && styles.line]}>
            <Txt variant="chatCaption" color={tokens.muted} tabular style={styles.time}>
              {x.time ?? '종일'}
            </Txt>
            <View style={{ flex: 1, gap: uc(2) }}>
              <Txt variant="chatSmall" style={{ fontFamily: fonts.semibold }} numberOfLines={2}>
                {x.title}
              </Txt>
              {!!x.sub && (
                <Txt variant="chatCaption" color={tokens.muted} numberOfLines={2}>
                  {x.sub}
                </Txt>
              )}
            </View>
            {x.overdue && (
              <Txt variant="chatCaption" color={tokens.danger} style={{ fontFamily: fonts.semibold }}>
                기한 지남
              </Txt>
            )}
          </View>
        ))
      ) : (
        <Txt variant="chatSmall" color={tokens.muted}>
          오늘 할 일 없음
        </Txt>
      )}
      {need.length > 0 && (
        <>
          <Txt variant="chatCaption" color={tokens.muted} style={styles.sub}>
            손이 필요한 안건
          </Txt>
          {need.map((x, i) => (
            <View key={x.dealId} style={[styles.row, i > 0 && styles.line]}>
              <View style={{ flex: 1, gap: uc(2) }}>
                <Txt variant="chatSmall" style={{ fontFamily: fonts.semibold }} numberOfLines={1}>
                  {x.title}
                </Txt>
                <Txt variant="chatCaption" color={tokens.muted} numberOfLines={1}>
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
  nav: { flexDirection: 'row', alignItems: 'center', height: u(50), paddingHorizontal: u(6) },
  navMid: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navSpacer: { width: u(44) },
  hero: { alignItems: 'center', gap: uc(10), paddingTop: uc(10), paddingBottom: uc(4) },
  heroTitle: { textAlign: 'center' },
  card: { backgroundColor: tokens.surface, borderRadius: uc(18), borderWidth: 1, borderColor: tokens.border, paddingHorizontal: uc(14), paddingVertical: uc(10), gap: uc(2) },
  head: { flexDirection: 'row', alignItems: 'center', paddingBottom: uc(6) },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: uc(10), paddingVertical: uc(10) },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  time: { width: uc(40), paddingTop: uc(2) },
  sub: { marginTop: uc(8), fontFamily: fonts.semibold },
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: uc(8), justifyContent: 'center' },
  undo: { minHeight: uc(36), paddingHorizontal: uc(10), justifyContent: 'center' },
  chip: { height: uc(34), paddingHorizontal: uc(14), borderRadius: radius.pill, backgroundColor: tokens.sunken, alignItems: 'center', justifyContent: 'center' },
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
