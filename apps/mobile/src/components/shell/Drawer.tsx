// 서랍(시안 원본 m09). 지금 화면이 오른쪽으로 300 밀려나고(흰 바탕, 왼쪽 모서리 30, 그림자 -4 0 20 8%),
// 왼쪽 290 자리에 서랍이 드러난다. 맨 위 비서 이름(22 굵게), "탭" 다섯 줄(지금 탭은 #ececee, 굵기 600),
// "따로 하는 대화"(이어 쓰는 요청·질문), 맨 아래 설정 원·찾기 알약(#f4f5f7)·새 대화 원.
// 찾기에 글을 넣으면 따로 하는 대화를 이름으로 거른다. 밀린 화면을 누르면 닫힌다.
// 들어올 때 0.28초 ease-out, 닫을 때 0.2초 ease-in. 동작 줄이기가 켜지면 밀지 않고 0.2초 흐림 전환만.
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { MIcon } from '@/components/ui/MIcon';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, motion, tokens } from '@/constants/theme';
import { KEEP, easeIn, easeOut } from '@/lib/motion';

import { CircleButton } from './AgentHeader';
import type { TabKey } from './ShellContext';
import { TABS } from './TabBar';

export interface DrawerItem {
  key: string;
  label: string;
  /** 고정한 대화(핀 그림) */
  pinned?: boolean;
  /** 오른쪽 작은 숫자. 0이면 숨김 */
  count?: number;
  onPress: () => void;
}

export interface DrawerProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  active: TabKey;
  onTab: (key: TabKey) => void;
  /** 따로 하는 대화(이어 쓰는 요청, 지난 질문) */
  chats: DrawerItem[];
  onSettings: () => void;
  onNew: () => void;
}

const PUSH = 300;
const PANEL = 290;

/** 화면을 밀어내는 서랍 틀. children 은 탭 화면 전체 */
export function DrawerFrame({ children, ...p }: DrawerProps & { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(p.visible);
  const v = useSharedValue(0);
  if (p.visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    const done = () => setMounted(false);
    v.set(
      withTiming(p.visible ? 1 : 0, { duration: p.visible ? (reduced ? motion.ms.reduced : 280) : motion.ms.popOut, easing: p.visible ? easeOut : easeIn, reduceMotion: KEEP }, (fin) => {
        if (fin && !p.visible) scheduleOnRN(done);
      }),
    );
  }, [p.visible, mounted, reduced, v]);

  const page = useAnimatedStyle(() =>
    reduced
      ? { transform: [{ translateX: v.get() > 0 ? PUSH : 0 }], borderTopLeftRadius: v.get() > 0 ? 30 : 0, borderBottomLeftRadius: v.get() > 0 ? 30 : 0 }
      : { transform: [{ translateX: v.get() * PUSH }], borderTopLeftRadius: v.get() * 30, borderBottomLeftRadius: v.get() * 30 },
  );
  const panel = useAnimatedStyle(() => ({ opacity: reduced ? v.get() : 1 }));
  return (
    <View style={styles.root}>
      {mounted && (
        <Animated.View style={[styles.panel, panel]} accessibilityViewIsModal={p.visible}>
          <DrawerBody {...p} />
        </Animated.View>
      )}
      <Animated.View style={[styles.page, mounted && styles.pageOpen, page]} importantForAccessibility={p.visible ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={p.visible}>
        {children}
        {mounted && <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="서랍 닫기" onPress={p.onClose} />}
      </Animated.View>
    </View>
  );
}

/** 서랍 안쪽(미리보기에서도 쓴다) */
export function DrawerBody({ onClose, title, active, onTab, chats, onSettings, onNew }: DrawerProps) {
  const [q, setQ] = useState('');
  const go = (fn: () => void) => {
    onClose();
    fn();
  };
  const shown = chats.filter((it) => !q.trim() || it.label.includes(q.trim()));
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.body}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Txt style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Txt>
        {!q.trim() && (
          <>
            <Txt style={[styles.section, { marginTop: 0 }]} color={tokens.muted}>
              탭
            </Txt>
            {TABS.map(({ key, label, icon }) => {
              const on = key === active;
              return (
                <Press key={key} label={label} accessibilityState={{ selected: on }} onPress={() => go(() => onTab(key))} style={[styles.tab, on && styles.tabOn]}>
                  <MIcon name={icon} size={20} />
                  <Txt style={[styles.rowText, { fontFamily: on ? fonts.semibold : fonts.medium }]}>{label}</Txt>
                </Press>
              );
            })}
          </>
        )}
        {shown.length > 0 && (
          <>
            <Txt style={styles.section} color={tokens.muted}>
              따로 하는 대화
            </Txt>
            {shown.map((it) => (
              <Press key={it.key} label={it.count ? `${it.label}, ${it.count}건` : it.label} onPress={() => go(it.onPress)} style={styles.chat}>
                {it.pinned ? <MIcon name="pin" size={15} color={tokens.muted} /> : null}
                <Txt style={[styles.rowText, { flex: 1 }]} numberOfLines={1}>
                  {it.label}
                </Txt>
                {it.count ? (
                  <View style={styles.count}>
                    <Txt style={styles.countText} color={tokens.onPrimary} tabular>
                      {it.count}
                    </Txt>
                  </View>
                ) : null}
              </Press>
            ))}
          </>
        )}
        {q.trim() && !shown.length ? (
          <Txt style={[styles.rowText, styles.none]} color={tokens.muted}>
            {`"${q.trim()}"에 맞는 대화가 없어요`}
          </Txt>
        ) : null}
      </ScrollView>
      <View style={styles.foot}>
        <CircleButton label="설정" onPress={() => go(onSettings)}>
          <MIcon name="gear" />
        </CircleButton>
        <View style={styles.search}>
          <View style={styles.searchIc}>
            <MIcon name="search" size={17} color={tokens.muted} />
          </View>
          <TextInput value={q} onChangeText={setQ} placeholder="찾기" placeholderTextColor={tokens.muted} accessibilityLabel="찾기" style={styles.input} selectionColor={tokens.primary} returnKeyType="search" />
        </View>
        <CircleButton label="새 대화" onPress={() => go(onNew)}>
          <MIcon name="compose" />
        </CircleButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  panel: { position: 'absolute', left: 0, top: 0, bottom: 0, width: PANEL, backgroundColor: tokens.bg },
  page: { flex: 1, backgroundColor: tokens.bg },
  pageOpen: { overflow: 'hidden', backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: -4, height: 0 }, elevation: 6 },
  body: { flex: 1 },
  // 안쪽 위 30, 왼 18, 오른 14, 아래 20
  scroll: { paddingTop: 30, paddingLeft: 18, paddingRight: 14, paddingBottom: 12 },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 30, marginBottom: 18, color: tokens.text },
  section: { fontFamily: fonts.semibold, fontSize: 12.5, lineHeight: 18, marginTop: 18, marginBottom: 4 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
  tabOn: { backgroundColor: tokens.selected },
  chat: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12 },
  rowText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22.5, color: tokens.text },
  none: { paddingHorizontal: 12, paddingTop: 12 },
  count: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: tokens.primary, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: fonts.bold, fontSize: 11.5, lineHeight: 15 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 18, paddingRight: 14, paddingBottom: 20, paddingTop: 8 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 21, backgroundColor: tokens.group, paddingHorizontal: 14 },
  searchIc: { flexShrink: 0 },
  input: { flex: 1, minWidth: 0, fontFamily: fonts.regular, fontSize: 15, color: tokens.text, paddingVertical: 0, height: 42 },
});
