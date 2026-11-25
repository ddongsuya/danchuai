// 맡길 일 탭(시안 원본 m05·m06). 비서가 먼저 내놓는 일 목록(색 칸 그림 + 굵은 제목 + 회색 설명).
// 누르면 아래 시트: 제목(20), 설명(14 #3a3a3e), "포함되는 일" 세 줄, 점 세 개(제안 숨기기) + "좋아요, 맡길게요".
// 제안은 지금 받은 요청·내 요청에서만 만든다(lib/ideas.ts). 숨긴 제안은 기기 안에만 둔다.
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { requesterHref } from '@/components/agent/RequesterHome';
import { useShell, type ChatHandoff } from '@/components/shell/ShellContext';
import { TabPage } from '@/components/shell/TabPage';
import { MIcon } from '@/components/ui/MIcon';
import { BottomSheet, Post } from '@/components/ui/Muse';
import { Press } from '@/components/ui/Press';
import { StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/Toast';
import { Txt } from '@/components/ui/Txt';
import { fonts, tokens } from '@/constants/theme';
import { useRemote } from '@/hooks/useRemote';
import { agentConfigured } from '@/lib/agentClient';
import { labIdeas, requesterIdeas, type Idea, type IdeaGo } from '@/lib/ideas';
import { requesterItem } from '@/lib/inbox';
import { useLocalSet } from '@/lib/localSet';
import { fetchDanchuLabInbox, fetchRequests } from '@/lib/marketClient';

const loadLab = () => fetchDanchuLabInbox().then(labIdeas);
const loadReq = () => fetchRequests().then((r) => requesterIdeas(r.map((x) => requesterItem(x))));

export default function IdeasTab() {
  const { role, handoff } = useShell();
  const live = agentConfigured();
  const { state } = useRemote<Idea[]>(role === 'cro' ? loadLab : loadReq, live);
  // 읽지 못해도 요청과 상관없는 제안은 보인다
  const ideas = state.kind === 'ready' ? state.data : state.kind === 'error' || !live ? (role === 'cro' ? labIdeas([]) : requesterIdeas([])) : null;
  return <IdeasView ideas={ideas} onGo={(g) => go(g, handoff)} />;
}

function go(g: IdeaGo, handoff: (h: ChatHandoff) => void) {
  switch (g.kind) {
    case 'quote':
      return router.push({ pathname: '/lab/quote/[no]', params: { no: g.no } });
    case 'lab':
      return router.push({ pathname: '/lab/[id]', params: { id: g.no } });
    case 'request':
      return router.push(requesterHref(g.id));
    case 'start':
      return router.push({ pathname: '/requester/[id]', params: { id: 'new', seed: g.seed } });
    case 'ask':
      return router.push({ pathname: '/ask', params: { role: 'requester' } });
    case 'send':
    case 'record':
      handoff(g.kind === 'send' ? { kind: 'send', text: g.text } : { kind: 'record' });
      return router.navigate('/' as Href);
  }
}

/** 화면 모양만(미리보기에서도 쓴다) */
export function IdeasView({ ideas, onGo, initialOpen }: { ideas: Idea[] | null; onGo: (g: IdeaGo) => void; initialOpen?: string }) {
  const [open, setOpen] = useState<string | null>(initialOpen ?? null);
  const [hidden, toggleHidden] = useLocalSet('danchuai.ideas.hidden', initialOpen ? [] : undefined);
  const { toast } = useToast();
  const shown = useMemo(() => (ideas ?? []).filter((x) => !hidden.has(x.key)), [ideas, hidden]);
  const cur = shown.find((x) => x.key === open) ?? null;
  return (
    <TabPage title="맡길 일">
      {ideas === null ? (
        <View accessibilityLabel="불러오는 중이에요" accessibilityRole="progressbar" style={{ gap: 18, paddingTop: 14 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.bone} />
          ))}
        </View>
      ) : !shown.length ? (
        <StateView tone="empty" title="지금은 맡길 일이 없어요" reason="제가 먼저 할 수 있는 일이 생기면 여기에 올려 둘게요" />
      ) : (
        shown.map((x, i) => <Post key={x.key} tone={x.tone} icon={x.icon} title={x.title} body={x.body} bodyMuted last={i === shown.length - 1} onPress={() => setOpen(x.key)} />)
      )}
      <BottomSheet visible={!!cur} onClose={() => setOpen(null)} label={cur?.title ?? '맡길 일'}>
        {cur ? (
          <>
            <Txt variant="mSheet" accessibilityRole="header">
              {cur.title}
            </Txt>
            <Txt style={styles.desc} color={tokens.sub}>
              {cur.body}
            </Txt>
            <View style={styles.incHead}>
              <Txt style={styles.incTitle}>포함되는 일</Txt>
              <MIcon name="list" size={18} />
            </View>
            <View style={{ gap: 8 }}>
              {cur.includes.map((it) => (
                <View key={it.text} style={styles.inc}>
                  <MIcon name={it.icon} size={18} />
                  <Txt style={styles.incText}>{it.text}</Txt>
                </View>
              ))}
            </View>
            <View style={styles.btns}>
              <Press
                label="이 제안 숨기기"
                onPress={() => {
                  toggleHidden(cur.key);
                  setOpen(null);
                  toast('이 제안은 숨겨 둘게요');
                }}
                style={styles.more}
              >
                <MIcon name="more" />
              </Press>
              <Press
                label="좋아요, 맡길게요"
                onPress={() => {
                  setOpen(null);
                  onGo(cur.go);
                }}
                style={styles.ok}
              >
                <Txt style={styles.okText} color={tokens.onPrimary}>
                  좋아요, 맡길게요
                </Txt>
              </Press>
            </View>
          </>
        ) : null}
      </BottomSheet>
    </TabPage>
  );
}

const styles = StyleSheet.create({
  bone: { height: 54, borderRadius: 12, backgroundColor: tokens.sunken },
  desc: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22.4 },
  incHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: tokens.line, paddingTop: 12 },
  incTitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  inc: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  incText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  btns: { flexDirection: 'row', gap: 8, marginTop: 6 },
  more: { width: 46, height: 46, borderRadius: 23, backgroundColor: tokens.selected, alignItems: 'center', justifyContent: 'center' },
  ok: { flex: 1, height: 46, borderRadius: 23, backgroundColor: tokens.primary, alignItems: 'center', justifyContent: 'center' },
  okText: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
});
