// 기관: 단추에서 받은 요청 한 건의 진행. 선정 전에는 의뢰자 회사 대신 단추가 준 표시만.
// 참여 결정 전에는 앱에서 참여하기·이번 요청 불참(연동 4단계, 시트에서 승인). 참여 뒤에는 AI와 견적 초안 만들기(말로 맡기는 견적 2단계).
import { ArrowClockwise, ArrowSquareOut, CheckCircle, CircleDashed, HourglassMedium, WarningCircle } from 'phosphor-react-native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { ChatShell } from '@/components/chat/ChatShell';
import { DanchuDeclineSheet, DanchuJoinSheet } from '@/components/lab/DanchuJoinSheets';
import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
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
            <View style={[styles.card, { height: u(200) }]} />
          </View>
        ) : (
          <View style={styles.err} accessibilityRole="alert">
            <WarningCircle size={u(16)} weight="fill" color={tokens.danger} />
            <Txt variant="caption" color={tokens.danger} style={{ fontFamily: fonts.semibold, flex: 1 }}>
              {REMOTE_ERROR[state.code]}
            </Txt>
            {state.code !== 'not_found' && <Button title="다시 시도" kind="soft" icon={<ArrowClockwise size={u(14)} color={tokens.text} />} onPress={() => void reload()} />}
          </View>
        )}
      </ChatShell>
    );
  }

  return <DanchuLabView it={state.data} onChanged={() => void reload()} />;
}

const ACT: DanchuLabItem['group'][] = ['todo', 'decide', 'work'];

/** 할 일을 제목(질문형)과 버튼 이름으로. 참여 결정은 진단 문서 A12 반영안 문구, 나머지는 단추 진행판의 다음 할 일 그대로 */
/** 시안 A12(사용자 선택 2026-11-17 "시안대로"): 제목 위 줄은 "시험, 동물". 동물은 요청 제목에서 찾는다 */
const SPECIES = ['랫드', '마우스', '비글견', '토끼', '기니피그', '미니피그', '원숭이', '햄스터'];
function labLine(it: DanchuLabItem) {
  const sp = SPECIES.find((x) => it.title.includes(x));
  return [it.categories, sp].filter(Boolean).join(', ') || it.title;
}

/**
 * AI와 견적을 쓸 수 있는 요청: 참여한 뒤 견적을 쓰는 중이거나, 제출했지만 비교표가 열리기 전(고칠 수 있음).
 * 서버가 단추에서 한 번 더 확인한다(회신이 닫혔으면 대화를 열지 않는다).
 */
export function canQuote(it: Pick<DanchuLabItem, 'join' | 'group' | 'stage' | 'next'>): boolean {
  if (it.join) return false;
  if ((it.group === 'todo' || it.group === 'work') && (it.stage === '참여' || it.stage === '작성 중')) return true;
  return it.group === 'sent' && it.next === '비교표 열리면 알려요';
}

function task(it: DanchuLabItem) {
  if (it.join || it.group === 'decide') return { title: '참여 여부를\n정해 주세요', button: '단추에서 참여 정하기' };
  return { title: it.next === '할 일 없음' ? it.stage : it.next, button: `단추에서 ${it.next}` };
}

/** 화면에 그리는 부분만. 미리보기(/preview)는 예시 값으로 이것만 쓴다. */
export function DanchuLabView({ it, onChanged, initialSheet = null }: { it: DanchuLabItem; onChanged?: () => void; initialSheet?: 'join' | 'decline' | null }) {
  const open = () => Linking.openURL(`${DANCHU_URL}/cro`);
  const [sheet, setSheet] = useState<'join' | 'decline' | null>(initialSheet);
  const done = () => {
    setSheet(null);
    onChanged?.();
  };
  // 할 일이 있는 단계에서만 주 버튼 하나. 나머지는 단추로 가는 글자 버튼.
  const act = ACT.includes(it.group);
  const left = daysLeft(it.due);
  const t = task(it);
  const quotable = canQuote(it);
  return (
    <ChatShell
      title={it.no}
      bottom={
        <View style={styles.bar}>
          {it.join ? (
            <>
              <Button title="참여하기" tall onPress={() => setSheet('join')} />
              <Button title="이번 요청 불참" kind="text" onPress={() => setSheet('decline')} />
            </>
          ) : quotable ? (
            <>
              <Button title="AI와 견적 초안 만들기" tall onPress={() => router.push({ pathname: '/lab/quote/[no]', params: { no: it.no } })} />
              <Button title="단추에서 열기" kind="text" icon={<ArrowSquareOut size={u(16)} color={tokens.muted} />} onPress={open} />
            </>
          ) : act ? (
            <Button title={t.button} tall icon={<ArrowSquareOut size={u(16)} color={tokens.onInk} />} onPress={open} />
          ) : (
            <Button title="단추에서 열기" kind="text" icon={<ArrowSquareOut size={u(16)} color={tokens.muted} />} onPress={open} />
          )}
        </View>
      }
    >
      <View style={{ gap: space.xs }}>
        <Txt variant="small" color={tokens.muted} numberOfLines={2}>
          {it.client ? `${labLine(it)}, ${it.client}` : labLine(it)}
        </Txt>
        <Txt variant="title" accessibilityRole="header">
          {t.title}
        </Txt>
      </View>

      {act && it.due && left != null && (
        <View style={{ gap: u(2) }}>
          <View style={styles.stat}>
            <Txt variant="stat" tabular color={left < 0 ? tokens.danger : tokens.text}>
              {left < 0 ? '기한 지남' : left === 0 ? '오늘까지' : `${left}일`}
            </Txt>
            {left > 0 && (
              <Txt variant="label" style={{ fontFamily: fonts.semibold }}>
                {' 남음'}
              </Txt>
            )}
          </View>
          <Txt variant="small" color={tokens.muted} tabular>
            {`${shortDate(it.due)}까지`}
          </Txt>
        </View>
      )}

      <View style={styles.card}>
        {it.steps.map((s, i) => (
          <View key={s.label} style={[styles.tr, i > 0 && styles.line]} accessible accessibilityLabel={`${s.label}, ${s.state === 'done' ? '완료' : s.state === 'now' ? '진행 중' : '예정'}`}>
            {s.state === 'done' ? (
              <CheckCircle size={u(18)} weight="fill" color={tokens.muted} />
            ) : s.state === 'now' ? (
              <HourglassMedium size={u(18)} color={tokens.wait} />
            ) : (
              <CircleDashed size={u(18)} color={tokens.faint} />
            )}
            <Txt variant="small" style={[{ flex: 1 }, s.state === 'now' && { fontFamily: fonts.semibold }]} color={s.state === 'now' ? tokens.wait : s.state === 'next' ? tokens.muted : tokens.text}>
              {s.label}
            </Txt>
          </View>
        ))}
      </View>

      {it.join && <Button title="단추에서 요약 보기" kind="text" icon={<ArrowSquareOut size={u(16)} color={tokens.muted} />} onPress={open} />}

      {/* 할 일이 있을 때는 숫자와 단계만(진단 문서 A12 반영안). 제출 뒤에는 단계, 기한, 제출 금액 */}
      {!act && (
        <View style={styles.facts}>
          <Row k="단계" v={it.stage} />
          {it.due && <Row k="기한" v={shortDate(it.due)} />}
          {it.money.map(([k, v]) => (
            <Row key={k} k={k} v={v.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1.$2.$3')} />
          ))}
        </View>
      )}

      {it.join && (
        <>
          <DanchuJoinSheet no={it.no} visible={sheet === 'join'} join={it.join} onClose={() => setSheet(null)} onDone={done} />
          <DanchuDeclineSheet no={it.no} visible={sheet === 'decline'} onClose={() => setSheet(null)} onDone={done} />
        </>
      )}
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
  bone: { height: u(16), borderRadius: u(8), backgroundColor: tokens.sunken },
  err: { flexDirection: 'row', alignItems: 'center', gap: u(8) },
  stat: { flexDirection: 'row', alignItems: 'baseline' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: u(11), paddingHorizontal: u(14), gap: space.md },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  fact: { flexDirection: 'row', alignItems: 'center', paddingVertical: u(6), gap: space.md },
  facts: { paddingTop: space.md, borderTopWidth: 1, borderTopColor: tokens.border },
  bar: { paddingHorizontal: space.md, paddingTop: space.sm, gap: space.xs },
});
