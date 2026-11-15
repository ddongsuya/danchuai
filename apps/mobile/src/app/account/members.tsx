// 구성원 목록(같은 조직). 이름과 역할만 보여 준다.
import { ArrowClockwise } from 'phosphor-react-native';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Txt } from '@/components/ui/Txt';
import { radius, space, tokens } from '@/constants/theme';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { fetchMembers } from '@/lib/accountClient';
import { initialOf } from '@/lib/format';

export default function Members() {
  const load = useCallback(() => fetchMembers(), []);
  const { state, reload } = useRemote(load);
  return (
    <AuthScreen back title="구성원" footer={null}>
      {state.kind === 'loading' ? (
        <View style={[styles.grp, { height: 160 }]} accessibilityLabel="불러오는 중" accessibilityRole="progressbar" />
      ) : state.kind === 'error' ? (
        <View style={{ gap: space.md, alignItems: 'flex-start' }} accessibilityRole="alert">
          <Txt variant="label">{REMOTE_ERROR[state.code === 'not_found' ? 'other' : state.code]}</Txt>
          <Button title="다시 시도" kind="line" icon={<ArrowClockwise size={14} color={tokens.text} />} onPress={() => void reload()} />
        </View>
      ) : (
        <View style={styles.grp}>
          {state.data.map((m, i) => (
            <View key={i} style={[styles.row, i > 0 && styles.line]}>
              <View style={styles.av}>
                <Txt variant="label" color={tokens.muted}>
                  {initialOf(m.name ?? '?')}
                </Txt>
              </View>
              <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
                {m.name ?? '이름 없음'}
              </Txt>
              {m.me && <Chip label="나" />}
              <Chip label={m.role === 'owner' ? '소유자' : '구성원'} kind={m.role === 'owner' ? 'accent' : 'mute'} />
            </View>
          ))}
        </View>
      )}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  grp: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 60 },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  av: { width: 36, height: 36, borderRadius: 18, backgroundColor: tokens.sunken, alignItems: 'center', justifyContent: 'center' },
});
