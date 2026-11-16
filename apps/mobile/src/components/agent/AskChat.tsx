// 가이드라인 질문하기. 요청과 따로 여는 대화로, 답마다 인용한 원문(근거)을 붙인다.
// 의뢰자는 답을 본 뒤 같은 질문으로 견적 요청 대화를 바로 열 수 있다. 보내기는 여기서 일어나지 않는다.
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowSquareOut, BookOpenText, CaretRight, ChatCircle } from 'phosphor-react-native';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatShell } from '@/components/chat/ChatShell';
import { Composer } from '@/components/chat/Composer';
import { StepLog, UserMessage } from '@/components/chat/Messages';
import { Button } from '@/components/ui/Button';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { useAgentChat } from '@/hooks/useAgentChat';
import type { AgentRole } from '@/lib/agentClient';
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

export function AskChat({ role }: { role: AgentRole }) {
  const { state, send, retry } = useAgentChat(role, undefined, undefined, 'ask');
  const [open, setOpen] = useState<SourceRef[] | null>(null);
  const busy = state.status !== 'idle';
  const lastAgent = [...state.messages].reverse().find((m) => m.role === 'agent');
  const lastQuestion = [...state.messages].reverse().find((m) => m.role === 'user')?.text;

  return (
    <ChatShell title="질문하기" bottom={<Composer placeholder="질문" disabled={busy || !state.conversationId} onSend={(t) => void send(t)} />}>
      {!state.messages.length && state.status === 'idle' && !state.error && (
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
                <CaretRight size={16} color={tokens.muted} />
              </Press>
            ))}
          </View>
        </View>
      )}
      {state.status === 'starting' && <StepLog steps={[{ label: '대화 여는 중', state: 'now' }]} />}

      {state.messages.map((m) =>
        m.role === 'user' ? (
          <UserMessage key={m.id} text={m.text} />
        ) : (
          <View key={m.id} style={{ gap: space.md }}>
            <Answer text={m.text} />
            {m.sources?.length ? <SourcesPill sources={m.sources} onPress={() => setOpen(m.sources!)} /> : null}
            {role === 'requester' && m === lastAgent && !busy && lastQuestion && (
              <View style={styles.next}>
                <Button
                  title="견적 요청"
                  kind="line"
                  icon={<ChatCircle size={16} color={tokens.text} />}
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
          <StepLog steps={[{ label: state.step ?? '원문 찾기', state: 'now' }]} />
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
      <BookOpenText size={16} color={tokens.muted} />
      <Txt variant="caption" style={{ fontFamily: fonts.semibold }}>
        {`근거 ${sources.length}`}
      </Txt>
      <Txt variant="caption" color={tokens.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
        {names}
      </Txt>
    </Press>
  );
}

function SourcesSheet({ sources, onClose }: { sources: SourceRef[] | null; onClose: () => void }) {
  return (
    <Modal visible={!!sources} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.dim}>
        <Press label="닫기" onPress={onClose} style={StyleSheet.absoluteFill} accessibilityRole="none" />
        <SafeAreaView edges={['bottom']} style={styles.sheetWrap}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.grab} />
            <Txt variant="heading" accessibilityRole="header">
              근거 원문
            </Txt>
            <ScrollView style={{ maxHeight: 420, marginTop: space.md }}>
              {(sources ?? []).map((s, i) => (
                <Press
                  key={`${s.doc}-${s.section}`}
                  label={`${s.doc} ${s.section}${s.url ? ', 원문 열기' : ''}`}
                  disabled={!s.url}
                  onPress={s.url ? () => void WebBrowser.openBrowserAsync(s.url!) : undefined}
                  style={[styles.src, i > 0 && styles.line]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt variant="label">{s.section ? `${s.doc}  ${s.section}` : s.doc}</Txt>
                    <Txt variant="caption" color={tokens.muted} numberOfLines={2}>
                      {[s.name, s.version].filter(Boolean).join(', ')}
                    </Txt>
                  </View>
                  {s.url && <ArrowSquareOut size={18} color={tokens.muted} />}
                </Press>
              ))}
            </ScrollView>
            <View style={{ marginTop: space.lg }}>
              <Button title="닫기" kind="line" tall onPress={onClose} />
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ask: { marginTop: space.lg, marginBottom: space.md },
  sugs: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border },
  sug: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.lg, paddingVertical: space.md },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: tokens.surface,
    borderWidth: 1,
    borderColor: tokens.border,
  },
  next: { flexDirection: 'row' },
  dim: { flex: 1, backgroundColor: 'rgba(30, 31, 34, 0.38)', justifyContent: 'flex-end' },
  sheetWrap: { paddingHorizontal: space.sm, paddingBottom: space.sm },
  sheet: { backgroundColor: tokens.surface, borderRadius: 32, paddingTop: 10, paddingHorizontal: space.xl, paddingBottom: 22 },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: tokens.border, alignSelf: 'center', marginBottom: 18 },
  src: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingVertical: space.md },
});
