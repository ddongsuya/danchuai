// 아래 탭 5개(Muse 시안 2026-11-25): 대화·소식·맡길 일·할 일·자료. 흰 알약 막대 안에 그림만, 고른 탭은 회색 알약.
// 그림 뜻은 읽기 프로그램에 탭 이름으로 읽힌다. 키보드가 올라오면 막대를 숨긴다(입력창이 가려지지 않게).
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Article, ChatCircle, CheckSquare, Lightbulb, SquaresFour } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';

import { Press } from '@/components/ui/Press';
import { tokens } from '@/constants/theme';

import type { TabKey } from './ShellContext';

export const TABS: { key: TabKey; label: string; Icon: typeof ChatCircle }[] = [
  { key: 'index', label: '대화', Icon: ChatCircle },
  { key: 'feed', label: '소식', Icon: Article },
  { key: 'ideas', label: '맡길 일', Icon: Lightbulb },
  { key: 'todo', label: '할 일', Icon: CheckSquare },
  { key: 'library', label: '자료', Icon: SquaresFour },
];

/** 화면 모양만(미리보기에서도 쓴다) */
export function TabBarView({ active, onPress, unread = 0, bottom = 0 }: { active: TabKey; onPress: (key: TabKey) => void; unread?: number; bottom?: number }) {
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottom, 10) }]}>
      <View style={styles.bar} accessibilityRole="tablist">
        {TABS.map(({ key, label, Icon }) => {
          const on = key === active;
          const dot = key === 'feed' && unread > 0;
          return (
            <Press
              key={key}
              label={dot ? `${label}, 새 소식 ${unread}건` : label}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => onPress(key)}
              style={[styles.item, on && styles.on]}
            >
              <Icon size={23} weight={on ? 'bold' : 'regular'} color={tokens.text} />
              {dot && <View style={styles.dot} />}
            </Press>
          );
        })}
      </View>
    </View>
  );
}

/** 탭 이동기(expo-router Tabs)에 붙이는 막대 */
export function TabBar({ state, emitter, navigateToTab, insets, unread }: BottomTabBarProps & { unread?: number }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setHidden(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setHidden(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  if (hidden) return null;
  const active = (state.routes[state.index]?.name ?? 'index') as TabKey;
  return (
    <TabBarView
      active={active}
      unread={unread}
      bottom={insets.bottom}
      onPress={(key) => {
        const route = state.routes.find((r) => r.name === key);
        if (!route) return;
        const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!event.defaultPrevented && key !== active) navigateToTab(route.key);
      }}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingTop: 6, backgroundColor: tokens.bg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 62,
    paddingHorizontal: 6,
    borderRadius: 31,
    backgroundColor: tokens.surface,
    borderWidth: 1,
    borderColor: tokens.border,
    shadowColor: tokens.ink,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  item: { flex: 1, height: 50, marginHorizontal: 2, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: tokens.selected },
  dot: { position: 'absolute', top: 12, right: '30%', width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.primary, borderWidth: 1.5, borderColor: tokens.surface },
});
