// 소식 탭(시안 원본 m04). 맨 위 찾기 알약, 글마다 색 칸 그림(32, 반지름 9) + 굵은 제목 + 본문 + 좋아요·이야기하기·시각 줄.
// 단추 알림을 단추가 준 순서 그대로 보인다(앱이 고르거나 강조하지 않는다). 탭을 열 때마다 새로 읽고, 읽지 않은 것은 읽음으로 표시한다.
// 오른쪽 위 단추로 종류(요청·견적·선정과 계약)를 고른다. 좋아요는 기기 안에만 둔다.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useShell } from '@/components/shell/ShellContext';
import { CircleButton } from '@/components/shell/AgentHeader';
import { TabPage } from '@/components/shell/TabPage';
import { Button } from '@/components/ui/Button';
import { MIcon, type MIconName } from '@/components/ui/MIcon';
import { BottomSheet, Li, Group, Post, type PicTone } from '@/components/ui/Muse';
import { Press } from '@/components/ui/Press';
import { StateView } from '@/components/ui/StateView';
import { Txt } from '@/components/ui/Txt';
import { fonts, tokens } from '@/constants/theme';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { agentConfigured, listAlerts, readAllAlerts, type AgentRole } from '@/lib/agentClient';
import { alertHref, unreadCount, type AlertItem } from '@/lib/alerts';
import { ago } from '@/app/alerts';
import { DANCHU_URL, openWeb } from '@/lib/danchuLinks';
import { useLocalSet } from '@/lib/localSet';

export default function FeedTab() {
  const { role } = useShell();
  const live = agentConfigured();
  const load = useCallback(() => listAlerts(role), [role]);
  const { state, reload } = useRemote(load, live);
  const items = state.kind === 'ready' ? state.data : null;
  const unread = items ? unreadCount(items) : 0;
  useFocusEffect(
    useCallback(() => {
      if (unread > 0) readAllAlerts(role).catch(() => undefined);
    }, [unread, role]),
  );
  return <FeedView role={role} items={live ? items : []} error={!live ? '아직 연결하는 중이에요' : state.kind === 'error' ? REMOTE_ERROR[state.code] : null} onRetry={() => void reload()} />;
}

export type FeedKind = 'all' | 'request' | 'quote' | 'won';
const KINDS: { key: FeedKind; label: string }[] = [
  { key: 'all', label: '모든 소식' },
  { key: 'request', label: '요청' },
  { key: 'quote', label: '견적과 기한' },
  { key: 'won', label: '선정과 계약' },
];

/** 글 그림: 기한은 노랑 시계, 선정·계약은 초록 체크, 그 밖은 파랑 문서(시안 m04) */
export function postLook(a: Pick<AlertItem, 'title' | 'kind'>): { tone: PicTone; icon: MIconName; kind: FeedKind } {
  if (/기한|유효/.test(a.title)) return { tone: 'yellow', icon: 'clock', kind: 'quote' };
  if (/선정|계약/.test(a.kind) || /선정|계약/.test(a.title)) return { tone: 'green', icon: 'check', kind: 'won' };
  if (/견적|비교/.test(a.kind)) return { tone: 'blue', icon: 'doc', kind: 'quote' };
  if (/기관|시스템/.test(a.kind)) return { tone: 'purple', icon: 'info', kind: 'all' };
  return { tone: 'blue', icon: 'doc', kind: 'request' };
}

/** 화면 모양만(미리보기에서도 쓴다) */
export function FeedView({ role, items, error, onRetry, now, initialLiked }: { role: AgentRole; items: AlertItem[] | null; error: string | null; onRetry: () => void; now?: Date; initialLiked?: string[] }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<FeedKind>('all');
  const [pick, setPick] = useState(false);
  const [liked, toggleLike] = useLocalSet('danchuai.feed.liked', initialLiked);
  const open = (a: AlertItem) => {
    const href = alertHref(role, a);
    if (href) router.push(href);
    else if (a.href) void openWeb(`${DANCHU_URL}${a.href}`).catch(() => undefined);
  };
  const shown = useMemo(() => {
    const words = q.trim();
    return (items ?? []).filter((a) => (kind === 'all' || postLook(a).kind === kind) && (!words || `${a.title} ${a.body}`.includes(words)));
  }, [items, q, kind]);
  return (
    <TabPage
      title="소식"
      right={
        <CircleButton label="소식 고르기" onPress={() => setPick(true)}>
          <MIcon name="sliders" />
        </CircleButton>
      }
    >
      <View style={styles.ask}>
        <TextInput value={q} onChangeText={setQ} placeholder="어떤 소식을 볼까요?" placeholderTextColor={tokens.muted} accessibilityLabel="소식 찾기" style={styles.askInput} selectionColor={tokens.primary} returnKeyType="search" />
      </View>
      {error ? (
        <StateView tone="error" title={error} actions={<Button title="다시 시도" kind="soft" tall onPress={onRetry} />} />
      ) : items === null ? (
        <Skeleton />
      ) : !items.length ? (
        <StateView tone="empty" title="아직 소식이 없어요" reason="요청이 움직이면 여기 알려 드릴게요" />
      ) : !shown.length ? (
        <StateView tone="empty" title="맞는 소식이 없어요" reason="다른 말로 찾아 볼까요?" />
      ) : (
        shown.map((a, i) => {
          const look = postLook(a);
          const on = liked.has(a.id);
          const canOpen = !!a.href;
          return (
            <Post key={a.id} tone={look.tone} icon={look.icon} title={a.title} body={a.body} last={i === shown.length - 1} onPress={canOpen ? () => open(a) : undefined} label={`${a.read ? '' : '새 소식, '}${a.title}`}>
              <View style={styles.acts}>
                <Press label={on ? '좋아요 취소' : '좋아요'} accessibilityState={{ selected: on }} onPress={() => toggleLike(a.id)} style={styles.act}>
                  <MIcon name="heart" size={15} color={on ? tokens.danger : tokens.muted} />
                </Press>
                {canOpen ? (
                  <Press label="이야기하기" onPress={() => open(a)} style={styles.act}>
                    <MIcon name="talk" size={15} color={tokens.muted} />
                    <Txt style={styles.actText} color={tokens.muted}>
                      이야기하기
                    </Txt>
                  </Press>
                ) : null}
                <View style={styles.tm}>
                  {!a.read && <View style={styles.dot} />}
                  <Txt style={styles.actText} color={tokens.muted} tabular>
                    {ago(a.at, now)}
                  </Txt>
                  <MIcon name="info" size={13} color={tokens.muted} />
                </View>
              </View>
            </Post>
          );
        })
      )}
      <BottomSheet visible={pick} onClose={() => setPick(false)} label="소식 고르기">
        <Txt variant="mSheet">어떤 소식을 볼까요?</Txt>
        <Group style={{ backgroundColor: tokens.group }}>
          {KINDS.map((k, i) => (
            <Li
              key={k.key}
              first={i === 0}
              title={k.label}
              selected={kind === k.key}
              onPress={() => {
                setKind(k.key);
                setPick(false);
              }}
              right={kind === k.key ? <MIcon name="check" size={18} color={tokens.primary} width={2.2} /> : <View style={{ width: 18 }} />}
            />
          ))}
        </Group>
      </BottomSheet>
    </TabPage>
  );
}

function Skeleton() {
  return (
    <View accessibilityLabel="불러오는 중이에요" accessibilityRole="progressbar">
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.bones}>
          <View style={[styles.bonePic]} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[styles.bone, { width: '64%' }]} />
            <View style={[styles.bone, { width: '90%' }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // 지시문 알약: 높이 40, 테두리 #e3e3e6, 13.5 회색, 아래 4
  ask: { height: 40, borderRadius: 20, borderWidth: 1, borderColor: tokens.border, justifyContent: 'center', paddingHorizontal: 14, marginBottom: 4 },
  askInput: { fontFamily: fonts.regular, fontSize: 13.5, color: tokens.text, height: 38, paddingVertical: 0 },
  // .acts: 위 8, 12.5 회색, 사이 14, 시각은 오른쪽
  acts: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24 },
  actText: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18 },
  tm: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.primary },
  bones: { flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 2 },
  bonePic: { width: 32, height: 32, borderRadius: 9, backgroundColor: tokens.sunken },
  bone: { height: 13, borderRadius: 7, backgroundColor: tokens.sunken },
});
