// 서버와 연결된 대화 화면. 답은 흐르는 대로 보이고, 질문 카드·요약·보내기 전 승인 카드가 이어진다.
// 보내기는 사람이 승인 카드에서 누를 때만 일어난다. 에이전트는 보내지 못한다.
import { amountBlock, computeTotals, formatWonShort, SHEET_LABELS, type QuoteLine, type RequestSheet, type SheetField } from '@danchuai/core';
import { ArrowClockwise, CheckCircle, WarningCircle } from 'phosphor-react-native';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { ApprovalCard, type Recipient } from '@/components/chat/ApprovalCard';
import { ChatShell } from '@/components/chat/ChatShell';
import { DraftCard, DraftLine } from '@/components/chat/DraftCard';
import { Composer } from '@/components/chat/Composer';
import { AgentText, StepLog, UserMessage } from '@/components/chat/Messages';
import { QuestionCard } from '@/components/chat/QuestionCard';
import { DanchuApprovalCard } from '@/components/request/DanchuApprovalCard';
import { LabPicker } from '@/components/request/LabPicker';
import { Button } from '@/components/ui/Button';
import { ResultBlock } from '@/components/ui/ResultBlock';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { useAgentChat } from '@/hooks/useAgentChat';
import { approveAndSend, approveDanchuAction, createOutbound, draftDanchuAction, readDanchu, type AgentRole, type DanchuActionDraft, type OutboundDraftView } from '@/lib/agentClient';
import { buildPayload, checkBody, fillFromChat, type RequestCheckView, type RequestSchemaView, type SendChoices } from '@/lib/danchuRequest';
import { shortDate, subjName } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { lineEnter } from '@/lib/motion';
import { useAgentName, useAuth } from '@/lib/session';
import type { AgentQuestion, ChatErrorCode } from '@/lib/chat';

export const ERROR_LABEL: Record<ChatErrorCode, string> = {
  agent_unavailable: '아직 비서를 연결하는 중이에요',
  turn_limit: '이 대화가 길어졌어요. 새 대화에서 이어 가 주세요',
  turn_in_progress: '앞 질문에 먼저 답하고 있어요',
  refused: '이 요청에는 제가 답할 수 없어요',
  truncated: '답이 길어서 중간에 끊겼어요. 다시 답해 볼까요?',
  provider_error: '답을 드리지 못했어요. 한 번 더 물어봐 주세요',
  network: '연결이 잠깐 끊겼어요',
  unauthorized: '다시 로그인해 주세요',
  quote_unavailable: '지금은 이 요청의 견적을 쓸 수 없어요',
  undo_unavailable: '되돌릴 수 없어요',
  usage_limit: '이번 달 쓸 수 있는 만큼 다 썼어요',
  ai_quota: '지금은 답을 드릴 수 없어요. 조금 뒤에 다시 물어봐 주세요',
};
export const RETRYABLE: readonly ChatErrorCode[] = ['provider_error', 'network', 'truncated', 'turn_in_progress', 'agent_unavailable'];

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
  /** 의뢰자: 질문하기에서 넘어올 때 대화를 열자마자 보낼 첫 글 */
  seed?: string;
}

type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; sent: number; unknown: number; rfqNo?: string }
  | { kind: 'error' }
  /** 단추가 거절했다(사유 문장은 단추가 준 그대로) */
  | { kind: 'failed'; message: string };

export function LiveChat({ role, title, requestId, conversationId, recipients: given = [], quoteLines = [], durationWeeks, requestMessage, onEditQuote, onSent, seed }: Props) {
  const { state, send, retry } = useAgentChat(role, requestId, conversationId);
  // 첫 글은 새 대화가 열린 뒤 한 번만 보낸다.
  const seeded = useRef(false);
  useEffect(() => {
    if (!seed || seeded.current || !state.conversationId || state.status !== 'idle' || state.messages.length) return;
    seeded.current = true;
    void send(seed);
  }, [seed, send, state.conversationId, state.status, state.messages.length]);
  // 이어 쓰는 대화는 요청서에서 제목을 만든다(서버 목록과 같은 규칙).
  const heading = conversationId && state.sheet ? sheetTitle(state.sheet) ?? title : title;
  const reduced = useReducedMotion();
  // 화면을 연 뒤 새로 붙은 말만 올라오며 나타난다(이어 쓰는 대화의 지난 말은 그대로)
  const [opened, setOpened] = useState<number | null>(null);
  if (opened === null && state.status === 'idle') setOpened(state.messages.length);
  const isFresh = (i: number) => opened !== null && i >= opened;
  const [reviewing, setReviewing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>(given);
  const [out, setOut] = useState<SendState>({ kind: 'idle' });
  // 만든 보내기 초안. 보내기가 중간에 실패하면 같은 초안으로 다시 보낸다(새로 만들지 않는다).
  const made = useRef<{ version: number; requestId: string | null; drafts: OutboundDraftView[]; sent: Set<string> } | null>(null);
  const [sentRequestId, setSentRequestId] = useState<string | null>(null);
  const busy = state.status !== 'idle';
  // 질문 카드는 입력창 자리에 뜬다(시안 B). 답을 기다리는 동안·승인 카드가 뜬 동안은 숨긴다.
  const asking = state.question && !busy && state.conversationId ? state.question : null;
  // 단추 연동 모드의 의뢰자: 받는 기관을 고르지 않고 단추 요청서로 보낸다(연동 4단계)
  const { danchu } = useAuth();
  const agentName = useAgentName();
  const viaDanchu = danchu && role === 'requester';
  const [choices, setChoices] = useState<SendChoices | null>(null);
  // 단추 요청서 양식(request_schema). undefined 는 아직 안 읽음, null 은 못 읽음(분야만 보낸다)
  const [schema, setSchema] = useState<RequestSchemaView | null | undefined>(undefined);
  const [issue, setIssue] = useState<string | null>(null);
  const loadSchema = () => readDanchu<RequestSchemaView>('request_schema', {}, undefined, 'requester').catch(() => null);
  const danchuMade = useRef<{ key: string; d: DanchuActionDraft } | null>(null);
  const draft = state.draft;
  const outBody = draft && role === 'cro' && quoteLines.length ? `${draft.body}\n\n${amountBlock(quoteLines)}` : draft?.body ?? '';

  const approveDanchu = async (c: SendChoices) => {
    if (!draft || !state.sheet) return;
    setChoices(c);
    setIssue(null);
    const payload = buildPayload(state.sheet, draft.body, c, schema);
    setOut({ kind: 'sending' });
    try {
      // 보내기 전에 단추가 접수와 같은 규칙으로 검사한다. 걸리면 카드에 남아 그 칸을 고친다
      if (schema) {
        const chk = await readDanchu<RequestCheckView>('request_check', checkBody(payload), undefined, 'requester').catch(() => null);
        if (chk?.outdated) {
          setSchema(await loadSchema());
          setIssue('그사이 요청서 양식이 바뀌었어요. 한 번만 다시 봐 주세요');
          setOut({ kind: 'idle' });
          return;
        }
        if (chk && !chk.ok) {
          const first = chk.issues[0];
          haptic.error();
          setIssue(first?.message ?? (first ? `${first.label} 확인 필요` : '요청서 확인 필요'));
          setOut({ kind: 'idle' });
          return;
        }
      }
      // 같은 본문이면 만든 초안을 다시 쓴다(승인 한 건에 실행 한 번은 서버가 지킨다)
      const key = JSON.stringify(payload);
      // 대화 id 를 함께 넘겨 접수 뒤 서버가 이 대화를 끝난 것으로 표시한다(요청함에 "작성 중"으로 남지 않게)
      if (danchuMade.current?.key !== key) danchuMade.current = { key, d: await draftDanchuAction('requester', 'create', payload, undefined, state.conversationId ?? undefined) };
      const r = await approveDanchuAction('requester', danchuMade.current.d);
      danchuMade.current = null;
      if (r.status === 'failed') {
        haptic.error();
        setOut({ kind: 'failed', message: typeof r.result?.error === 'string' ? r.result.error : '단추가 받지 않았어요. 확인하고 다시 보내 주세요' });
        setReviewing(false);
        return;
      }
      const rfqNo = typeof r.result?.rfqNo === 'string' ? r.result.rfqNo : undefined;
      if (r.status === 'sent') haptic.success();
      setOut({ kind: 'done', sent: r.status === 'sent' ? 1 : 0, unknown: r.status === 'sent' ? 0 : 1, rfqNo });
      setSentRequestId(rfqNo ?? null);
      setReviewing(false);
      if (r.status === 'sent') onSent?.();
    } catch {
      haptic.error();
      setOut({ kind: 'error' });
    }
  };

  const approve = async () => {
    if (viaDanchu) return choices ? approveDanchu(choices) : undefined;
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
    if (viaDanchu) {
      // 에이전트가 대화에서 채운 값으로 시작한다. 사람은 빈 값만 정한다.
      // 단추 양식을 한 번 읽어 분야 칸(시험 종류·동물종·군 구성)까지 채운다
      const sheet = state.sheet;
      void (async () => {
        const sc = schema === undefined ? await loadSchema() : schema;
        if (schema === undefined) setSchema(sc);
        if (!choices && sheet) setChoices(fillFromChat(sheet, state.messages.filter((m) => m.role === 'user').map((m) => m.text), sc));
        setReviewing(true);
      })();
      return;
    }
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

  // 확인 카드는 대화 안 맨 아래에 놓인다(시안 m03). 입력창 자리는 그대로 둔다
  const card =
    reviewing && draft && viaDanchu && state.sheet && choices ? (
      <DanchuApprovalCard
        sheet={state.sheet}
        body={draft.body}
        choices={choices}
        onChange={(next) => {
          setIssue(null);
          setChoices(next);
        }}
        schema={schema}
        issue={issue}
        sending={out.kind === 'sending'}
        onClose={() => setReviewing(false)}
        onApprove={(c) => void approveDanchu(c)}
      />
    ) : reviewing && draft ? (
      <ApprovalCard
        title={role === 'cro' ? `${subjName(agentName)} 의뢰자에게 견적 회신을 보내려고 해요` : `${subjName(agentName)} 기관에 견적 요청을 보내려고 해요`}
        recipients={role === 'cro' ? [{ id: 'requester', name: '의뢰자' }] : recipients}
        body={outBody}
        attachment={role === 'cro' ? '견적서 1건' : '요청서 1건'}
        hideRequester={role === 'requester'}
        guardPassed={out.kind !== 'sending'}
        onEdit={() => setReviewing(false)}
        onApprove={approve}
      />
    ) : null;
  const bottom = asking && !card ? (
      <QuestionCard
        key={`${asking.field}-${state.messages.length}`}
        question={asking}
        field={labelOf(asking.field)}
        left={questionLeft(asking, state.sheet, state.missing)}
        onAnswer={(v) => void send(`${labelOf(asking.field)}: ${v}`)}
      />
    ) : (
      <Composer disabled={busy || !state.conversationId || !!card} onSend={(t) => void send(t)} />
    );

  return (
    <ChatShell title={heading} bottom={bottom} flushBottom={Boolean(asking) && !card}>
      {role === 'cro' && state.sheet && <SheetCard sheet={state.sheet} message={requestMessage} />}
      {role === 'requester' && !state.messages.length && state.status !== 'starting' && !state.error && (
        <AgentText>어떤 시험 견적을 받아 드릴까요?</AgentText>
      )}
      {role === 'cro' && !state.messages.length && !draft && !quoteLines.length && state.status === 'idle' && !state.error && (
        <AgentText>견적 금액부터 넣을까요?</AgentText>
      )}
      {state.status === 'starting' && <StepLog steps={[{ label: '대화를 여는 중이에요', state: 'now' }]} />}

      {state.messages.map((m, i) => (m.role === 'user' ? <UserMessage key={m.id} text={m.text} fresh={isFresh(i)} /> : <AgentText key={m.id}>{m.text}</AgentText>))}

      {state.status === 'streaming' && (
        <View>
          <StepLog steps={[{ label: state.step ?? '생각하는 중', state: 'now' }]} />
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
              <Button title="고치기" kind="text" onPress={onEditQuote} />
            </View>
          )}
          <View style={styles.next}>
            {!quoteLines.length && <Button title="견적 금액 넣기" flex={1} onPress={onEditQuote} />}
            <Button title="회신 초안 만들기" kind={quoteLines.length ? 'ink' : 'soft'} flex={1} onPress={() => void send('회신 초안을 써 주세요.')} />
          </View>
        </View>
      )}

      {canReview && !reviewing && (
        <DraftCard
          title={role === 'cro' ? '회신 초안' : '요청 본문 초안'}
          body={draft!.body}
          dropped={draft!.dropped}
          action={viaDanchu || role === 'requester' ? (!viaDanchu && !recipients.length ? '받는 기관 고르기' : '요청서 확인') : needsQuote ? '견적 금액 넣기' : '회신 확인'}
          onAction={openReview}
        >
          {role === 'requester' && !viaDanchu && (
            <DraftLine k="받는 기관" v={recipients.length ? recipients.map((r) => r.name).join(', ') : '선택 전'} right={recipients.length > 0 ? <Button title="바꾸기" kind="text" onPress={() => setPicking(true)} /> : undefined} />
          )}
          {role === 'cro' && quoteLines.length > 0 && (
            <DraftLine
              k="견적 총액"
              bold
              v={`${formatWonShort(computeTotals(quoteLines).totalWithVatWon)}${durationWeeks ? `, ${durationWeeks}주` : ''}`}
              right={<Button title="고치기" kind="text" onPress={onEditQuote} />}
            />
          )}
        </DraftCard>
      )}

      {out.kind === 'done' &&
        (out.unknown ? (
          <Animated.View entering={lineEnter(0, reduced)} style={styles.row} accessibilityLiveRegion="polite">
            <CheckCircle size={u(16)} weight="fill" color={tokens.wait} />
            <Txt variant="caption" color={tokens.wait} style={{ fontFamily: fonts.semibold, flex: 1 }}>
              {viaDanchu ? '접수 결과를 확인해 주세요' : `${out.sent}곳에 보냈어요. ${out.unknown}곳은 결과를 확인해 주세요`}
            </Txt>
          </Animated.View>
        ) : (
          <ResultBlock
            title={viaDanchu ? '다 됐어요. 단추에 요청을 보냈어요' : role === 'cro' ? '다 됐어요. 회신을 보냈어요' : `${out.sent}곳에 보냈어요`}
            meta={viaDanchu ? out.rfqNo : undefined}
            rows={viaDanchu && choices?.replyBy ? [['회신 기한', shortDate(choices.replyBy)]] : undefined}
            action={
              role === 'requester' && sentRequestId ? (
                <Button title="진행 상황 보기" tall onPress={() => router.replace({ pathname: '/requester/[id]', params: { id: sentRequestId } })} />
              ) : undefined
            }
          />
        ))}
      {state.draftSent && out.kind !== 'done' && (
        <View style={styles.row}>
          <CheckCircle size={u(16)} weight="fill" color={tokens.accent} />
          <Txt variant="caption" color={tokens.accent} style={{ fontFamily: fonts.semibold, flex: 1 }}>
            보낸 본문
          </Txt>
        </View>
      )}
      {out.kind === 'error' && <ErrorLine label="보내지 못했어요. 한 번 더 해 볼까요?" onRetry={() => void approve()} />}
      {out.kind === 'failed' && <ErrorLine label={out.message} onRetry={() => setReviewing(true)} />}

      {card}
      {state.error && <ErrorLine label={ERROR_LABEL[state.error]} onRetry={RETRYABLE.includes(state.error) ? retry : undefined} />}
    </ChatShell>
  );
}

const sheetTitle = (s: Record<string, string | null>) => [s.species, s.duration, s.testType].filter(Boolean).join(' ') || null;

const labelOf = (f: string) => SHEET_LABELS[f as SheetField] ?? f;

/** 질문 카드 위 오른쪽: 다시 묻는 칸은 지금 값, 아니면 남은 필수 칸 수 */
export function questionLeft(q: AgentQuestion, sheet: RequestSheet | null, missing: string[]): string | null {
  if (q.recheck) {
    const now = sheet?.[q.field as SheetField];
    return now ? `지금 ${now.length > 14 ? `${now.slice(0, 13)}…` : now}` : null;
  }
  return missing.length ? `필수 ${missing.length}칸 남음` : null;
}

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

export function ErrorLine({ label, onRetry }: { label: string; onRetry?: () => void }) {
  return (
    <View style={styles.row} accessibilityRole="alert">
      <WarningCircle size={u(16)} weight="fill" color={tokens.danger} />
      <Txt variant="caption" color={tokens.danger} style={{ fontFamily: fonts.semibold, flex: 1 }}>
        {label}
      </Txt>
      {onRetry && <Button title="다시 시도" kind="soft" icon={<ArrowClockwise size={u(14)} color={tokens.text} />} onPress={onRetry} />}
    </View>
  );
}

const styles = StyleSheet.create({
  next: { flexDirection: 'row', gap: space.sm },
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, padding: space.lg, gap: u(6) },
  act: { marginTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: u(8) },
  msg: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: tokens.border },
  to: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: tokens.border, minHeight: u(44) },
});
