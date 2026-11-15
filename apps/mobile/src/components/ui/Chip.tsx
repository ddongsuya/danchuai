import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { fonts, radius, tokens } from '@/constants/theme';

import { Txt } from './Txt';

export type ChipTone = 'accent' | 'wait' | 'mute';

const tone = {
  accent: { bg: tokens.accentSoft, fg: tokens.accent },
  wait: { bg: tokens.waitSoft, fg: tokens.wait },
  mute: { bg: tokens.sunken, fg: tokens.muted },
} as const;

export function Chip({ label, kind = 'mute', icon }: { label: string; kind?: ChipTone; icon?: (color: string) => ReactNode }) {
  const t = tone[kind];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      {icon?.(t.fg)}
      <Txt variant="caption" color={t.fg} style={{ fontFamily: fonts.bold }}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { height: 26, paddingHorizontal: 10, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
});
