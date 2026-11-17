// 가이드라인 질문하기. 요청과 따로 여는 대화로, 답마다 인용한 원문(근거)을 붙인다.
// 의뢰자는 답을 본 뒤 같은 질문으로 견적 요청 대화를 바로 열 수 있다. 보내기는 여기서 일어나지 않는다.
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowSquareOut, BookOpenText, CaretRight, ClockCounterClockwise } from 'phosphor-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ChatShell } from '@/components/chat/ChatShell';
import { Composer } from '@/components/chat/Composer';
import { StepLog, UserMessage } from '@/components/chat/Messages';
import { Button } from '@/components/ui/Button';
import { Press } from '@/components/ui/Press';
import { Sheet, SheetBody } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { useAgentChat } from '@/hooks/useAgentChat';
import { useRemote } from '@/hooks/useRemote';
import { listAsks, type AgentRole } from '@/lib/agentClient';
import { dayLabel } from '@/lib/format';
import type { SourceRef } from '@/lib/chat';

import { ERROR_LABEL, ErrorLine, RETRYABLE } from './LiveChat';

/** 검색 정확도 확인 세트에서 고른 질문(원문 근거가 있는 것) */
const SUGGESTIONS: Record<AgentRole, string[]> = {
  requester: [
    '임상 1상 전에 반복투여독성은 몇 주 해야 해요?',
    '유전독성 표준 시험 조합이 뭐예요?',
    '항체 의약품도 유전독성시험이 필요해요?',
    '건강기능식품 기능성 원료 인정에 필요한 안전성 자료',
  ],
  cro: [
    '반복투여독성시험 군당 동물 수 기준',
    '바이오의약품 독성시험 동물종 선정 기준',
    '독성동태 채혈은 몇 마리에서 해요?',
    '생체시료 분석법 밸리데이션 정확도 기준',
  ],
};

export function AskChat({ role, conversationId, seed }: { role: AgentRole; conversationId?: string; seed?: string }) {
  const { state, send, retry } = useAgentChat(role, undefined, conversationId, 'ask');
  // 요청함 입력창에서 넘어온 첫 질문은 대화가 열린 뒤 한 번만 보낸다.
  const seeded = useRef(false);
  useEffect(() => {
    if (!seed || seeded.current || !state.conversationId || state.status !== 'idle' || state.messages.length) return;
    seeded.current = true;
    void send(seed);
  }, [seed, send, state.conversationId, state.status, state.messages.length]);
  // 화면을 연 뒤 새로 붙은 말만 올라오며 나타난다(지난 대화는 그대로)
  const [opened, setOpened] = useState<number | null>(null);
  if (opened === null && state.status === 'idle') setOpened(state.messages.length);
  // 새 질문 화면에서만 지난 질문을 읽는다
  const { state: past } = useRemote(useCallback(() => listAsks(role), [role]), !conversationId);
  const [open, setOpen] = useState<SourceRef[] | null>(null);
  const busy = state.status !== 'idle';
  const lastAgent = [...state.messages].reverse().find((m) => m.role === 'agent');
  const lastQuestion = [...state.messages].reverse().find((m) => m.role === 'user')?.text;

  return (
    <ChatShell title="질문하기" bottom={<Composer placeholder="질문" disabled={busy || !state.conversationId} onSend={(t) => void send(t)} />}>
      {!state.messages.length && state.status === 'idle' && !state.error && !seed && (
        <View>
          <Txt variant="heading" accessibilityRole="header" style={styles.ask}>
            무엇이 궁금해요?
          </Txt>
          <View style={styles.sugs}>
            {SUGGESTIONS[role].map((q, i) => (
              <Press key={q} label={q} disabled={!state.conversationId} onPress={() => void send(q)} style={[styles.sug, i > 0 && styles.line]}>
                <Txt variant="body" style={{ flex: 1 }}>
                  {q}
                </Txt>
                <CaretRight size={u(16)} color={tokens.muted} />
              </Press>
            ))}
          </View>
          {past.kind === 'ready' && past.data.length > 0 && (
            <>
              <Txt variant="label" accessibilityRole="header" style={styles.pastHead}>
                지난 질문
              </Txt>
              <View>
                {past.data.slice(0, 10).map((a, i) => (
                  <Press
                    key={a.id}
                    label={a.title}
                    onPress={() => router.push({ pathname: '/ask', params: { role, conv: a.id } })}
                    style={[styles.past, i > 0 && styles.line]}
                  >
                    <ClockCounterClockwise size={u(18)} color={tokens.muted} />
                    <Txt variant="small" numberOfLines={1} style={{ flex: 1 }}>
                      {a.title}
                    </Txt>
                    <Txt variant="caption" color={tokens.faint} tabular>
                      {dayLabel(a.updatedAt)}
                    </Txt>
                  </Press>
                ))}
              </View>
            </>
          )}
        </View>
      )}
      {state.status === 'starting' && <StepLog steps={[{ label: '대화 여는 중', state: 'now' }]} />}

      {state.messages.map((m, i) =>
        m.role === 'user' ? (
          <UserMessage key={m.id} text={m.text} fresh={opened !== null && i >= opened} />
        ) : (
          <View key={m.id} style={{ gap: space.md }}>
            <Answer text={m.text} />
            {m.sources?.length ? <SourcesPill sources={m.sources} onPress={() => setOpen(m.sources!)} /> : null}
            {role === 'requester' && m === lastAgent && !busy && lastQuestion && (
              <View style={styles.next}>
                <Button
                  title="이 시험 견적 요청하기"
                  kind="soft"
                  onPress={() =>
                    router.push({ pathname: '/requester/[id]', params: { id: 'new', seed: `${lastQuestion}\n이 시험 견적을 요청하고 싶어요.` } })
                  }
                />
              </View>
            )}
          </View>
        ),
      )}

      {state.status === 'streaming' && (
        <View>
          <StepLog steps={[{ label: state.step ?? '원문 찾는 중', state: 'now' }]} />
          {state.streaming ? <Answer text={state.streaming} /> : null}
        </View>
      )}

      {state.error && <ErrorLine label={ERROR_LABEL[state.error]} onRetry={RETRYABLE.includes(state.error) ? retry : undefined} />}

      <SourcesSheet sources={open} onClose={() => setOpen(null)} />
    </ChatShell>
  );
}

/** 답 본문. "(근거: 문서 조항)"은 본문보다 작고 옅게 보인다. */
function Answer({ text }: { text: string }) {
  const parts = text.split(/(\(근거:[^)]*\))/g).filter(Boolean);
  return (
    <Txt variant="agent">
      {parts.map((p, i) =>
        p.startsWith('(근거:') ? (
          <Txt key={i} variant="caption" color={tokens.muted}>
            {p}
          </Txt>
        ) : (
          p
        ),
      )}
    </Txt>
  );
}

/** 답 아래 근거 묶음. 누르면 원문 목록이 열린다. */
function SourcesPill({ sources, onPress }: { sources: SourceRef[]; onPress: () => void }) {
  const names = sources.map((s) => s.doc).join(' · ');
  return (
    <Press label={`근거 ${sources.length}건, ${names}`} onPress={onPress} style={styles.pill}>
      <BookOpenText size={u(16)} color={tokens.muted} />
      <Txt variant="caption" tabular style={{ fontFamily: fonts.semibold }}>
        {`근거 ${sources.length}건`}
      </Txt>
      <Txt variant="caption" color={tokens.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
        {names}
      </Txt>
    </Press>
  );
}

function SourcesSheet({ sources, onClose }: { sources: SourceRef[] | null; onClose: () => void }) {
  // 닫히는 동안에도 마지막 목록을 그대로 보여 준다.
  const [last, setLast] = useState<SourceRef[] | null>(sources);
  if (sources && sources !== last) setLast(sources);
  const shown = sources ?? last;
  return (
    <Sheet visible={!!sources} onClose={onClose}>
      {/* 할 일이 읽기뿐이라 주 버튼 없이 글자 닫기만 */}
      <SheetBody title={`근거 ${(shown ?? []).length}건`} onClose={onClose}>
        <ScrollView style={{ maxHeight: u(420) }}>
          {(shown ?? []).map((s, i) => (
            <Press
              key={`${s.doc}-${s.section}`}
              label={`${s.doc} ${s.section}${s.url ? ', 원문 열기' : ''}`}
              disabled={!s.url}
              onPress={s.url ? () => void WebBrowser.openBrowserAsync(s.url!) : undefined}
              style={[styles.src, i > 0 && styles.line]}
            >
              <View style={{ flex: 1, gap: u(2) }}>
                <Txt variant="label">{s.doc}</Txt>
                <Txt variant="caption" color={tokens.muted} numberOfLines={2}>
                  {[s.section, s.name, s.version].filter(Boolean).join(', ')}
                </Txt>
              </View>
              {s.url && <ArrowSquareOut size={u(18)} color={tokens.muted} />}
            </Press>
          ))}
        </ScrollView>
      </SheetBody>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  ask: { marginTop: space.lg, marginBottom: space.md },
  sugs: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border },
  sug: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: u(56), paddingHorizontal: space.lg, paddingVertical: space.md },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  pastHead: { marginTop: space.xxl, marginBottom: space.xs, color: tokens.muted },
  past: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: u(48), paddingVertical: space.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: u(6),
    alignSelf: 'flex-start',
    maxWidth: '100%',
    height: u(36),
    paddingHorizontal: u(14),
    borderRadius: radius.pill,
    backgroundColor: tokens.surface,
    borderWidth: 1,
    borderColor: tokens.border,
  },
  next: { flexDirection: 'row' },
  src: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: u(60), paddingVertical: space.md },
});
