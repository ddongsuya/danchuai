// 요청함(Manus 작업 목록 방식). 의뢰자와 기관이 같은 틀을 쓰고 항목과 상태 이름만 다르다.
import { router, type Href } from 'expo-router';
import { ChatCircle, Dna, Drop, Flask, MagnifyingGlass, UserSwitch } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, type ChipTone } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import type { RequestStatus, RequestSummary } from '@/data/demo';

const statusChip: Record<RequestStatus, { label: string; kind: ChipTone }> = {
  new: { label: '새 요청', kind: 'accent' },
  waiting: { label: '승인 대기', kind: 'wait' },
  drafting: { label: '작성 중', kind: 'mute' },
  sent: { label: '보냄', kind: 'mute' },
  replied: { label: '회신 도착', kind: 'accent' },
};

const icons = { flask: Flask, dna: Dna, drop: Drop };

interface Props {
  items: RequestSummary[];
  filters: { label: string; match: RequestStatus[] | null }[];
  hrefOf: (id: string) => Href;
  switchTo: Href;
  switchLabel: string;
  newLabel: string;
}

export function InboxScreen({ items, filters, hrefOf, switchTo, switchLabel, newLabel }: Props) {
  const [active, setActive] = useState(0);
  const shown = useMemo(() => {
    const m = filters[active]?.match;
    return m ? items.filter((i) => m.includes(i.status)) : items;
  }, [active, filters, items]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.nav}>
        <IconButton label={switchLabel} onPress={() => router.replace(switchTo)}>
          <UserSwitch size={20} color={tokens.text} />
        </IconButton>
        <IconButton label="검색">
          <MagnifyingGlass size={20} color={tokens.text} />
        </IconButton>
      </View>
      <Txt variant="title" accessibilityRole="header" style={styles.title}>
        요청함
      </Txt>
      <View style={styles.filters} accessibilityRole="tablist">
        {filters.map((f, i) => (
          <Press
            key={f.label}
            label={f.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === active }}
            onPress={() => setActive(i)}
            style={[styles.filter, i === active && styles.filterOn]}
          >
            <Txt variant="small" color={i === active ? tokens.onInk : tokens.muted} style={{ fontFamily: fonts.semibold }}>
              {f.label}
            </Txt>
          </Press>
        ))}
      </View>
      <FlatList
        data={shown}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Txt variant="small" color={tokens.muted} style={styles.empty}>
            해당하는 요청이 없어요
          </Txt>
        }
        renderItem={({ item, index }) => {
          const Icon = icons[item.icon];
          const chip = statusChip[item.status];
          const fresh = item.status === 'new' || item.status === 'replied';
          return (
            <Press label={`${item.title}, ${chip.label}`} onPress={() => router.push(hrefOf(item.id))} style={[styles.item, index === 0 && styles.itemSel]}>
              <View style={styles.ico}>
                <Icon size={20} color={tokens.muted} />
                {fresh && <View style={styles.dot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="label" style={{ fontFamily: fonts.semibold }} numberOfLines={1}>
                  {item.title}
                </Txt>
                <Txt variant="caption" color={tokens.muted} style={{ marginTop: 3 }} numberOfLines={1}>
                  {item.sub}
                </Txt>
              </View>
              <View style={styles.right}>
                <Chip label={chip.label} kind={chip.kind} />
                <Txt variant="caption" color={tokens.faint} tabular>
                  {item.when}
                </Txt>
              </View>
            </Press>
          );
        }}
      />
      <Press label={newLabel} style={styles.fab}>
        <ChatCircle size={20} weight="bold" color={tokens.onInk} />
        <Txt variant="label" color={tokens.onInk} style={{ fontFamily: fonts.semibold }}>
          {newLabel}
        </Txt>
      </Press>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  nav: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10 },
  title: { paddingHorizontal: space.xl, paddingTop: 4, paddingBottom: space.md },
  filters: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.xl, paddingBottom: 14 },
  filter: { height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, justifyContent: 'center' },
  filterOn: { backgroundColor: tokens.ink, borderColor: tokens.ink },
  list: { paddingHorizontal: space.md, gap: 2, paddingBottom: 120 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: 16 },
  itemSel: { backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border },
  ico: { width: 44, height: 44, borderRadius: 14, backgroundColor: tokens.sunken, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -2, right: -2, width: 11, height: 11, borderRadius: 6, backgroundColor: tokens.accent, borderWidth: 2, borderColor: tokens.bg },
  right: { alignItems: 'flex-end', gap: 6 },
  empty: { textAlign: 'center', paddingTop: 48 },
  fab: { position: 'absolute', right: space.xl, bottom: 34, height: 54, paddingHorizontal: space.xl, borderRadius: radius.pill, backgroundColor: tokens.ink, flexDirection: 'row', alignItems: 'center', gap: space.sm, shadowColor: tokens.ink, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
});
