// 요청함(Manus 작업 목록 방식). 의뢰자와 기관이 같은 틀을 쓰고 항목과 상태 이름만 다르다.
// 들어가는 곳은 아래 입력창 하나(결정 E3 ①). 의뢰자의 첫 말은 코드가 질문과 요청으로 가른다(firstMessageIntent).
// 기관은 앱에서 요청을 만들지 않으므로 입력창이 질문하기로 간다.
import { firstMessageIntent } from '@danchuai/core';
import { router, type Href } from 'expo-router';
import { ClockCounterClockwise, Dna, Drop, Flask, User, UserSwitch } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Composer } from '@/components/chat/Composer';
import { Button } from '@/components/ui/Button';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Press } from '@/components/ui/Press';
import { StateView } from '@/components/ui/StateView';
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
  switchTo: Href;
  switchLabel: string;
  /** 입력창 안내 */
  placeholder: string;
}

export function InboxScreen({ role, title = '요청함', items, filters, load = 'ready', errorLabel, onRetry, emptyLabel = '요청 없음', hrefOf, switchTo, switchLabel, placeholder }: Props) {
  const { status } = useAuth();
  const [active, setActive] = useState(0);
  // 거름은 건수가 있는 것만 보인다(전체는 늘). 숫자는 고정폭.
  const tabs = useMemo(
    () => filters.map((f) => ({ ...f, count: f.match ? items.filter((i) => f.match!.includes(i.status)).length : items.length })).filter((f) => !f.match || f.count > 0),
    [filters, items],
  );
  const current = tabs[active] ?? tabs[0];
  const shown = useMemo(() => (current?.match ? items.filter((i) => current.match!.includes(i.status)) : items), [current, items]);

  const start = (text: string) => {
    const intent = role === 'cro' ? 'ask' : firstMessageIntent(text);
    if (intent === 'ask') router.push({ pathname: '/ask', params: { role, seed: text } });
    else router.push({ pathname: '/requester/[id]', params: { id: 'new', seed: text } });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          <IconButton label="지난 질문" onPress={() => router.push({ pathname: '/ask', params: { role } })}>
            <ClockCounterClockwise size={20} color={tokens.text} />
          </IconButton>
        </View>
        <Txt variant="title" accessibilityRole="header" style={styles.title}>
          {title}
        </Txt>
        {load === 'ready' && items.length > 0 && (
          <View style={styles.filters} accessibilityRole="tablist">
            {tabs.map((f, i) => {
              const on = f === current;
              return (
                <Press
                  key={f.label}
                  label={f.match ? `${f.label} ${f.count}건` : f.label}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => setActive(i)}
                  style={[styles.filter, on && styles.filterOn]}
                >
                  <Txt variant="small" color={on ? tokens.onInk : tokens.muted} style={{ fontFamily: fonts.semibold }}>
                    {f.label}
                  </Txt>
                  {f.match ? (
                    <Txt variant="small" tabular color={on ? tokens.onInk : tokens.text} style={{ fontFamily: fonts.bold }}>
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
              title={errorLabel ?? '목록을 불러오지 못했어요'}
              reason="인터넷 연결을 확인하고 다시 시도해 주세요."
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
                    <Txt variant="caption" color={tokens.muted} tabular style={{ marginTop: 3 }} numberOfLines={1}>
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
        <View style={styles.bottom}>
          <Composer placeholder={placeholder} onSend={start} />
        </View>
      </KeyboardAvoidingView>
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
  title: { paddingHorizontal: space.xl, paddingTop: 4, paddingBottom: space.md },
  filters: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.xl, paddingBottom: 14 },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, justifyContent: 'center' },
  filterOn: { backgroundColor: tokens.ink, borderColor: tokens.ink },
  bottom: { paddingBottom: space.md },
  list: { paddingHorizontal: space.md, gap: 2, paddingBottom: space.lg },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: 16 },
  ico: { width: 44, height: 44, borderRadius: 14, backgroundColor: tokens.sunken, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -2, right: -2, width: 11, height: 11, borderRadius: 6, backgroundColor: tokens.accent, borderWidth: 2, borderColor: tokens.bg },
  right: { alignItems: 'flex-end', gap: 6 },
  state: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xxl },
  bone: { height: 14, borderRadius: 7, backgroundColor: tokens.sunken },
});
