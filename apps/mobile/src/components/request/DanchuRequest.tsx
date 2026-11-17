// 의뢰자: 단추에 보낸 요청의 진행과 비교표 (연동 2단계, 읽기만).
// 비교표가 열리기 전에는 숫자만, 열린 뒤에는 회신 도착 순 그대로(순위·추천 없음). 금액은 단추가 저장한 값 그대로.
import { formatWonShort } from '@danchuai/core';
import { ArrowClockwise, WarningCircle } from 'phosphor-react-native';
import { useCallback } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { ChatShell } from '@/components/chat/ChatShell';
import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { DANCHU_URL } from '@/lib/danchuLinks';
import { dayLabel, fetchDanchuRequest, type DanchuCompare, type DanchuRequest as DanchuRequestData } from '@/lib/marketClient';

const won = (n: number | null) => (n == null ? '미기재' : `${n.toLocaleString('ko-KR')}원`);
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
/** 11.26(목) 처럼 짧게. 요일은 날짜 문자열 그대로 계산한다(시간대 영향 없음) */
const md = (s: string | null) => {
  if (!s) return '미정';
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return s;
  return `${m}.${d}(${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
};

export function DanchuRequest({ no }: { no: string }) {
  const load = useCallback(() => fetchDanchuRequest(no), [no]);
  const { state, reload } = useRemote(load);

  if (state.kind !== 'ready') {
    return (
      <ChatShell title="요청" bottom={null}>
        {state.kind === 'loading' ? (
          <View accessibilityLabel="불러오는 중" accessibilityRole="progressbar" style={{ gap: space.md }}>
            <View style={[styles.bone, { width: '60%' }]} />
            <View style={[styles.card, { height: 160 }]} />
            <View style={[styles.card, { height: 120 }]} />
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

  return <DanchuRequestView data={state.data} />;
}

/** 지금 상태를 한 문장으로(오류가 아니므로 느낌표 없음) */
const headline = (r: DanchuRequestData) => (r.selected ? '기관을 선정했어요' : r.compareOpen ? '비교표가 열렸어요' : '회신을 받고 있어요');

/** 화면에 그리는 부분만. 미리보기(/preview)는 예시 값으로 이것만 쓴다. */
export function DanchuRequestView({ data }: { data: { request: DanchuRequestData; compare: DanchuCompare } }) {
  const { request: r, compare } = data;
  const open = () => Linking.openURL(`${DANCHU_URL}/app/r/${encodeURIComponent(r.no)}`);
  // 상태에 맞는 주 동작 하나. 기다리기만 하면 되는 때에는 주 버튼을 두지 않는다.
  const choose = compare.open && !r.selected && compare.columns.length > 0;
  return (
    <ChatShell
      title={r.no}
      bottom={
        <View style={styles.bar}>
          {choose && <Button title="단추에서 기관 선정하기" tall onPress={open} />}
          <Button title={choose ? '단추에서 비교표 보기' : '단추에서 열기'} kind="text" onPress={open} />
        </View>
      }
    >
      <View style={{ gap: space.xs }}>
        <Txt variant="small" color={tokens.muted} numberOfLines={2}>
          {r.title}
        </Txt>
        <Txt variant="title" accessibilityRole="header">
          {headline(r)}
        </Txt>
      </View>

      {!compare.open && (
        <View style={{ gap: 2 }}>
          <Txt variant="stat" tabular accessibilityLabel={`${r.joined}곳 중 ${r.submitted}곳 제출`}>
            {`${r.submitted}/${r.joined}곳`}
          </Txt>
          <Txt variant="small" color={tokens.muted} tabular>
            {`견적 제출, 비교표 공개 ${md(compare.replyBy)}`}
          </Txt>
        </View>
      )}

      {compare.open && <CompareList columns={compare.columns} />}

      <View style={styles.facts}>
        <Fact k="보낸 기관" v={`${r.sent}곳`} />
        <Fact k="참여" v={`${r.joined}곳`} />
        {r.joinBy && <Fact k="참여 결정 기한" v={md(r.joinBy)} />}
        <Fact k="회신 기한" v={md(r.replyBy)} />
        <Fact k="보낸 날" v={`${dayLabel(r.createdAt)}`} />
      </View>
    </ChatShell>
  );
}

/** 비교는 회신 도착 순 세로 목록(결정 E5 ①). 순위·추천·강조 없음. 금액은 단추가 저장한 값 그대로. */
function CompareList({ columns }: { columns: { lab: string; total: number | null; weeks: number | null; submittedAt: string | null }[] }) {
  if (!columns.length) {
    return (
      <Txt variant="body" color={tokens.muted}>
        제출한 견적 없음
      </Txt>
    );
  }
  return (
    <View>
      <Txt variant="caption" color={tokens.muted} style={{ marginBottom: space.sm }} tabular>
        {`회신 도착 순, ${columns.length}곳`}
      </Txt>
      <View style={styles.card}>
        {columns.map((c, i) => (
          <View
            key={`${c.lab}-${i}`}
            style={[styles.lab, i > 0 && styles.line]}
            accessible
            accessibilityLabel={`${c.lab}, 견적 총액 ${won(c.total)}, 소요 기간 ${c.weeks ? `${c.weeks}주` : '미기재'}, ${md(c.submittedAt)} 회신`}
          >
            <View style={styles.labTop}>
              <Txt variant="label" style={{ flex: 1, fontFamily: fonts.bold }} numberOfLines={1}>
                {c.lab}
              </Txt>
              <Txt variant="label" tabular style={{ fontFamily: fonts.bold }}>
                {c.total == null ? '미기재' : formatWonShort(c.total)}
              </Txt>
            </View>
            <View style={styles.labTop}>
              <Txt variant="caption" color={tokens.muted} tabular style={{ flex: 1 }}>
                {`${md(c.submittedAt)} 회신, ${c.weeks ? `${c.weeks}주` : '기간 미기재'}`}
              </Txt>
              {c.total != null && (
                <Txt variant="caption" color={tokens.muted} tabular>
                  {won(c.total)}
                </Txt>
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.tr}>
      <Txt variant="small" color={tokens.muted} style={styles.k}>
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
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: space.md },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  k: { flex: 1, minWidth: 84 },
  facts: { paddingTop: space.md, borderTopWidth: 1, borderTopColor: tokens.border },
  lab: { paddingVertical: 14, paddingHorizontal: space.lg, gap: 4 },
  labTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  bar: { paddingHorizontal: space.md, paddingTop: space.sm, gap: space.xs },
});
