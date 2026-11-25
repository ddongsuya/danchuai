// 의뢰자: 선정한 기관이 보낸 계약서(안)(단추 contract_draft_view). 받기 전이면 카드를 숨긴다.
// 금액은 선정 견적 그대로(단추 계산). 서명·날인은 단추 밖에서 하고, PDF 저장은 단추 화면에서 한다.
import { ArrowSquareOut, FileText } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet, SheetBody } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { readDanchu } from '@/lib/agentClient';
import { DANCHU_URL, openWeb } from '@/lib/danchuLinks';
import type { ReceivedDraftView } from '@/lib/danchuRequester';
import { localDay, shortDate } from '@/lib/format';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export function ReceivedDraftCard({ no, initial }: { no: string; initial?: ReceivedDraftView }) {
  const [v, setV] = useState<ReceivedDraftView | null>(initial ?? null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (initial) return;
    let live = true;
    readDanchu<ReceivedDraftView>('contract_draft_view', {}, no, 'requester')
      // 받기 전(not_sent)·연결 문제면 카드를 숨긴다
      .then((r) => live && setV(r?.draft ? r : null))
      .catch(() => live && setV(null));
    return () => {
      live = false;
    };
  }, [no, initial]);

  if (!v) return null;
  const d = v.draft;
  const web = v.path.startsWith('/app/r/') ? `${DANCHU_URL}${v.path}` : null;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <FileText size={u(18)} color={tokens.text} />
        <Txt variant="label" style={{ flex: 1, fontFamily: fonts.bold }} accessibilityRole="header">
          받은 계약서(안)
        </Txt>
        <Txt variant="label" tabular style={{ fontFamily: fonts.bold }}>
          {won(d.total)}
        </Txt>
      </View>
      <Txt variant="caption" color={tokens.muted} tabular>
        {`${d.cro.name}, ${shortDate(localDay(v.sentAt))} 받음, 부가세 포함`}
      </Txt>
      <View style={styles.actions}>
        <Button title="계약서(안) 보기" kind="soft" onPress={() => setOpen(true)} />
      </View>

      <Sheet visible={open} onClose={() => setOpen(false)}>
        <SheetBody
          title={d.title}
          onClose={() => setOpen(false)}
          primary={web ? <Button title="단추에서 열기" kind="soft" tall icon={<ArrowSquareOut size={u(16)} color={tokens.text} />} onPress={() => void openWeb(web)} /> : undefined}
        >
          <ScrollView style={{ maxHeight: u(480) }} contentContainerStyle={{ gap: space.md }}>
            <View>
              {d.tests.map((t) => (
                <View key={t.seq} style={styles.row}>
                  <Txt variant="small" style={{ flex: 1 }}>
                    {t.name}
                  </Txt>
                  <Txt variant="small" tabular>
                    {won(t.amount)}
                  </Txt>
                </View>
              ))}
              <View style={[styles.row, styles.line]}>
                <Txt variant="small" color={tokens.muted} style={{ flex: 1 }}>
                  공급가액
                </Txt>
                <Txt variant="small" tabular>
                  {won(d.supply)}
                </Txt>
              </View>
              <View style={styles.row}>
                <Txt variant="small" color={tokens.muted} style={{ flex: 1 }}>
                  부가세
                </Txt>
                <Txt variant="small" tabular>
                  {won(d.vat)}
                </Txt>
              </View>
              <View style={styles.row}>
                <Txt variant="small" style={{ flex: 1, fontFamily: fonts.bold }}>
                  합계
                </Txt>
                <Txt variant="small" tabular style={{ fontFamily: fonts.bold }}>
                  {won(d.total)}
                </Txt>
              </View>
            </View>
            {d.articles.map((a) => (
              <View key={a.no} style={{ gap: u(2) }}>
                <Txt variant="small" style={{ fontFamily: fonts.semibold }}>{`제${a.no}조 ${a.title}`}</Txt>
                {a.body.map((b, i) => (
                  <Txt key={i} variant="small" color={tokens.muted}>
                    {b}
                  </Txt>
                ))}
              </View>
            ))}
            {d.special.length > 0 && (
              <View style={{ gap: u(2) }}>
                <Txt variant="small" style={{ fontFamily: fonts.semibold }}>
                  특약
                </Txt>
                {d.special.map((s, i) => (
                  <Txt key={i} variant="small" color={tokens.muted}>
                    {s}
                  </Txt>
                ))}
              </View>
            )}
          </ScrollView>
        </SheetBody>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, paddingHorizontal: space.lg, paddingVertical: u(14), gap: u(6) },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: u(4), gap: space.md },
  line: { borderTopWidth: 1, borderTopColor: tokens.border, marginTop: u(4), paddingTop: u(8) },
  actions: { gap: u(2), marginTop: u(6) },
});
