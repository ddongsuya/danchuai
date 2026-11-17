// 토스트와 스낵바. 한 번에 하나만 보이고, 새 알림이 오면 바로 바뀐다.
// 토스트: 제자리에서 0.2초 흐림 전환으로 들고 나며 2초 보인다(복사됨, 저장됨).
// 스낵바: 아래에서 0.28초 ease-out으로 올라오고 0.2초 ease-in으로 내려가며 5초 보인다(되돌리기 같은 동작 하나).
// 동작 줄이기가 켜지면 스낵바도 이동 없이 흐림 전환만.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { fonts, motion, radius, space, tokens, u } from '@/constants/theme';
import { KEEP, easeIn, easeOut } from '@/lib/motion';

import { Press } from './Press';
import { Txt } from './Txt';

interface Note {
  id: number;
  kind: 'toast' | 'snack';
  text: string;
  action?: { label: string; onPress: () => void };
}

interface Api {
  toast: (text: string) => void;
  snack: (text: string, action?: Note['action']) => void;
}

const Ctx = createContext<Api>({ toast: () => {}, snack: () => {} });

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [note, setNote] = useState<Note | null>(null);
  const seq = useRef(0);
  const api = useMemo<Api>(
    () => ({
      toast: (text) => setNote({ id: ++seq.current, kind: 'toast', text }),
      snack: (text, action) => setNote({ id: ++seq.current, kind: 'snack', text, action }),
    }),
    [],
  );
  const done = useCallback((id: number) => setNote((n) => (n?.id === id ? null : n)), []);

  return (
    <Ctx.Provider value={api}>
      {children}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {note && <Item key={note.id} note={note} onDone={done} />}
      </View>
    </Ctx.Provider>
  );
}

function Item({ note, onDone }: { note: Note; onDone: (id: number) => void }) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const shown = useSharedValue(0);
  const height = useSharedValue(64);
  const slide = note.kind === 'snack' && !reduced;

  const leave = useCallback(() => {
    shown.set(withTiming(0, { duration: note.kind === 'snack' ? motion.ms.snackOut : motion.ms.toastOut, easing: easeIn, reduceMotion: KEEP }, (finished) => {
      if (finished) scheduleOnRN(onDone, note.id);
    }));
  }, [note.id, note.kind, onDone, shown]);

  useEffect(() => {
    shown.set(withTiming(1, { duration: slide ? motion.ms.snackIn : motion.ms.toastIn, easing: easeOut, reduceMotion: KEEP }));
    AccessibilityInfo.announceForAccessibility(note.text);
    const t = setTimeout(leave, note.kind === 'snack' ? motion.ms.snackShow : motion.ms.toastShow);
    return () => clearTimeout(t);
  }, [leave, note.kind, note.text, shown, slide]);

  const style = useAnimatedStyle(() => (slide ? { transform: [{ translateY: (1 - shown.get()) * (height.get() + space.lg + insets.bottom) }] } : { opacity: shown.get() }));

  return (
    <Animated.View
      style={[note.kind === 'snack' ? styles.snackWrap : styles.toastWrap, { bottom: insets.bottom + space.lg }, style]}
      pointerEvents="box-none"
      onLayout={(e) => {
        height.set(e.nativeEvent.layout.height);
      }}
    >
      <View style={note.kind === 'snack' ? styles.snack : styles.toast} accessibilityLiveRegion="polite">
        <Txt variant="small" color={tokens.onInk} style={{ flexShrink: 1, fontFamily: fonts.medium }}>
          {note.text}
        </Txt>
        {note.action && (
          <Press
            label={note.action.label}
            onPress={() => {
              note.action!.onPress();
              leave();
            }}
            style={styles.act}
          >
            <Txt variant="label" color={tokens.onInk} style={{ fontFamily: fonts.bold }}>
              {note.action.label}
            </Txt>
          </Press>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.lg },
  snackWrap: { position: 'absolute', left: space.sm, right: space.sm },
  toast: { flexDirection: 'row', backgroundColor: tokens.ink, borderRadius: radius.pill, paddingHorizontal: space.xl, paddingVertical: space.md, maxWidth: u(400) },
  snack: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: tokens.ink, borderRadius: radius.card, paddingLeft: space.xl, paddingRight: space.sm, minHeight: u(56), maxWidth: u(560), width: '100%', alignSelf: 'center' },
  act: { height: u(44), paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
});
