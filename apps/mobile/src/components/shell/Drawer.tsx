// 서랍(Muse 시안 2026-11-25). 왼쪽에서 0.28초 ease-out으로 들어오고 뒤는 흐려진다. 닫을 때 0.2초 ease-in.
// 맨 위 비서 이름, "탭" 다섯 줄(지금 탭은 회색), "따로 하는 대화"(이어 쓰는 요청·질문), 그 밖의 곳(보낸 것 등),
// 맨 아래 설정·찾기·새 대화. 찾기에 글을 넣으면 따로 하는 대화와 그 밖의 곳을 이름으로 거른다.
// 동작 줄이기가 켜지면 이동 없이 0.2초 흐림 전환만.
import { GearSix, MagnifyingGlass, PencilSimple } from 'phosphor-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, motion, tokens } from '@/constants/theme';
import { KEEP, easeIn, easeOut } from '@/lib/motion';

import type { TabKey } from './ShellContext';
import { TABS } from './TabBar';

export interface DrawerItem {
  key: string;
  label: string;
  icon?: ReactNode;
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
  /** 그 밖의 곳(보낸 것, 실행 기록, 질문하기, 계정, 시연 화면 바꾸기) */
  more: DrawerItem[];
  onSettings: () => void;
  onNew: () => void;
}

const WIDTH = 300;

export function Drawer(p: DrawerProps) {
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

  const panel = useAnimatedStyle(() => ({ opacity: reduced ? v.get() : 1, transform: [{ translateX: reduced ? 0 : (v.get() - 1) * WIDTH }] }));
  const scrim = useAnimatedStyle(() => ({ opacity: v.get() }));
  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={p.onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="서랍 닫기" onPress={p.onClose} />
      </Animated.View>
      <Animated.View style={[styles.panel, panel]} accessibilityViewIsModal>
        <DrawerBody {...p} />
      </Animated.View>
    </Modal>
  );
}

/** 서랍 안쪽(미리보기에서도 쓴다) */
export function DrawerBody({ onClose, title, active, onTab, chats, more, onSettings, onNew }: DrawerProps) {
  const [q, setQ] = useState('');
  const go = (fn: () => void) => {
    onClose();
    fn();
  };
  const match = (it: DrawerItem) => !q.trim() || it.label.includes(q.trim());
  const shownChats = chats.filter(match);
  const shownMore = more.filter(match);
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.body}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Txt variant="museTitle" accessibilityRole="header" style={styles.title} numberOfLines={1}>
          {title}
        </Txt>
        {!q.trim() && (
          <>
            <Txt variant="museSmall" color={tokens.muted} style={styles.section}>
              탭
            </Txt>
            {TABS.map(({ key, label, Icon }) => (
              <Press key={key} label={label} accessibilityState={{ selected: key === active }} onPress={() => go(() => onTab(key))} style={[styles.row, key === active && styles.rowOn]}>
                <Icon size={21} color={tokens.text} />
                <Txt variant="museRow" style={styles.rowLabel}>
                  {label}
                </Txt>
              </Press>
            ))}
          </>
        )}
        {shownChats.length > 0 && (
          <>
            <Txt variant="museSmall" color={tokens.muted} style={styles.section}>
              따로 하는 대화
            </Txt>
            {shownChats.map((it) => (
              <Row key={it.key} it={it} onPress={() => go(it.onPress)} />
            ))}
          </>
        )}
        {shownMore.length > 0 && (
          <>
            <Txt variant="museSmall" color={tokens.muted} style={styles.section}>
              그 밖에
            </Txt>
            {shownMore.map((it) => (
              <Row key={it.key} it={it} onPress={() => go(it.onPress)} />
            ))}
          </>
        )}
        {q.trim() && !shownChats.length && !shownMore.length ? (
          <Txt variant="museBody" color={tokens.muted} style={styles.none}>
            {`"${q.trim()}"에 맞는 곳이 없어요`}
          </Txt>
        ) : null}
      </ScrollView>
      <View style={styles.foot}>
        <Press label="설정" onPress={() => go(onSettings)} style={styles.round}>
          <GearSix size={20} color={tokens.text} />
        </Press>
        <View style={styles.search}>
          <MagnifyingGlass size={17} color={tokens.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="찾기" placeholderTextColor={tokens.faint} accessibilityLabel="찾기" style={styles.input} selectionColor={tokens.primary} returnKeyType="search" />
        </View>
        <Press label="새 대화" onPress={() => go(onNew)} style={styles.round}>
          <PencilSimple size={20} color={tokens.text} />
        </Press>
      </View>
    </SafeAreaView>
  );
}

function Row({ it, onPress }: { it: DrawerItem; onPress: () => void }) {
  return (
    <Press label={it.count ? `${it.label}, ${it.count}건` : it.label} onPress={onPress} style={styles.row}>
      {it.icon ? <View style={styles.icon}>{it.icon}</View> : null}
      <Txt variant="museBody" style={[styles.rowLabel, { fontFamily: fonts.medium }]} numberOfLines={1}>
        {it.label}
      </Txt>
      {it.count ? (
        <View style={styles.count}>
          <Txt variant="museStatus" color={tokens.onPrimary} style={{ fontFamily: fonts.bold }} tabular>
            {it.count}
          </Txt>
        </View>
      ) : null}
    </Press>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: tokens.overlay },
  panel: { position: 'absolute', left: 0, top: 0, bottom: 0, width: WIDTH, maxWidth: '86%', backgroundColor: tokens.bg, borderTopRightRadius: 24, borderBottomRightRadius: 24 },
  body: { flex: 1 },
  scroll: { paddingHorizontal: 12, paddingTop: 18, paddingBottom: 16 },
  title: { paddingHorizontal: 8, paddingBottom: 14 },
  section: { paddingHorizontal: 8, paddingTop: 14, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, paddingHorizontal: 10, borderRadius: 12 },
  rowOn: { backgroundColor: tokens.selected },
  rowLabel: { flex: 1 },
  icon: { width: 21, alignItems: 'center' },
  none: { paddingHorizontal: 8, paddingTop: 16 },
  count: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: tokens.primary, alignItems: 'center', justifyContent: 'center' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: tokens.group, alignItems: 'center', justifyContent: 'center' },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 22, backgroundColor: tokens.group, paddingHorizontal: 14 },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: tokens.text, paddingVertical: 0, height: 44 },
});
