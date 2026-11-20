// 버튼 세 종류: ink(주 버튼, 화면에 하나), soft(회색 채움, 중립 동작), text(글자, 빠지는 동작).
// 테두리 버튼은 쓰지 않는다(토스 결과 화면 방식, Mobbin aaa9c213·678d2a8c).
// 비활성은 흐리게 하지 않고 연한 회색 바탕 + 옅은 글자(대비 4.2:1 이상).
// 처리 중에는 글자 대신 점 셋. 폭은 그대로 두고, loadingTitle 이 있으면 "요청할게요"처럼 그 말과 함께 보인다.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { fonts, radius, space, tokens, u, uc } from '@/constants/theme';

import { Dots } from './Dots';
import { Press } from './Press';
import { Txt } from './Txt';

export type ButtonKind = 'ink' | 'soft' | 'text';

interface Props {
  title: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: ReactNode;
  tall?: boolean;
  flex?: number;
  disabled?: boolean;
  loading?: boolean;
  /** 처리 중에 보일 말(할까요 → 할게요) */
  loadingTitle?: string;
  /** 키보드 바로 위에 붙는 폭 전체 막대 */
  bar?: boolean;
  /** 대화 화면 크기(1.1배, theme CHAT_SCALE) */
  chat?: boolean;
}

const fg: Record<ButtonKind, string> = { ink: tokens.onInk, soft: tokens.text, text: tokens.muted };

export function Button({ title, onPress, kind = 'ink', icon, tall, flex, disabled, loading, loadingTitle, bar, chat }: Props) {
  const label = chat ? 'chatLabel' : 'label';
  const off = disabled && !loading;
  const color = off ? tokens.faint : fg[kind];
  return (
    <Press
      label={loading && loadingTitle ? loadingTitle : title}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[styles.base, chat && styles.chat, styles[kind], kind === 'text' && chat && styles.chatText, tall && (chat ? styles.chatTall : styles.tall), bar && styles.bar, off && kind !== 'text' && styles.off, flex != null && { flex }]}
    >
      {/* 글자는 자리만 지켜 폭이 바뀌지 않게 한다 */}
      <View style={[styles.row, loading && styles.hide]}>
        {icon}
        <Txt variant={label} color={color} style={{ fontFamily: fonts.semibold }} numberOfLines={1}>
          {title}
        </Txt>
      </View>
      {loading && (
        <View style={styles.over}>
          {loadingTitle ? (
            <Txt variant={label} color={color} style={{ fontFamily: fonts.semibold }} numberOfLines={1}>
              {loadingTitle}
            </Txt>
          ) : null}
          <Dots color={color} />
        </View>
      )}
    </Press>
  );
}

const styles = StyleSheet.create({
  base: { height: u(44), paddingHorizontal: u(18), borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tall: { height: u(52) },
  chat: { height: uc(38), paddingHorizontal: uc(16) },
  chatTall: { height: uc(46) },
  chatText: { paddingHorizontal: uc(10) },
  bar: { height: u(56), borderRadius: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  hide: { opacity: 0 },
  over: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  ink: { backgroundColor: tokens.ink },
  soft: { backgroundColor: tokens.sunken },
  text: { paddingHorizontal: space.md },
  off: { backgroundColor: tokens.sunken },
});
