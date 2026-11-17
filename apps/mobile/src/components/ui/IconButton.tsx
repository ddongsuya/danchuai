import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { u } from '@/constants/theme';

import { Press } from './Press';

export function IconButton({ label, onPress, children, plain }: { label: string; onPress: () => void; children: ReactNode; plain?: boolean }) {
  return (
    <Press label={label} onPress={onPress} style={[styles.btn, plain && styles.plain]}>
      {children}
    </Press>
  );
}

const styles = StyleSheet.create({
  // 시안 .ic: 44 원형 누름 영역, 바탕·테두리 없음
  btn: { width: u(44), height: u(44), borderRadius: u(22), alignItems: 'center', justifyContent: 'center' },
  plain: { backgroundColor: 'transparent', borderWidth: 0 },
});
