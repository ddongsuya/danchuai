// 기관 비서 찾기 카드(2026-11-20). 비서가 고른 찾을 말로 단추를 직접 읽어 보여 준다.
// 결과는 모델에도 대화 기록에도 넣지 않는다(에이전트는 단추 자료의 복사본을 두지 않는다). 금액은 단추 견적서 툴이 계산한 값만.
// 과거 견적(quote_history): 최근 발행 순, 줄을 누르면 단추 견적서를 연다.
import { MagnifyingGlass } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { ErrorLine } from '@/components/agent/LiveChat';
import { StepLog } from '@/components/chat/Messages';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, tokens, uc } from '@/constants/theme';
import { readDanchu, type QuoteHitView } from '@/lib/agentClient';
import type { LookupCard as Card } from '@/lib/chat';
import { DANCHU_URL } from '@/lib/danchuLinks';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const ymd = (s: string) => s.replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$1.$2.$3');

type Load<T> = { kind: 'loading' } | { kind: 'error' } | { kind: 'done'; data: T };

/** 찾기 카드 하나. 모르는 찾기 이름은 보이지 않는다(단추가 새 찾기를 더하면 여기 모양을 더한다) */
export function LookupCard({ card, initial }: { card: Card; initial?: QuoteHitView[] }) {
  if (card.action === 'quote_history') return <QuoteHits card={card} initial={initial} />;
  return null;
}

function QuoteHits({ card, initial }: { card: Card; initial?: QuoteHitView[] }) {
  const [load, setLoad] = useState<Load<QuoteHitView[]>>(initial ? { kind: 'done', data: initial } : { kind: 'loading' });
  const [tick, setTick] = useState(0);
  const q = typeof card.body.q === 'string' ? card.body.q : '';

  useEffect(() => {
    if (initial) return;
    let live = true;
    setLoad({ kind: 'loading' });
    readDanchu<{ hits: QuoteHitView[] }>(card.action, card.body)
      .then((r) => live && setLoad({ kind: 'done', data: Array.isArray(r.hits) ? r.hits : [] }))
      .catch(() => live && setLoad({ kind: 'error' }));
    return () => {
      live = false;
    };
  }, [card.action, card.body, initial, tick]);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <MagnifyingGlass size={uc(16)} color={tokens.muted} />
        <Txt variant="chatLabel" style={{ fontFamily: fonts.bold, flex: 1 }} numberOfLines={1} accessibilityRole="header">
          {q ? `과거 견적, ${q}` : '과거 견적'}
        </Txt>
        {load.kind === 'done' && (
          <Txt variant="chatCaption" color={tokens.muted} tabular>
            {load.data.length}건
          </Txt>
        )}
      </View>
      {load.kind === 'loading' && <StepLog steps={[{ label: '단추에서 찾는 중', state: 'now' }]} />}
      {load.kind === 'error' && <ErrorLine label="견적을 불러오지 못했어요" onRetry={() => setTick((t) => t + 1)} />}
      {load.kind === 'done' && !load.data.length && (
        <Txt variant="chatSmall" color={tokens.muted} style={styles.empty}>
          맞는 견적 없음
        </Txt>
      )}
      {load.kind === 'done' &&
        load.data.map((h, i) => (
          <Press
            key={h.id}
            label={`${h.title}, ${ymd(h.issuedOn)}, 공급가 ${won(h.supply)}`}
            onPress={() => void Linking.openURL(`${DANCHU_URL}/cro/docs/${encodeURIComponent(h.id)}`)}
            style={[styles.row, i > 0 && styles.line]}
          >
            <View style={styles.top}>
              <Txt variant="chatSmall" style={{ fontFamily: fonts.semibold, flex: 1 }} numberOfLines={2}>
                {h.title || h.docNo}
              </Txt>
              <Txt variant="chatSmall" tabular style={{ fontFamily: fonts.bold }}>
                {won(h.supply)}
              </Txt>
            </View>
            <Txt variant="chatCaption" color={tokens.muted} numberOfLines={1} tabular>
              {[h.docNo, ymd(h.issuedOn), h.client, h.substance].filter(Boolean).join(', ')}
            </Txt>
            {h.tests.length > 1 &&
              h.tests.slice(0, 4).map((t, j) => (
                <View key={j} style={styles.top}>
                  <Txt variant="chatCaption" color={tokens.muted} numberOfLines={1} style={{ flex: 1 }}>
                    {t.name}
                  </Txt>
                  <Txt variant="chatCaption" color={tokens.muted} tabular>
                    {won(t.total)}
                  </Txt>
                </View>
              ))}
          </Press>
        ))}
      {load.kind === 'done' && load.data.length > 0 && (
        <Txt variant="chatCaption" color={tokens.faint} style={styles.foot}>
          공급가, 부가세 별도, 단추 견적서 기준
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: uc(18), borderWidth: 1, borderColor: tokens.border, paddingHorizontal: uc(14), paddingVertical: uc(10), gap: uc(2) },
  head: { flexDirection: 'row', alignItems: 'center', gap: uc(8), paddingBottom: uc(6) },
  row: { paddingVertical: uc(10), gap: uc(3) },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: uc(10) },
  empty: { paddingVertical: uc(8) },
  foot: { paddingTop: uc(4) },
});
