// 비서 홈의 메뉴(시안 2026-11-20). 왼쪽에서 0.28초 ease-out으로 들어오고 뒤는 흐려진다. 닫을 때 0.2초 ease-in.
// 동작 줄이기가 켜지면 이동 없이 0.2초 흐림 전환만. 항목은 역할마다 화면이 정한다.
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, motion, radius, space, tokens, u } from '@/constants/theme';
import { KEEP, easeIn, easeOut } from '@/lib/motion';

export interface MenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  /** 오른쪽 작은 숫자(새 요청 등). 0이면 숨김 */
  count?: number;
  onPress: () => void;
}

const WIDTH = u(240);

export function AppMenu({ visible, onClose, title, sub, items, footer }: { visible: boolean; onClose: () => void; title: string; sub?: string | null; items: MenuItem[]; footer?: MenuItem[] }) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const p = useSharedValue(0);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    const done = () => setMounted(false);
    p.set(
      withTiming(visible ? 1 : 0, { duration: visible ? (reduced ? motion.ms.reduced : 280) : motion.ms.popOut, easing: visible ? easeOut : easeIn, reduceMotion: KEEP }, (fin) => {
        if (fin && !visible) scheduleOnRN(done);
      }),
    );
  }, [visible, mounted, reduced, p]);

  const panel = useAnimatedStyle(() => ({ opacity: reduced ? p.get() : 1, transform: [{ translateX: reduced ? 0 : (p.get() - 1) * WIDTH }] }));
  const scrim = useAnimatedStyle(() => ({ opacity: p.get() }));
  if (!mounted) return null;

  const go = (it: MenuItem) => {
    onClose();
    it.onPress();
  };
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="메뉴 닫기" onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.panel, panel]} accessibilityViewIsModal>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
          <View style={styles.head}>
            <AgentAvatar size={u(40)} />
            <View style={{ flex: 1, gap: u(2) }}>
              <Txt variant="label" style={{ fontFamily: fonts.bold }} numberOfLines={1}>
                {title}
              </Txt>
              {sub ? (
                <Txt variant="caption" color={tokens.muted} numberOfLines={1}>
                  {sub}
                </Txt>
              ) : null}
            </View>
          </View>
          <View style={styles.list} accessibilityRole="menu">
            {items.map((it) => (
              <Row key={it.key} it={it} onPress={() => go(it)} />
            ))}
          </View>
          <View style={{ flex: 1 }} />
          {footer?.length ? (
            <View style={[styles.list, styles.footer]}>
              {footer.map((it) => (
                <Row key={it.key} it={it} onPress={() => go(it)} />
              ))}
            </View>
          ) : null}
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

function Row({ it, onPress }: { it: MenuItem; onPress: () => void }) {
  return (
    <Press label={it.count ? `${it.label}, ${it.count}건` : it.label} onPress={onPress} style={styles.row}>
      <View style={styles.icon}>{it.icon}</View>
      <Txt variant="label" style={{ flex: 1 }}>
        {it.label}
      </Txt>
      {it.count ? (
        <View style={styles.count}>
          <Txt variant="caption" color={tokens.onInk} style={{ fontFamily: fonts.bold }} tabular>
            {it.count}
          </Txt>
        </View>
      ) : null}
    </Press>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: tokens.overlay },
  panel: { position: 'absolute', left: 0, top: 0, bottom: 0, width: WIDTH, backgroundColor: tokens.bg, borderTopRightRadius: radius.card, borderBottomRightRadius: radius.card },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xl },
  list: { paddingHorizontal: space.sm, gap: u(2) },
  footer: { paddingBottom: space.md, borderTopWidth: 1, borderTopColor: tokens.border, paddingTop: space.sm, marginHorizontal: space.sm, paddingHorizontal: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, height: u(48), paddingHorizontal: space.md, borderRadius: radius.inner },
  icon: { width: u(24), alignItems: 'center' },
  count: { minWidth: u(22), height: u(22), paddingHorizontal: u(6), borderRadius: radius.pill, backgroundColor: tokens.ink, alignItems: 'center', justifyContent: 'center' },
});
