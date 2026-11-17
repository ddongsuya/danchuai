// 받는 기관 고르기(시안 v4 A1). 가입 기관 전체를 서버가 준 가나다순 그대로 보여 준다. 추천·순위 없음.
import { ArrowClockwise, Check, MagnifyingGlass, X } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Recipient } from '@/components/chat/ApprovalCard';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { fetchLabs, initialOf } from '@/lib/marketClient';

interface Props {
  initial: Recipient[];
  onClose: () => void;
  onDone: (picked: Recipient[]) => void;
}

export function LabPicker({ initial, onClose, onDone }: Props) {
  const { state, reload } = useRemote(fetchLabs);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Recipient[]>(initial);
  const labs = useMemo(() => (state.kind === 'ready' ? state.data : []), [state]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? labs.filter((l) => l.name.toLowerCase().includes(t)) : labs;
  }, [labs, q]);
  const on = (id: string) => picked.some((p) => p.id === id);
  const toggle = (l: { id: string; name: string }) =>
    setPicked((p) => (p.some((x) => x.id === l.id) ? p.filter((x) => x.id !== l.id) : [...p, { id: l.id, name: l.name, short: initialOf(l.name) }]));

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.nav}>
        <IconButton label="닫기" onPress={onClose}>
          <X size={20} color={tokens.text} />
        </IconButton>
        <Txt variant="nav" style={styles.title} accessibilityRole="header">
          받는 기관
        </Txt>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.search}>
        <View style={{ width: 18, height: 18 }}>
          <MagnifyingGlass size={18} color={tokens.muted} />
        </View>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="기관 이름"
          accessibilityLabel="기관 이름 검색"
          placeholderTextColor={tokens.faint}
          selectionColor={tokens.accent}
          style={styles.input}
          returnKeyType="search"
        />
      </View>

      {picked.length > 0 && (
        <View style={styles.picked}>
          {picked.map((p) => (
            <Press key={p.id} label={`${p.name} 빼기`} onPress={() => toggle(p)} style={styles.who}>
              <View style={styles.av}>
                <Txt variant="caption" color={tokens.muted} style={{ fontFamily: fonts.bold, fontSize: 12 }}>
                  {p.short ?? initialOf(p.name)}
                </Txt>
              </View>
              <Txt variant="small" style={{ fontFamily: fonts.semibold }} numberOfLines={1}>
                {p.name}
              </Txt>
              <X size={14} weight="bold" color={tokens.muted} />
            </Press>
          ))}
        </View>
      )}

      {state.kind === 'loading' ? (
        <View accessibilityLabel="불러오는 중" accessibilityRole="progressbar">
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.lab, i > 0 && styles.line]}>
              <View style={styles.lav} />
              <View style={[styles.bone, { width: `${48 - i * 6}%` }]} />
            </View>
          ))}
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.state} accessibilityRole="alert">
          <Txt variant="label">{REMOTE_ERROR[state.code]}</Txt>
          <Button title="다시 시도" kind="soft" icon={<ArrowClockwise size={14} color={tokens.text} />} onPress={() => void reload()} />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(l) => l.id}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          ListHeaderComponent={
            <Txt variant="caption" color={tokens.muted} style={styles.sect}>
              {q.trim() ? `검색 결과 ${shown.length}곳` : `가입 기관 ${labs.length}곳`}
            </Txt>
          }
          ListEmptyComponent={
            <Txt variant="small" color={tokens.muted} style={styles.empty}>
              {labs.length ? '검색 결과 없음' : '가입 기관 없음'}
            </Txt>
          }
          renderItem={({ item, index }) => {
            const sel = on(item.id);
            return (
              <Press
                label={item.name}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: sel }}
                onPress={() => toggle(item)}
                style={[styles.lab, index > 0 && styles.line]}
              >
                <View style={styles.lav}>
                  <Txt variant="label" color={tokens.muted} style={{ fontFamily: fonts.bold }}>
                    {initialOf(item.name)}
                  </Txt>
                </View>
                <Txt variant="label" style={{ flex: 1, fontSize: 15.5 }} numberOfLines={1}>
                  {item.name}
                </Txt>
                <View style={[styles.ck, sel && styles.ckOn]}>{sel && <Check size={15} weight="bold" color={tokens.onInk} />}</View>
              </Press>
            );
          }}
        />
      )}

      <View style={styles.foot}>
        <Button title={picked.length ? `${picked.length}곳 선택` : '기관 선택'} tall disabled={!picked.length} onPress={() => onDone(picked)} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10 },
  title: { flex: 1, textAlign: 'center' },
  search: { marginHorizontal: space.xl, marginBottom: space.md, height: 46, borderRadius: 14, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.borderInput, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  input: { flex: 1, minWidth: 0, height: '100%', fontFamily: fonts.regular, fontSize: 16, color: tokens.text },
  picked: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: space.xl, paddingBottom: space.md },
  who: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 32, paddingLeft: 4, paddingRight: 8, borderRadius: radius.pill, backgroundColor: tokens.sunken, maxWidth: '100%' },
  av: { width: 24, height: 24, borderRadius: 12, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
  sect: { paddingHorizontal: space.xl, paddingTop: 10, paddingBottom: 6, fontFamily: fonts.bold },
  lab: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, minHeight: 60 },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  lav: { width: 40, height: 40, borderRadius: 12, backgroundColor: tokens.sunken, alignItems: 'center', justifyContent: 'center' },
  ck: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: tokens.borderInput, alignItems: 'center', justifyContent: 'center' },
  ckOn: { backgroundColor: tokens.ink, borderColor: tokens.ink },
  bone: { height: 14, borderRadius: 7, backgroundColor: tokens.sunken },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  empty: { textAlign: 'center', paddingTop: 40 },
  foot: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm, borderTopWidth: 1, borderTopColor: tokens.border, backgroundColor: tokens.bg },
});
