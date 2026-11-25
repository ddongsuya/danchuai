// 요청함(Manus 작업 목록 방식). 의뢰자와 기관이 같은 틀을 쓰고 항목과 상태 이름만 다르다.
// 진단 문서 A05 "② 새 요청 버튼 하나"(사용자 선택 2026-11-17): 새 요청은 바닥에 붙은 버튼 하나, 질문하기는 머리줄, 검색은 없음.
// 기관(A06)은 앱에서 요청을 만들지 않으므로 바닥 버튼이 없다.
// 두 역할 모두 첫 화면은 비서(2026-11-20). 요청함은 비서 메뉴에서 열고, 왼쪽 위 버튼으로 비서에 돌아간다.
import { router, type Href } from 'expo-router';
import { CaretLeft, ChatCircle, Dna, Drop, Flask, Plus } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Press } from '@/components/ui/Press';
import { StateView } from '@/components/ui/StateView';
import { Txt } from '@/components/ui/Txt';
import { AgentHeader } from '@/components/shell/AgentHeader';
import { fonts, radius, space, tokens, u } from '@/constants/theme';

import type { InboxItem, InboxStatus } from '@/lib/inbox';

export const STATUS_CHIP: Record<InboxStatus, { label: string; kind: ChipTone }> = {
  new: { label: '새 요청', kind: 'wait' },
  viewed: { label: '확인', kind: 'mute' },
  waiting: { label: '허용 전', kind: 'wait' },
  drafting: { label: '작성 중', kind: 'mute' },
  sent: { label: '보냄', kind: 'mute' },
  replied: { label: '회신 도착', kind: 'wait' },
  selected: { label: '선정 완료', kind: 'accent' },
  not_selected: { label: '미선정', kind: 'mute' },
  closed: { label: '닫힘', kind: 'mute' },
};

const icons = { flask: Flask, dna: Dna, drop: Drop };

interface Props {
  role: 'requester' | 'cro';
  title?: string;
  items: InboxItem[];
  filters: { label: string; match: InboxStatus[] | null }[];
  /** 서버에서 읽는 중이면 loading, 실패면 error. 없으면 ready */
  load?: 'loading' | 'error' | 'ready';
  errorLabel?: string;
  onRetry?: () => void;
  emptyLabel?: string;
  hrefOf: (id: string) => Href;
  /** 할 일 탭 안에서(Muse 시안 2026-11-25): 뒤로 가기 대신 비서 위 막대, 아래 안전 영역은 탭 막대가 맡는다 */
  inTab?: boolean;
}

export function InboxScreen({ role, title = '요청함', items, filters, load = 'ready', errorLabel, onRetry, emptyLabel = '아직 요청이 없어요', hrefOf, inTab }: Props) {
  const [active, setActive] = useState(0);
  // 거름 칸은 화면마다 정한 것만(의뢰자 3칸, 기관 4칸). 건수는 1 이상일 때만 숫자로 붙는다. 숫자는 고정폭.
  const tabs = useMemo(() => filters.map((f) => ({ ...f, count: f.match ? items.filter((i) => f.match!.includes(i.status)).length : items.length })), [filters, items]);
  const current = tabs[active] ?? tabs[0];
  const shown = useMemo(() => (current?.match ? items.filter((i) => current.match!.includes(i.status)) : items), [current, items]);

  return (
    <SafeAreaView style={styles.root} edges={inTab ? ['top'] : ['top', 'bottom']}>
      <View style={styles.root}>
        {inTab ? (
          <AgentHeader />
        ) : (
        <View style={styles.nav}>
          {/* 받은 요청·요청함은 비서 메뉴에서 연다. 계정·화면 바꾸기도 비서 메뉴에 있다 */}
          <IconButton label="비서에게 돌아가기" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <CaretLeft size={u(22)} color={tokens.text} />
          </IconButton>
          <Press label="질문하기" onPress={() => router.push({ pathname: '/ask', params: { role } })} style={styles.ask}>
            <ChatCircle size={u(16)} color={tokens.text} />
            <Txt variant="small" style={{ fontFamily: fonts.semibold }}>
              질문하기
            </Txt>
          </Press>
        </View>
        )}
        <Txt variant={inTab ? 'museTitle' : 'title'} accessibilityRole="header" style={inTab ? styles.tabTitle : styles.title}>
          {title}
        </Txt>
        {load === 'ready' && items.length > 0 && (
          <View style={styles.filters} accessibilityRole="tablist">
            {tabs.map((f, i) => {
              const on = f === current;
              return (
                <Press
                  key={f.label}
                  label={f.match && f.count > 0 ? `${f.label} ${f.count}건` : f.label}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => setActive(i)}
                  style={[styles.filter, on && styles.filterOn]}
                >
                  <Txt variant="small" color={on ? tokens.onInk : tokens.text} style={{ fontFamily: fonts.semibold }}>
                    {f.label}
                  </Txt>
                  {f.match && f.count > 0 ? (
                    <Txt variant="small" tabular color={on ? tokens.onInk : tokens.accent} style={{ fontFamily: fonts.bold }}>
                      {f.count}
                    </Txt>
                  ) : null}
                </Press>
              );
            })}
          </View>
        )}
        {load === 'loading' ? (
          <Skeleton />
        ) : load === 'error' ? (
          <View style={styles.state}>
            <StateView
              tone="error"
              title={errorLabel ?? '목록을 못 불러왔어요'}
              reason="인터넷 연결을 확인하고 다시 눌러 주세요"
              actions={onRetry ? <Button title="다시 시도" kind="soft" tall onPress={onRetry} /> : undefined}
            />
          </View>
        ) : !items.length ? (
          <View style={styles.state}>
            <StateView tone="empty" title={emptyLabel} />
          </View>
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(i) => i.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const Icon = icons[item.icon];
              const chip = STATUS_CHIP[item.status];
              const fresh = item.status === 'new' || item.status === 'replied';
              return (
                <Press label={`${item.title}, ${chip.label}`} onPress={() => router.push(hrefOf(item.id))} style={styles.item}>
                  <View style={styles.ico}>
                    <Icon size={u(20)} color={tokens.muted} />
                    {fresh && <View style={styles.dot} />}
                  </View>
                  <View style={{ flex: 1, gap: u(6) }}>
                    <Txt variant="label" style={{ fontFamily: fonts.semibold }} numberOfLines={1}>
                      {item.title}
                    </Txt>
                    <View style={styles.meta}>
                      <Chip label={chip.label} kind={chip.kind} />
                      <Txt variant="caption" color={tokens.muted} tabular numberOfLines={1} style={{ flexShrink: 1 }}>
                        {item.due ?? item.when}
                      </Txt>
                    </View>
                  </View>
                </Press>
              );
            }}
          />
        )}
        {role === 'requester' && (
          <View style={styles.bottom}>
            <Button title="새 요청" tall icon={<Plus size={u(18)} weight="bold" color={tokens.onInk} />} onPress={() => router.push({ pathname: '/requester/[id]', params: { id: 'new' } })} />
          </View>
        )}

      </View>
    </SafeAreaView>
  );
}

/** 최종 목록 모양의 뼈대 */
function Skeleton() {
  return (
    <View style={styles.list} accessibilityLabel="불러오는 중이에요" accessibilityRole="progressbar">
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.item}>
          <View style={styles.ico} />
          <View style={{ flex: 1, gap: u(8) }}>
            <View style={[styles.bone, { width: '62%' }]} />
            <View style={[styles.bone, { width: u(96), height: u(22), borderRadius: radius.pill }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: u(14), paddingTop: u(6), paddingBottom: u(10) },
  ask: { flexDirection: 'row', alignItems: 'center', gap: u(6), height: u(36), paddingHorizontal: u(14), borderRadius: radius.pill, backgroundColor: tokens.sunken },
  title: { paddingHorizontal: space.xl, paddingTop: u(4), paddingBottom: space.md },
  tabTitle: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12 },
  filters: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.xl, paddingBottom: u(14) },
  filter: { flexDirection: 'row', alignItems: 'center', gap: u(6), height: u(36), paddingHorizontal: u(14), borderRadius: radius.pill, backgroundColor: tokens.sunken, justifyContent: 'center' },
  filterOn: { backgroundColor: tokens.ink },
  bottom: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  list: { paddingHorizontal: space.md, gap: u(2), paddingBottom: space.lg },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: u(16) },
  ico: { width: u(44), height: u(44), borderRadius: u(14), backgroundColor: tokens.sunken, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: u(-2), right: u(-2), width: u(10), height: u(10), borderRadius: u(5), backgroundColor: tokens.ink, borderWidth: 2, borderColor: tokens.bg },
  state: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xxl },
  bone: { height: u(14), borderRadius: u(7), backgroundColor: tokens.sunken },
});
