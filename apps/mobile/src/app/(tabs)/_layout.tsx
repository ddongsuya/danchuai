// 탭 묶음(Muse 시안 2026-11-25). 아래 탭 5개(대화·소식·맡길 일·할 일·자료)와 서랍을 의뢰자·기관이 같이 쓴다.
// 역할은 로그인한 조직 종류로 정한다. 시연 모드(로그인 꺼짐)에서만 서랍의 "화면 바꾸기"나 주소 ?as=cro로 바꾼다.
// 보낸 것 확인 필요 수와 읽지 않은 소식 수는 여기서 한 번 읽어 위 막대·아래 탭이 나눠 쓴다.
import { characterOf } from '@danchuai/core';
import { Redirect, router, useGlobalSearchParams, useSegments, type Href } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useCallback, useMemo, useState } from 'react';

import { useSentCheck, useUnreadAlerts } from '@/components/agent/AgentStatus';
import { requesterHref } from '@/components/agent/RequesterHome';
import { DrawerFrame, type DrawerItem } from '@/components/shell/Drawer';
import { SettingsSheet } from '@/components/shell/SettingsSheet';
import { ShellProvider, type ChatHandoff, type TabKey } from '@/components/shell/ShellContext';
import { TabBar } from '@/components/shell/TabBar';
import { tokens } from '@/constants/theme';
import { agentConfigured, listAsks, type AgentRole } from '@/lib/agentClient';
import { requesterItem } from '@/lib/inbox';
import { fetchRequests } from '@/lib/marketClient';
import { useAuth } from '@/lib/session';

/** 탭 이름 → 주소 */
export const tabHref = (key: TabKey): Href => (key === 'index' ? '/' : (`/${key}` as Href));

export default function TabsLayout() {
  const { status, org, character } = useAuth();
  const agentName = characterOf(character).name;
  const { as } = useGlobalSearchParams<{ as?: string }>();
  const [demoRole, setDemoRole] = useState<AgentRole>(as === 'cro' ? 'cro' : 'requester');
  // 주소의 ?as= 가 바뀌면(옛 기관 비서 주소로 들어옴) 시연 역할을 따라 바꾼다
  const [seenAs, setSeenAs] = useState(as);
  if (as !== seenAs) {
    setSeenAs(as);
    if (as === 'cro' || as === 'requester') setDemoRole(as);
  }
  const role: AgentRole = status === 'disabled' ? demoRole : org?.kind === 'cro' ? 'cro' : 'requester';
  const inApp = status === 'ready' || status === 'disabled';
  const live = agentConfigured();
  const sent = useSentCheck(role, live && inApp);
  const unread = useUnreadAlerts(role, live && inApp);
  const [drawer, setDrawer] = useState(false);
  const [settings, setSettings] = useState(false);
  const [pending, setPending] = useState<ChatHandoff | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const [chats, loadChats] = useSideChats(role);
  const segments = useSegments();
  const active = (segments.at(-1) && ['feed', 'ideas', 'todo', 'library'].includes(segments.at(-1)!) ? segments.at(-1) : 'index') as TabKey;

  const shell = useMemo(
    () => ({
      role,
      character,
      agentName,
      live,
      check: sent.check,
      // 확인 필요를 누르면 비서 프로필의 확인 칸
      onCheck: () => router.push({ pathname: '/agent', params: { role, tab: 'check' } }),
      unread,
      openDrawer: () => {
        setDrawer(true);
        if (live && inApp) void loadChats();
      },
      openAgent: () => router.push({ pathname: '/agent', params: { role } }),
      openSettings: () => setSettings(true),
      chatKey,
      pending,
      handoff: setPending,
    }),
    [role, character, agentName, live, inApp, sent.check, unread, chatKey, loadChats, pending],
  );

  if (status === 'signedOut') return <Redirect href="/welcome" />;
  if (status === 'needsConsent') return <Redirect href={'/consent' as Href} />;

  return (
    <ShellProvider value={shell}>
      <DrawerFrame
        visible={drawer}
        onClose={() => setDrawer(false)}
        title={agentName}
        active={active}
        onTab={(key) => router.navigate(tabHref(key))}
        chats={chats}
        onSettings={() => setSettings(true)}
        onNew={() => {
          // 의뢰자는 새 요청 대화, 기관은 비서 대화를 새로
          if (role === 'requester') router.push({ pathname: '/requester/[id]', params: { id: 'new' } });
          else {
            setChatKey((k) => k + 1);
            router.navigate('/');
          }
        }}
      >
        <Tabs tabBar={(p) => <TabBar {...p} unread={unread} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: tokens.bg } }}>
          <Tabs.Screen name="index" options={{ title: '대화' }} />
          <Tabs.Screen name="feed" options={{ title: '소식' }} />
          <Tabs.Screen name="ideas" options={{ title: '맡길 일' }} />
          <Tabs.Screen name="todo" options={{ title: '할 일' }} />
          <Tabs.Screen name="library" options={{ title: '자료' }} />
        </Tabs>
      </DrawerFrame>
      <SettingsSheet visible={settings} onClose={() => setSettings(false)} role={role} demo={status === 'disabled'} onSwitchRole={() => setDemoRole(role === 'cro' ? 'requester' : 'cro')} />
    </ShellProvider>
  );
}

/** 따로 하는 대화: 의뢰자는 보내기 전 요청 대화 + 지난 질문, 기관은 지난 질문. 서랍을 열 때 읽는다(최근 순, 각 5개) */
function useSideChats(role: AgentRole): [DrawerItem[], () => Promise<void>] {
  const [items, setItems] = useState<DrawerItem[]>([]);
  const load = useCallback(async () => {
    const asks = listAsks(role)
      .then((r) => r.slice(0, 5).map((a) => ({ key: `a:${a.id}`, label: a.title, onPress: () => router.push({ pathname: '/ask', params: { role, conv: a.id } }) })))
      .catch(() => [] as DrawerItem[]);
    const drafts =
      role === 'requester'
        ? fetchRequests()
            .then((r) =>
              r
                .map((x) => requesterItem(x))
                .filter((x) => x.status === 'drafting' || x.status === 'waiting')
                .slice(0, 5)
                .map((x) => ({ key: `r:${x.id}`, label: x.title, onPress: () => router.push(requesterHref(x.id)) })),
            )
            .catch(() => [] as DrawerItem[])
        : Promise.resolve([] as DrawerItem[]);
    const [d, a] = await Promise.all([drafts, asks]);
    setItems([...d, ...a]);
  }, [role]);
  return [items, load];
}
