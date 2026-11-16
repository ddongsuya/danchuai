// 의뢰자: 단추에 보낸 요청의 진행과 비교표 (연동 2단계 읽기 + 5단계 기관 선정).
// 비교표가 열리기 전에는 숫자만, 열린 뒤에는 회신 도착 순 그대로(순위·추천 없음). 금액은 단추가 저장한 값 그대로.
import { ArrowClockwise, ArrowSquareOut, WarningCircle } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { ChatShell } from '@/components/chat/ChatShell';
import { DanchuSelectSheet } from '@/components/request/DanchuSelectSheet';
import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { DANCHU_URL } from '@/lib/danchuLinks';
import { dayLabel, fetchDanchuRequest, type DanchuCompare } from '@/lib/marketClient';

const won = (n: number | null) => (n == null ? '미기재' : `${n.toLocaleString('ko-KR')}원`);
const ymd = (s: string | null) => (s ? s.slice(0, 10).replace(/-/g, '.') : '미정');

export function DanchuRequest({ no }: { no: string }) {
  const load = useCallback(() => fetchDanchuRequest(no), [no]);
  const { state, reload } = useRemote(load);
  const [selecting, setSelecting] = useState(false);

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
            {state.code !== 'not_found' && <Button title="다시 시도" kind="line" icon={<ArrowClockwise size={14} color={tokens.text} />} onPress={() => void reload()} />}
          </View>
        )}
      </ChatShell>
    );
  }

  const { request: r, compare } = state.data;
  const canSelect = !r.selected && compare.open && compare.columns.some((c) => c.selectable && c.quoteId && c.revision);
  return (
    <ChatShell
      title={r.title}
      bottom={
        <View style={[styles.bar, { gap: space.sm }]}>
          {canSelect && <Button title="기관 선정" tall onPress={() => setSelecting(true)} />}
          <Button
            title="단추에서 열기"
            kind={canSelect ? 'ghost' : 'line'}
            tall={!canSelect}
            icon={<ArrowSquareOut size={16} color={tokens.text} />}
            onPress={() => Linking.openURL(`${DANCHU_URL}/app/r/${encodeURIComponent(r.no)}`)}
          />
        </View>
      }
    >
      <View style={{ gap: 4 }}>
        <Txt variant="caption" color={tokens.muted} tabular>
          {`${r.no}, ${dayLabel(r.createdAt)} 보냄`}
        </Txt>
        {r.categories.length > 0 && (
          <Txt variant="small" color={tokens.muted}>
            {r.categories.join(', ')}
          </Txt>
        )}
      </View>

      <View style={styles.card}>
        <Fact k="보낸 기관" v={`${r.sent}곳`} />
        <Fact k="참여" v={`${r.joined}곳`} line />
        <Fact k="견적 제출" v={`${r.submitted}곳`} line />
        {r.joinBy && <Fact k="참여 결정 기한" v={ymd(r.joinBy)} line />}
        <Fact k="회신 기한" v={ymd(r.replyBy)} line />
        <Fact k="상태" v={r.selected ? '선정 완료' : r.compareOpen ? '비교표 열림' : '회신 받는 중'} line />
      </View>

      <CompareView compare={compare} />
      {compare.open && (
        <DanchuSelectSheet
          no={r.no}
          visible={selecting}
          columns={compare.columns}
          onClose={() => setSelecting(false)}
          onDone={() => {
            setSelecting(false);
            void reload();
          }}
        />
      )}
    </ChatShell>
  );
}

function CompareView({ compare }: { compare: DanchuCompare }) {
  if (!compare.open) {
    const seats = Array.from({ length: compare.joined }, (_, i) => i < compare.submitted);
    return (
      <View style={styles.card}>
        <View style={[styles.tr, styles.head]}>
          <Txt variant="label" style={{ flex: 1 }}>
            비교표
          </Txt>
          <Txt variant="caption" color={tokens.muted} tabular>
            {`${ymd(compare.replyBy)} 공개`}
          </Txt>
        </View>
        {seats.length === 0 ? (
          <View style={[styles.tr, styles.line]}>
            <Txt variant="small" color={tokens.muted}>
              참여 기관 없음
            </Txt>
          </View>
        ) : (
          <View style={[styles.line, styles.seats]} accessibilityLabel={`참여 ${compare.joined}곳 중 ${compare.submitted}곳 제출`}>
            {seats.map((done, i) => (
              <View key={i} style={[styles.seat, done && styles.seatDone]}>
                <Txt variant="caption" color={tokens.muted} tabular>
                  {`기관 ${i + 1}`}
                </Txt>
                <Txt variant="small" color={done ? tokens.text : tokens.wait} style={{ fontFamily: fonts.semibold }}>
                  {done ? '제출' : '회신 대기'}
                </Txt>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }
  const cols = compare.columns;
  const colW = 112;
  return (
    <View style={styles.card}>
      <ScrollView horizontal={cols.length > 2} showsHorizontalScrollIndicator={false} scrollEnabled={cols.length > 2}>
        <View style={{ minWidth: '100%' }}>
          <View style={[styles.tr, styles.head]}>
            <View style={styles.k}>
              <Txt variant="label">비교표</Txt>
            </View>
            {cols.map((c, i) => (
              <Txt key={i} variant="caption" style={[styles.v, { width: colW, fontFamily: fonts.bold }]} numberOfLines={1}>
                {c.lab}
              </Txt>
            ))}
          </View>
          {[
            { label: '견적 총액', values: cols.map((c) => won(c.total)), money: true },
            { label: '소요 기간', values: cols.map((c) => (c.weeks ? `${c.weeks}주` : '미기재')) },
            { label: '회신일', values: cols.map((c) => ymd(c.submittedAt)) },
          ].map((row) => (
            <View key={row.label} style={[styles.tr, styles.line]} accessibilityLabel={`${row.label}: ${row.values.join(', ')}`}>
              <View style={styles.k}>
                <Txt variant="small" color={tokens.muted}>
                  {row.label}
                </Txt>
              </View>
              {row.values.map((v, i) => (
                <Txt key={i} variant="small" tabular style={[styles.v, { width: colW }, row.money && { fontFamily: fonts.bold }]}>
                  {v}
                </Txt>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      {cols.length === 0 && (
        <View style={[styles.tr, styles.line]}>
          <Txt variant="small" color={tokens.muted}>
            제출한 견적 없음
          </Txt>
        </View>
      )}
    </View>
  );
}

function Fact({ k, v, line }: { k: string; v: string; line?: boolean }) {
  return (
    <View style={[styles.tr, line && styles.line]}>
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
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14, gap: space.md },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  head: { backgroundColor: tokens.sunken },
  k: { flex: 1, minWidth: 84 },
  v: { textAlign: 'right' },
  bar: { paddingHorizontal: space.md, paddingTop: space.sm },
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, padding: 14 },
  seat: { width: '31%', minWidth: 92, gap: 2, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.inner, borderWidth: 1, borderColor: tokens.border, borderStyle: 'dashed' },
  seatDone: { borderStyle: 'solid', backgroundColor: tokens.sunken },
});
