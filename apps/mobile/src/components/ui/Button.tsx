import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { fonts, radius, space, tokens } from '@/constants/theme';

import { Press } from './Press';
import { Spinner } from './Spinner';
import { Txt } from './Txt';

type Kind = 'ink' | 'line' | 'ghost';

interface Props {
  title: string;
  onPress?: () => void;
  kind?: Kind;
  icon?: ReactNode;
  tall?: boolean;
  flex?: number;
  disabled?: boolean;
  /** 처리 중: 누를 수 없고 글자 앞에 작은 표시 */
  loading?: boolean;
}

export function Button({ title, onPress, kind = 'ink', icon, tall, flex, disabled, loading }: Props) {
  const color = kind === 'ink' ? tokens.onInk : kind === 'ghost' ? tokens.muted : tokens.text;
  return (
    <Press label={title} onPress={onPress} disabled={disabled || loading} accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }} style={[styles.base, styles[kind], tall && styles.tall, flex != null && { flex }]}>
      <View style={styles.row}>
        {loading ? <Spinner color={color} /> : icon}
        <Txt variant="label" color={color} style={{ fontFamily: fonts.semibold }} numberOfLines={1}>
          {title}
        </Txt>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  base: { height: 44, paddingHorizontal: 18, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tall: { height: 52 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  ink: { backgroundColor: tokens.ink },
  line: { borderWidth: 1, borderColor: tokens.borderInput },
  ghost: {},
});
