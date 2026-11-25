// 의뢰자 대화 탭(Muse 시안 2026-11-25, 기관 비서와 같은 틀). 열자마자 "어떤 시험이 필요해요?"로 대화를 시작한다.
// 위 막대에 비서 캐릭터·이름·상태, 왼쪽 서랍에 탭·따로 하는 대화. 첫 글을 보내면 새 요청 대화가 그 글로 열린다(대화는 첫 글을 보낼 때 만든다).
// 아래에 최근 요청 세 건(서버 목록 순서 그대로)을 둔다.
import { router, type Href } from 'expo-router';
import { CaretRight } from 'phosphor-react-native';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorLine } from '@/components/agent/LiveChat';
import { ChatShell } from '@/components/chat/ChatShell';
import { Composer } from '@/components/chat/Composer';
import { STATUS_CHIP } from '@/components/inbox/InboxScreen';
import type { ChipTone } from '@/components/ui/Chip';
import { AgentHeader } from '@/components/shell/AgentHeader';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, tokens, uc } from '@/constants/theme';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { agentConfigured } from '@/lib/agentClient';
import { requesterItem, type InboxItem } from '@/lib/inbox';
import { fetchRequests } from '@/lib/marketClient';
import { useAuth } from '@/lib/session';

/** 빈 화면에서 바로 고르는 말. seed 가 있으면 그 글로 새 요청 대화를 연다, 없으면 질문하기 */
const STARTERS = [
  { label: '독성시험 견적', seed: '독성시험 견적이 필요해요' },
  { label: '효력시험 견적', seed: '효력시험 견적이 필요해요' },
  { label: '가이드라인 질문', seed: null },
] as const;

const RECENT = 3;
/** 요청함 상태 칩과 같은 색(회신 도착·승인 대기는 호박, 선정은 청록) */
const TONE: Record<ChipTone, string> = { wait: tokens.wait, accent: tokens.accent, mute: tokens.muted };

/** 보낸 요청은 진행 화면, 아직 안 보낸 대화는 이어서 쓰기(요청함과 같은 규칙) */
export const requesterHref = (id: string): Href =>
  id.startsWith('c:') ? { pathname: '/requester/[id]', params: { id: 'new', conv: id.slice(2) } } : { pathname: '/requester/[id]', params: { id } };

const startRequest = (seed: string) => router.push({ pathname: '/requester/[id]', params: { id: 'new', seed: seed.slice(0, 1000) } });
const openAsk = () => router.push({ pathname: '/ask', params: { role: 'requester' } });

export function RequesterHome() {
  const { status } = useAuth();
  const live = agentConfigured();
  const { state, reload } = useRemote(fetchRequests, live && (status === 'ready' || status === 'disabled'));
  const items = useMemo(() => (state.kind === 'ready' ? state.data.map((r) => requesterItem(r)) : []), [state]);
  const recent: RecentState = !live ? { kind: 'error', label: '서버 연결 전이에요' } : state.kind === 'ready' ? { kind: 'ready', items } : state.kind === 'error' ? { kind: 'error', label: REMOTE_ERROR[state.code] } : { kind: 'loading' };
  return (
    <RequesterHomeView
      recent={recent}
      onRetry={() => void reload()}
      onStart={startRequest}
      onAsk={openAsk}
      onOpen={(it) => router.push(requesterHref(it.id))}
      onAll={() => router.navigate('/todo' as Href)}
    />
  );
}

export type RecentState = { kind: 'loading' } | { kind: 'error'; label: string } | { kind: 'ready'; items: InboxItem[] };

export interface RequesterHomeViewProps {
  recent: RecentState;
  onRetry?: () => void;
  /** 첫 글(직접 쓴 글 또는 고른 말)로 새 요청 대화를 연다 */
  onStart: (text: string) => void;
  onAsk: () => void;
  onOpen: (item: InboxItem) => void;
  onAll: () => void;
}

/** 화면 모양만(미리보기에서도 쓴다). 위 막대는 비서(서랍·캐릭터·상태), 아래는 입력창과 탭 막대 */
export function RequesterHomeView({ recent, onRetry, onStart, onAsk, onOpen, onAll }: RequesterHomeViewProps) {
  return (
    <ChatShell title="비서" tabs nav={<AgentHeader />} bottom={<Composer placeholder="필요한 시험" onSend={(t) => t && onStart(t)} />}>
      <View style={styles.hero}>
        <Txt variant="chatTitle" style={styles.heroTitle} accessibilityRole="header">
          어떤 시험이 필요해요?
        </Txt>
      </View>
      <View style={styles.starters}>
        {STARTERS.map((s) => (
          <Press key={s.label} label={s.label} onPress={() => (s.seed ? onStart(s.seed) : onAsk())} style={styles.chip}>
            <Txt variant="chatLabel">{s.label}</Txt>
          </Press>
        ))}
      </View>
      <RecentCard recent={recent} onRetry={onRetry} onOpen={onOpen} onAll={onAll} />
    </ChatShell>
  );
}

/** 최근 요청 세 건. 읽는 중에는 마지막 모양의 뼈대, 요청이 없으면 숨긴다 */
function RecentCard({ recent, onRetry, onOpen, onAll }: { recent: RecentState; onRetry?: () => void; onOpen: (item: InboxItem) => void; onAll: () => void }) {
  if (recent.kind === 'error') return <ErrorLine label={recent.label} onRetry={onRetry} />;
  if (recent.kind === 'ready' && !recent.items.length) return null;
  const shown = recent.kind === 'ready' ? recent.items.slice(0, RECENT) : null;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Txt variant="chatLabel" style={{ fontFamily: fonts.bold, flex: 1 }} accessibilityRole="header">
          최근 요청
        </Txt>
        {recent.kind === 'ready' && (
          <Press label="요청함 전체" onPress={onAll} style={styles.all}>
            <Txt variant="chatCaption" color={tokens.muted}>
              전체
            </Txt>
            <CaretRight size={uc(12)} color={tokens.muted} />
          </Press>
        )}
      </View>
      {shown
        ? shown.map((it, i) => {
            const chip = STATUS_CHIP[it.status];
            return (
              <Press key={it.id} label={`${it.title}, ${chip.label}`} onPress={() => onOpen(it)} style={[styles.row, i > 0 && styles.line]}>
                <View style={{ flex: 1, gap: uc(4) }}>
                  <Txt variant="chatSmall" style={{ fontFamily: fonts.semibold }} numberOfLines={1}>
                    {it.title}
                  </Txt>
                  <View style={styles.meta}>
                    <Txt variant="chatCaption" color={TONE[chip.kind]} style={{ fontFamily: fonts.semibold }}>
                      {chip.label}
                    </Txt>
                    <Txt variant="chatCaption" color={tokens.muted} tabular numberOfLines={1} style={{ flexShrink: 1 }}>
                      {it.when}
                    </Txt>
                  </View>
                </View>
              </Press>
            );
          })
        : [0, 1].map((i) => (
            <View key={i} style={[styles.row, i > 0 && styles.line]} accessibilityLabel={i === 0 ? '불러오는 중' : undefined} accessibilityRole={i === 0 ? 'progressbar' : undefined}>
              <View style={{ flex: 1, gap: uc(8) }}>
                <View style={[styles.bone, { width: '58%' }]} />
                <View style={[styles.bone, { width: uc(84) }]} />
              </View>
            </View>
          ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: uc(28), paddingBottom: uc(4) },
  heroTitle: { textAlign: 'center' },
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: uc(8), justifyContent: 'center' },
  chip: { height: uc(34), paddingHorizontal: uc(14), borderRadius: radius.pill, backgroundColor: tokens.sunken, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: tokens.surface, borderRadius: uc(18), borderWidth: 1, borderColor: tokens.border, paddingHorizontal: uc(14), paddingVertical: uc(10), gap: uc(2) },
  head: { flexDirection: 'row', alignItems: 'center', paddingBottom: uc(6) },
  all: { flexDirection: 'row', alignItems: 'center', gap: uc(2), minHeight: uc(32), paddingLeft: uc(10) },
  row: { paddingVertical: uc(10) },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  meta: { flexDirection: 'row', alignItems: 'center', gap: uc(8) },
  bone: { height: uc(13), borderRadius: uc(7), backgroundColor: tokens.sunken },
});
