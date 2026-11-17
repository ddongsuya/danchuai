// 의뢰자: 단추에 보낸 요청의 진행과 비교표 (연동 2단계 읽기 + 5단계 기관 선정).
// 비교표가 열리기 전에는 숫자만, 열린 뒤에는 회신 도착 순 그대로(순위·추천 없음). 금액은 단추가 저장한 값 그대로.
import { formatWonShort } from '@danchuai/core';
import { ArrowClockwise, ArrowSquareOut, WarningCircle } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { ChatShell } from '@/components/chat/ChatShell';
import { DanchuSelectSheet } from '@/components/request/DanchuSelectSheet';
import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { DANCHU_URL } from '@/lib/danchuLinks';
import { monthDay, shortDate } from '@/lib/format';
import { fetchDanchuRequest, type DanchuCompare, type DanchuCompareColumn, type DanchuRequest as DanchuRequestData } from '@/lib/marketClient';

const won = (n: number | null) => (n == null ? '미기재' : `${n.toLocaleString('ko-KR')}원`);
const md = shortDate;

export function DanchuRequest({ no }: { no: string }) {
  const load = useCallback(() => fetchDanchuRequest(no), [no]);
  const { state, reload } = useRemote(load);

  if (state.kind !== 'ready') {
    return (
      <ChatShell title="요청" bottom={null}>
        {state.kind === 'loading' ? (
          <View accessibilityLabel="불러오는 중" accessibilityRole="progressbar" style={{ gap: space.md }}>
            <View style={[styles.bone, { width: '60%' }]} />
            <View style={[styles.card, { height: u(160) }]} />
            <View style={[styles.card, { height: u(120) }]} />
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

  return <DanchuRequestView data={state.data} onSelected={() => void reload()} />;
}

/** 지금 상태를 한 문장으로(오류가 아니므로 느낌표 없음) */
const headline = (r: DanchuRequestData) => (r.selected ? '기관을 선정했어요' : r.compareOpen ? '비교표가 열렸어요' : '회신을 받고 있어요');

/** 화면에 그리는 부분만. 미리보기(/preview)는 예시 값으로 이것만 쓴다. */
export function DanchuRequestView({
  data,
  onSelected,
  initialSelecting = false,
}: {
  data: { request: DanchuRequestData; compare: DanchuCompare };
  /** 선정이 끝났다(화면이 다시 읽는다) */
  onSelected?: () => void;
  /** 미리보기에서 시트를 연 채로 보여 줄 때만 */
  initialSelecting?: boolean;
}) {
  const { request: r, compare } = data;
  const [selecting, setSelecting] = useState(initialSelecting);
  const open = () => Linking.openURL(`${DANCHU_URL}/app/r/${encodeURIComponent(r.no)}`);
  // 상태에 맞는 주 동작 하나. 기다리기만 하면 되는 때에는 주 버튼을 두지 않는다.
  const choose = compare.open && !r.selected && compare.columns.length > 0;
  // 앱에서 바로 선정할 수 있는 칸(정식 견적서, 선정 승인에 넘길 id·판)이 하나라도 있으면 시트로, 없으면 단추에서
  const inApp = choose && compare.columns.some((c) => c.selectable && c.quoteId && c.revision);
  return (
    <ChatShell
      title={r.no}
      bottom={
        <View style={styles.bar}>
          {choose && <Button title="기관 선정하기" tall onPress={inApp ? () => setSelecting(true) : open} />}
          <Button title={choose ? '단추에서 비교표 보기' : '단추에서 열기'} kind="text" icon={choose ? undefined : <ArrowSquareOut size={u(16)} color={tokens.text} />} onPress={open} />
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
        {compare.open && (
          <Txt variant="small" color={tokens.muted} tabular>
            {`회신 도착 순, ${Math.max(r.joined, compare.columns.length)}곳`}
          </Txt>
        )}
      </View>

      {!compare.open && (
        <View style={{ gap: u(2) }}>
          <View style={styles.stat} accessible accessibilityLabel={`${r.joined}곳 중 ${r.submitted}곳 제출`}>
            <Txt variant="stat" tabular>
              {String(r.submitted)}
            </Txt>
            <Txt variant="label" tabular style={{ fontFamily: fonts.semibold }}>
              {` / ${r.joined}곳 제출`}
            </Txt>
          </View>
          <Txt variant="small" color={tokens.muted} tabular>
            {`비교표 공개 ${md(compare.replyBy)}`}
          </Txt>
        </View>
      )}

      {compare.open && <CompareList columns={compare.columns} missing={Math.max(0, r.joined - compare.columns.length)} />}

      {!compare.open && (
        <View style={[styles.card, styles.facts]}>
          <Fact k="보낸 기관" v={`${r.sent}곳`} />
          <Fact k="참여" v={`${r.joined}곳`} line />
          {r.joinBy && <Fact k="참여 결정 기한" v={md(r.joinBy)} line />}
        </View>
      )}

      {inApp && compare.open && (
        <DanchuSelectSheet
          no={r.no}
          visible={selecting}
          columns={compare.columns}
          onClose={() => setSelecting(false)}
          onDone={() => {
            setSelecting(false);
            onSelected?.();
          }}
        />
      )}
    </ChatShell>
  );
}

/** 비교는 회신 도착 순 세로 목록(결정 E5 ①, 시안 A). 순위·추천·강조 없음. 금액은 단추가 저장한 값 그대로. */
function CompareList({ columns, missing }: { columns: DanchuCompareColumn[]; missing: number }) {
  if (!columns.length) {
    return (
      <Txt variant="body" color={tokens.muted}>
        제출한 견적 없음
      </Txt>
    );
  }
  return (
    <View style={styles.card}>
      {columns.map((c, i) => (
        <View
          key={`${c.lab}-${i}`}
          style={[styles.lab, i > 0 && styles.line]}
          accessible
          accessibilityLabel={`${c.lab}, 견적 총액 ${won(c.total)}, 소요 기간 ${c.weeks ? `${c.weeks}주` : '미기재'}, ${monthDay(c.submittedAt)} 회신`}
        >
          <View style={styles.labTop}>
            <Txt variant="label" style={{ flex: 1, fontFamily: fonts.bold }} numberOfLines={1}>
              {c.lab}
            </Txt>
            <Txt variant="label" tabular style={{ fontFamily: fonts.bold }}>
              {c.total == null ? '미기재' : `${formatWonShort(c.total)} 원`}
            </Txt>
          </View>
          <View style={styles.labTop}>
            <Txt variant="caption" color={tokens.muted} tabular style={{ flex: 1 }}>
              {`${monthDay(c.submittedAt)} 회신`}
            </Txt>
            <Txt variant="caption" color={tokens.muted} tabular>
              {c.weeks ? `${c.weeks}주` : '기간 미기재'}
            </Txt>
          </View>
        </View>
      ))}
      {missingNames(columns, missing).map((name, i) => (
        <View key={`missing-${i}`} style={[styles.lab, styles.line, styles.labTop]}>
          <Txt variant="label" color={tokens.muted} style={{ flex: 1 }} numberOfLines={1}>
            {name}
          </Txt>
          <Txt variant="label" color={tokens.muted}>
            미제출
          </Txt>
        </View>
      ))}
    </View>
  );
}

/** 시안 A09(사용자 선택 2026-11-17 "시안대로"): 미제출 기관도 한 줄씩. 단추 이름이 "가 기관" 순서면 다음 글자로 잇고, 아니면 묶어서 한 줄 */
const ORDER = '가나다라마바사아자차카타파하';
function missingNames(columns: { lab: string }[], missing: number): string[] {
  if (missing <= 0) return [];
  const lettered = columns.every((c) => /^[가-힣] 기관$/.test(c.lab) && ORDER.includes(c.lab[0]));
  if (!lettered) return [`참여 기관 ${missing}곳`];
  return Array.from({ length: missing }, (_, i) => `${ORDER[columns.length + i] ?? '?'} 기관`);
}

function Fact({ k, v, line }: { k: string; v: string; line?: boolean }) {
  return (
    <View style={[styles.tr, line && styles.line]}>
      <Txt variant="small" color={tokens.muted} style={styles.k}>
        {k}
      </Txt>
      <Txt variant="small" tabular style={{ flex: 1 }}>
        {v}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' },
  bone: { height: u(16), borderRadius: u(8), backgroundColor: tokens.sunken },
  err: { flexDirection: 'row', alignItems: 'center', gap: u(8) },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: u(12), gap: space.md },
  stat: { flexDirection: 'row', alignItems: 'baseline' },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  k: { width: u(96) },
  facts: { paddingHorizontal: space.lg },
  lab: { paddingVertical: u(14), paddingHorizontal: space.lg, gap: u(4) },
  labTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  bar: { paddingHorizontal: space.md, paddingTop: space.sm, gap: space.xs },
});
