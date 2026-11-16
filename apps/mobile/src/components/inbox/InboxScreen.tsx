// 요청함(Manus 작업 목록 방식). 의뢰자와 기관이 같은 틀을 쓰고 항목과 상태 이름만 다르다.
import { router, type Href } from 'expo-router';
import { ArrowClockwise, BookOpenText, ChatCircle, Dna, Drop, Flask, MagnifyingGlass, Tray, User, UserSwitch, WarningCircle } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { useAuth } from '@/lib/session';

import type { InboxItem, InboxStatus } from '@/lib/inbox';

const statusChip: Record<InboxStatus, { label: string; kind: ChipTone }> = {
  new: { label: '새 요청', kind: 'accent' },
  viewed: { label: '확인', kind: 'mute' },
  waiting: { label: '승인 대기', kind: 'wait' },
  drafting: { label: '작성 중', kind: 'mute' },
  sent: { label: '보냄', kind: 'mute' },
  replied: { label: '회신 도착', kind: 'accent' },
  selected: { label: '선정 완료', kind: 'accent' },
  not_selected: { label: '미선정', kind: 'mute' },
  closed: { label: '닫힘', kind: 'mute' },
};

const icons = { flask: Flask, dna: Dna, drop: Drop };

interface Props {
  title?: string;
  items: InboxItem[];
  filters: { label: string; match: InboxStatus[] | null }[];
  /** 서버에서 읽는 중이면 loading, 실패면 error. 없으면 ready */
  load?: 'loading' | 'error' | 'ready';
  errorLabel?: string;
  onRetry?: () => void;
  emptyLabel?: string;
  hrefOf: (id: string) => Href;
  switchTo: Href;
  switchLabel: string;
  newLabel: string;
  newHref?: Href;
  /** 가이드라인 질문하기 */
  askHref?: Href;
}

export function InboxScreen({ title = '요청함', items, filters, load = 'ready', errorLabel, onRetry, emptyLabel = '요청 없음', hrefOf, switchTo, switchLabel, newLabel, newHref, askHref }: Props) {
  const { status } = useAuth();
  const [active, setActive] = useState(0);
  const shown = useMemo(() => {
    const m = filters[active]?.match;
    return m ? items.filter((i) => m.includes(i.status)) : items;
  }, [active, filters, items]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.nav}>
        {status === 'disabled' ? (
          // 시연 모드에서만 의뢰자·기관 화면을 오간다. 로그인하면 조직 종류로 정해진다.
          <IconButton label={switchLabel} onPress={() => router.replace(switchTo)}>
            <UserSwitch size={20} color={tokens.text} />
          </IconButton>
        ) : (
          <IconButton label="계정" onPress={() => router.push('/account')}>
            <User size={20} color={tokens.text} />
          </IconButton>
        )}
        <View style={styles.navRight}>
          {askHref && (
            <Press label="질문하기" onPress={() => router.push(askHref)} style={styles.ask}>
              <BookOpenText size={18} color={tokens.text} />
              <Txt variant="label" style={{ fontFamily: fonts.semibold }}>
                질문하기
              </Txt>
            </Press>
          )}
          <IconButton label="검색">
            <MagnifyingGlass size={20} color={tokens.text} />
          </IconButton>
        </View>
      </View>
      <Txt variant="title" accessibilityRole="header" style={styles.title}>
        {title}
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
      {load === 'loading' ? (
        <Skeleton />
      ) : load === 'error' ? (
        <View style={styles.state} accessibilityRole="alert">
          <WarningCircle size={28} color={tokens.danger} />
          <Txt variant="label">{errorLabel ?? '불러오지 못했어요'}</Txt>
          {onRetry && <Button title="다시 시도" kind="line" icon={<ArrowClockwise size={14} color={tokens.text} />} onPress={onRetry} />}
        </View>
      ) : !items.length ? (
        <View style={styles.state}>
          <View style={styles.ei}>
            <Tray size={28} color={tokens.muted} />
          </View>
          <Txt variant="heading">{emptyLabel}</Txt>
        </View>
      ) : (
      <FlatList
        data={shown}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Txt variant="small" color={tokens.muted} style={styles.empty}>
            해당 요청 없음
          </Txt>
        }
        renderItem={({ item }) => {
          const Icon = icons[item.icon];
          const chip = statusChip[item.status];
          const fresh = item.status === 'new' || item.status === 'replied';
          return (
            <Press label={`${item.title}, ${chip.label}`} onPress={() => router.push(hrefOf(item.id))} style={styles.item}>
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
      )}
      {newHref && (
      <Press label={newLabel} onPress={newHref ? () => router.push(newHref) : undefined} style={styles.fab}>
        <ChatCircle size={20} weight="bold" color={tokens.onInk} />
        <Txt variant="label" color={tokens.onInk} style={{ fontFamily: fonts.semibold }}>
          {newLabel}
        </Txt>
      </Press>
      )}
    </SafeAreaView>
  );
}

/** 최종 목록 모양의 뼈대 */
function Skeleton() {
  return (
    <View style={styles.list} accessibilityLabel="불러오는 중" accessibilityRole="progressbar">
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.item}>
          <View style={styles.ico} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[styles.bone, { width: '62%' }]} />
            <View style={[styles.bone, { width: '38%', height: 10 }]} />
          </View>
          <View style={[styles.bone, { width: 56, height: 22, borderRadius: radius.pill }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  nav: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10 },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border },
  title: { paddingHorizontal: space.xl, paddingTop: 4, paddingBottom: space.md },
  filters: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.xl, paddingBottom: 14 },
  filter: { height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, justifyContent: 'center' },
  filterOn: { backgroundColor: tokens.ink, borderColor: tokens.ink },
  list: { paddingHorizontal: space.md, gap: 2, paddingBottom: 120 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: 16 },
  ico: { width: 44, height: 44, borderRadius: 14, backgroundColor: tokens.sunken, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -2, right: -2, width: 11, height: 11, borderRadius: 6, backgroundColor: tokens.accent, borderWidth: 2, borderColor: tokens.bg },
  right: { alignItems: 'flex-end', gap: 6 },
  empty: { textAlign: 'center', paddingTop: 48 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40, paddingBottom: 120 },
  ei: { width: 64, height: 64, borderRadius: 20, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' },
  bone: { height: 14, borderRadius: 7, backgroundColor: tokens.sunken },
  fab: { position: 'absolute', right: space.xl, bottom: 34, height: 54, paddingHorizontal: space.xl, borderRadius: radius.pill, backgroundColor: tokens.ink, flexDirection: 'row', alignItems: 'center', gap: space.sm, shadowColor: tokens.ink, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
});
