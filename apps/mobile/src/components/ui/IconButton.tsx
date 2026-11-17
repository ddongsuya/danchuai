import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { tokens } from '@/constants/theme';

import { Press } from './Press';

export function IconButton({ label, onPress, children, plain }: { label: string; onPress: () => void; children: ReactNode; plain?: boolean }) {
  return (
    <Press label={label} onPress={onPress} style={[styles.btn, plain && styles.plain]}>
      {children}
    </Press>
  );
}

const styles = StyleSheet.create({
  btn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border },
  plain: { backgroundColor: 'transparent', borderWidth: 0 },
});
