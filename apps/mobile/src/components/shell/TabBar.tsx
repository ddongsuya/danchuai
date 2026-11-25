// 아래 탭 5개(Muse 시안 2026-11-25): 대화·소식·맡길 일·할 일·자료. 흰 알약 막대 안에 그림만, 고른 탭은 회색 알약.
// 그림 뜻은 읽기 프로그램에 탭 이름으로 읽힌다. 키보드가 올라오면 막대를 숨긴다(입력창이 가려지지 않게).
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';

import { MIcon, type MIconName } from '@/components/ui/MIcon';
import { Press } from '@/components/ui/Press';
import { tokens } from '@/constants/theme';

import type { TabKey } from './ShellContext';

export const TABS: { key: TabKey; label: string; icon: MIconName }[] = [
  { key: 'index', label: '대화', icon: 'chat' },
  { key: 'feed', label: '소식', icon: 'feed' },
  { key: 'ideas', label: '맡길 일', icon: 'idea' },
  { key: 'todo', label: '할 일', icon: 'todo' },
  { key: 'library', label: '자료', icon: 'library' },
];

/** 화면 모양만(미리보기에서도 쓴다) */
export function TabBarView({ active, onPress, unread = 0, bottom = 0 }: { active: TabKey; onPress: (key: TabKey) => void; unread?: number; bottom?: number }) {
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottom, 20) }]}>
      <View style={styles.bar} accessibilityRole="tablist">
        {TABS.map(({ key, label, icon }) => {
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
              <MIcon name={icon} size={22} />
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
  // .tabs: 좌우 14, 아래 20, 높이 56, 흰 알약, 그림자 0 2 12 8%. 입력창(.comp)은 탭 막대 10 위
  wrap: { paddingHorizontal: 14, paddingTop: 10, backgroundColor: tokens.bg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 6,
    borderRadius: 28,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  item: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: tokens.selected },
  dot: { position: 'absolute', top: 9, right: '28%', width: 7, height: 7, borderRadius: 4, backgroundColor: tokens.primary },
});
