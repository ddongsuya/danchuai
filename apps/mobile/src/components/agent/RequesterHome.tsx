// 의뢰자 대화 탭(Muse 시안 2026-11-25, 기관 비서와 같은 틀). 열자마자 "어떤 시험 견적을 받아 드릴까요?"로 대화를 시작한다.
// 위 막대에 비서 캐릭터·이름·상태, 왼쪽 서랍에 탭·따로 하는 대화. 첫 글을 보내면 새 요청 대화가 그 글로 열린다(대화는 첫 글을 보낼 때 만든다).
// 아래에 최근 요청 세 건(서버 목록 순서 그대로)을 둔다.
import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorLine } from '@/components/agent/LiveChat';
import { ChatShell } from '@/components/chat/ChatShell';
import { Composer } from '@/components/chat/Composer';
import { STATUS_CHIP } from '@/components/inbox/InboxScreen';
import type { ChipTone } from '@/components/ui/Chip';
import { AgentText, TaskCard } from '@/components/chat/Messages';
import { AgentHeader } from '@/components/shell/AgentHeader';
import { InviteButton } from '@/components/shell/InviteButton';
import { MIcon } from '@/components/ui/MIcon';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, tokens } from '@/constants/theme';
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
  const recent: RecentState = !live ? { kind: 'error', label: '아직 연결하는 중이에요' } : state.kind === 'ready' ? { kind: 'ready', items } : state.kind === 'error' ? { kind: 'error', label: REMOTE_ERROR[state.code] } : { kind: 'loading' };
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

/** 화면 모양만(미리보기에서도 쓴다). 위 막대는 비서(서랍·캐릭터·상태·초대), 대화는 말풍선, 아래는 입력창과 탭 막대 */
export function RequesterHomeView({ recent, onRetry, onStart, onAsk, onOpen, onAll }: RequesterHomeViewProps) {
  return (
    <ChatShell title="비서" tabs nav={<AgentHeader right={<InviteButton />} />} bottom={<Composer placeholder="메시지" onPlus={() => router.navigate('/ideas' as Href)} onSend={(t) => t && onStart(t)} />}>
      <AgentText>어떤 시험 견적을 받아 드릴까요? 시험 이름이나 물질만 알려 주셔도 요청서를 같이 채워요.</AgentText>
      <TaskCard icon="idea" title="이렇게 시작해 보세요" sub="하나를 고르면 바로 대화를 열어요">
        <View style={styles.picks}>
          {STARTERS.map((s) => (
            <Press key={s.label} label={s.label} onPress={() => (s.seed ? onStart(s.seed) : onAsk())} style={styles.pick}>
              <Txt style={styles.pickText}>{s.label}</Txt>
            </Press>
          ))}
        </View>
      </TaskCard>
      <RecentCard recent={recent} onRetry={onRetry} onOpen={onOpen} onAll={onAll} />
    </ChatShell>
  );
}

/** 최근 요청 세 건(.task 모양). 읽는 중에는 마지막 모양의 뼈대, 요청이 없으면 숨긴다 */
function RecentCard({ recent, onRetry, onOpen, onAll }: { recent: RecentState; onRetry?: () => void; onOpen: (item: InboxItem) => void; onAll: () => void }) {
  if (recent.kind === 'error') return <ErrorLine label={recent.label} onRetry={onRetry} />;
  if (recent.kind === 'ready' && !recent.items.length) return null;
  const shown = recent.kind === 'ready' ? recent.items.slice(0, RECENT) : null;
  return (
    <TaskCard icon="list" title="최근 요청" sub={shown ? `${recent.kind === 'ready' ? recent.items.length : 0}건` : '불러오는 중이에요'} action={shown ? '요청 전체 보기' : undefined} onAction={onAll}>
      <View style={styles.box}>
        {shown
          ? shown.map((it, i) => {
              const chip = STATUS_CHIP[it.status];
              return (
                <Press key={it.id} label={`${it.title}, ${chip.label}`} onPress={() => onOpen(it)} style={[styles.row, i > 0 && styles.line]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt style={styles.rowTitle} numberOfLines={1}>
                      {it.title}
                    </Txt>
                    <View style={styles.meta}>
                      <Txt style={styles.metaText} color={TONE[chip.kind]}>
                        {chip.label}
                      </Txt>
                      <Txt style={[styles.metaText, { fontFamily: fonts.regular, flexShrink: 1 }]} color={tokens.muted} tabular numberOfLines={1}>
                        {it.when}
                      </Txt>
                    </View>
                  </View>
                  <MIcon name="chevron" size={16} color={tokens.icon2} />
                </Press>
              );
            })
          : [0, 1].map((i) => (
              <View key={i} style={[styles.row, i > 0 && styles.line]} accessibilityLabel={i === 0 ? '불러오는 중이에요' : undefined} accessibilityRole={i === 0 ? 'progressbar' : undefined}>
                <View style={{ flex: 1, gap: 8 }}>
                  <View style={[styles.bone, { width: '58%' }]} />
                  <View style={[styles.bone, { width: 84 }]} />
                </View>
              </View>
            ))}
      </View>
    </TaskCard>
  );
}

const styles = StyleSheet.create({
  picks: { gap: 8 },
  pick: { height: 38, borderRadius: 19, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  pickText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  box: { backgroundColor: '#ffffff', borderRadius: 14, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  line: { borderTopWidth: 1, borderTopColor: tokens.line },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 17 },
  bone: { height: 13, borderRadius: 7, backgroundColor: tokens.sunken },
});
