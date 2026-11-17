// 기관: 단추에서 받은 요청 한 건의 진행 (연동 2단계, 읽기만). 선정 전에는 의뢰자 회사 대신 단추가 준 표시만.
// 참여·견적 제출은 연동 4단계에서 승인 카드로 연다. 지금은 단추에서 한다.
import { ArrowClockwise, ArrowSquareOut, Check, CircleDashed, HourglassMedium, WarningCircle } from 'phosphor-react-native';
import { useCallback } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { ChatShell } from '@/components/chat/ChatShell';
import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { DANCHU_URL } from '@/lib/danchuLinks';
import { daysLeft, shortDate } from '@/lib/format';
import { fetchDanchuLabRequest, type DanchuLabItem } from '@/lib/marketClient';

export function DanchuLab({ no }: { no: string }) {
  const load = useCallback(() => fetchDanchuLabRequest(no), [no]);
  const { state, reload } = useRemote(load);

  if (state.kind !== 'ready') {
    return (
      <ChatShell title="받은 요청" bottom={null}>
        {state.kind === 'loading' ? (
          <View accessibilityLabel="불러오는 중" accessibilityRole="progressbar" style={{ gap: space.md }}>
            <View style={[styles.bone, { width: '60%' }]} />
            <View style={[styles.card, { height: 200 }]} />
          </View>
        ) : (
          <View style={styles.err} accessibilityRole="alert">
            <WarningCircle size={16} weight="fill" color={tokens.danger} />
            <Txt variant="caption" color={tokens.danger} style={{ fontFamily: fonts.semibold, flex: 1 }}>
              {REMOTE_ERROR[state.code]}
            </Txt>
            {state.code !== 'not_found' && <Button title="다시 시도" kind="soft" icon={<ArrowClockwise size={14} color={tokens.text} />} onPress={() => void reload()} />}
          </View>
        )}
      </ChatShell>
    );
  }

  return <DanchuLabView it={state.data} />;
}

const ACT: DanchuLabItem['group'][] = ['todo', 'decide', 'work'];

/** 화면에 그리는 부분만. 미리보기(/preview)는 예시 값으로 이것만 쓴다. */
export function DanchuLabView({ it }: { it: DanchuLabItem }) {
  const open = () => Linking.openURL(`${DANCHU_URL}/cro`);
  // 할 일이 있는 단계에서만 주 버튼 하나. 나머지는 단추로 가는 글자 버튼.
  const act = ACT.includes(it.group);
  const left = daysLeft(it.due);
  return (
    <ChatShell
      title={it.no}
      bottom={
        <View style={styles.bar}>
          {act && <Button title={it.next} tall icon={<ArrowSquareOut size={16} color={tokens.onInk} />} onPress={open} />}
          <Button title="단추에서 열기" kind={act ? 'text' : 'soft'} tall={!act} icon={act ? undefined : <ArrowSquareOut size={16} color={tokens.text} />} onPress={open} />
        </View>
      }
    >
      <View style={{ gap: space.xs }}>
        <Txt variant="small" color={tokens.muted} numberOfLines={2}>
          {`${it.title}, ${it.client ?? it.clientHint}`}
        </Txt>
        <Txt variant="title" accessibilityRole="header">
          {it.next === '할 일 없음' ? it.stage : it.next}
        </Txt>
      </View>

      {act && it.due && left != null && (
        <View style={{ gap: 2 }}>
          <Txt variant="stat" tabular color={left < 0 ? tokens.danger : left <= 2 ? tokens.wait : tokens.text}>
            {left < 0 ? '기한 지남' : left === 0 ? '오늘까지' : `${left}일 남음`}
          </Txt>
          <Txt variant="small" color={tokens.muted} tabular>
            {`${shortDate(it.due)}까지`}
          </Txt>
        </View>
      )}

      <View style={styles.card}>
        {it.steps.map((s, i) => (
          <View key={s.label} style={[styles.tr, i > 0 && styles.line]} accessible accessibilityLabel={`${s.label}, ${s.state === 'done' ? '완료' : s.state === 'now' ? '진행 중' : '예정'}`}>
            {s.state === 'done' ? (
              <Check size={16} weight="bold" color={tokens.accent} />
            ) : s.state === 'now' ? (
              <HourglassMedium size={16} weight="bold" color={tokens.wait} />
            ) : (
              <CircleDashed size={16} color={tokens.faint} />
            )}
            <Txt variant="small" style={[{ flex: 1 }, s.state === 'now' && { fontFamily: fonts.semibold }]} color={s.state === 'next' ? tokens.muted : tokens.text}>
              {s.label}
            </Txt>
            <Txt variant="caption" color={tokens.muted} tabular>
              {s.at}
            </Txt>
          </View>
        ))}
      </View>

      <View style={styles.facts}>
        <Row k="단계" v={it.stage} />
        {!act && it.due && <Row k="기한" v={shortDate(it.due)} />}
        {it.money.map(([k, v]) => (
          <Row key={k} k={k} v={v.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1.$2.$3')} />
        ))}
      </View>
    </ChatShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.fact}>
      <Txt variant="small" color={tokens.muted} style={{ flex: 1 }}>
        {k}
      </Txt>
      <Txt variant="small" tabular style={{ flexShrink: 1, textAlign: 'right' }}>
        {v}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' },
  bone: { height: 16, borderRadius: 8, backgroundColor: tokens.sunken },
  err: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14, gap: space.md },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  fact: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: space.md },
  facts: { paddingTop: space.md, borderTopWidth: 1, borderTopColor: tokens.border },
  bar: { paddingHorizontal: space.md, paddingTop: space.sm, gap: space.xs },
});
