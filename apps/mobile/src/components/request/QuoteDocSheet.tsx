// 의뢰자: 기관 견적서를 앱 안에서 본다(단추 quote_view, 비교표가 열린 뒤). 금액은 단추 견적서 툴이 계산한 값 그대로.
// 순위·추천·강조는 없다. 단추 화면(인쇄·PDF)은 아래 버튼으로 연다.
import { ArrowSquareOut, WarningCircle } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet, SheetBody } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { fonts, space, tokens, u } from '@/constants/theme';
import { readDanchu } from '@/lib/agentClient';
import { DANCHU_URL, openWeb } from '@/lib/danchuLinks';
import { groupLine, type QuoteDocView } from '@/lib/danchuRequester';
import { shortDate } from '@/lib/format';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
type Load = { kind: 'loading' } | { kind: 'ready'; v: QuoteDocView } | { kind: 'error' };

export function QuoteDocSheet({ no, quoteId, webPath, onClose }: { no: string; quoteId: string | null; webPath: string | null; onClose: () => void }) {
  // 결과는 어느 견적 것인지와 함께 둔다. 다른 기관을 열면 첫 화면부터 불러오는 중(앞 기관 금액이 잠깐 보이지 않게)
  const [got, setGot] = useState<{ id: string; s: Load } | null>(null);
  const s: Load = got && got.id === quoteId ? got.s : { kind: 'loading' };
  useEffect(() => {
    if (!quoteId) return;
    let live = true;
    readDanchu<QuoteDocView>('quote_view', { quoteId }, no, 'requester')
      .then((v) => live && setGot({ id: quoteId, s: v?.tests ? { kind: 'ready', v } : { kind: 'error' } }))
      .catch(() => live && setGot({ id: quoteId, s: { kind: 'error' } }));
    return () => {
      live = false;
    };
  }, [no, quoteId]);

  const path = s.kind === 'ready' ? s.v.path : webPath;
  const web = path && path.startsWith('/app/r/') ? `${DANCHU_URL}${path}` : null;
  return (
    <Sheet visible={!!quoteId} onClose={onClose}>
      <SheetBody
        title={s.kind === 'ready' ? s.v.croName : '기관 견적서'}
        onClose={onClose}
        primary={web ? <Button title="단추에서 열기" kind="soft" tall icon={<ArrowSquareOut size={u(16)} color={tokens.text} />} onPress={() => void openWeb(web)} /> : undefined}
      >
        {s.kind === 'loading' && (
          <View accessibilityLabel="불러오는 중" accessibilityRole="progressbar" style={{ gap: space.sm }}>
            <View style={[styles.bone, { width: '50%' }]} />
            <View style={[styles.bone, { height: u(120) }]} />
          </View>
        )}
        {s.kind === 'error' && (
          <View style={styles.row} accessibilityRole="alert">
            <WarningCircle size={u(16)} weight="fill" color={tokens.danger} />
            <Txt variant="caption" color={tokens.danger} style={{ flex: 1, fontFamily: fonts.semibold }}>
              견적서를 불러오지 못했어요
            </Txt>
          </View>
        )}
        {s.kind === 'ready' && <DocBody v={s.v} />}
      </SheetBody>
    </Sheet>
  );
}

function DocBody({ v }: { v: QuoteDocView }) {
  const terms = [
    ['결제 조건', v.terms.pay],
    ['기타 조건', v.terms.extra],
    ['비고', v.terms.note],
  ].filter(([, t]) => t.trim());
  return (
    <ScrollView style={{ maxHeight: u(480) }} contentContainerStyle={{ gap: space.md }}>
      <Txt variant="caption" color={tokens.muted} tabular>
        {[v.docNo, v.validUntil ? `유효 ${shortDate(v.validUntil)}까지` : null].filter(Boolean).join(', ')}
      </Txt>
      <View>
        {v.tests.map((t, i) => (
          <View key={`${t.title}-${i}`} style={[styles.test, i > 0 && styles.line]} accessible>
            <View style={styles.row}>
              <Txt variant="label" style={{ flex: 1, fontFamily: fonts.semibold }}>
                {t.title}
              </Txt>
              <Txt variant="label" tabular style={{ fontFamily: fonts.semibold }}>
                {won(t.total)}
              </Txt>
            </View>
            {t.groups.length > 0 && (
              <Txt variant="caption" color={tokens.muted} tabular>
                {t.groups.map(groupLine).join(' / ')}
              </Txt>
            )}
            {t.options.some((o) => o.on) && (
              <Txt variant="caption" color={tokens.muted}>
                {`추가 항목: ${t.options.filter((o) => o.on).map((o) => o.name).join(', ')}`}
              </Txt>
            )}
            {t.weeks ? (
              <Txt variant="caption" color={tokens.muted} tabular>
                {`${t.weeks}주`}
              </Txt>
            ) : null}
          </View>
        ))}
      </View>
      <View style={[styles.line, { paddingTop: space.sm }]}>
        {v.totals.discount > 0 && <Sum k="할인" v={`-${won(v.totals.discount)}`} />}
        <Sum k="공급가액" v={won(v.totals.supply)} />
        <Sum k="부가세" v={won(v.totals.vat)} />
        <Sum k="합계" v={won(v.totals.grand)} strong />
      </View>
      {terms.map(([k, t]) => (
        <View key={k} style={{ gap: u(2) }}>
          <Txt variant="small" color={tokens.muted}>
            {k}
          </Txt>
          <Txt variant="small">{t}</Txt>
        </View>
      ))}
    </ScrollView>
  );
}

function Sum({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <View style={[styles.row, { paddingVertical: u(3) }]}>
      <Txt variant="small" color={tokens.muted} style={{ flex: 1 }}>
        {k}
      </Txt>
      <Txt variant="small" tabular style={strong ? { fontFamily: fonts.bold } : undefined}>
        {v}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  test: { paddingVertical: u(10), gap: u(3) },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  bone: { height: u(16), borderRadius: u(8), backgroundColor: tokens.sunken },
});
