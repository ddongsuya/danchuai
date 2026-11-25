// 기관: 계약서(안) 카드(2026-11-20, 서명 전까지). 선정된 요청 화면에 붙는다.
// 단추가 선정된 견적으로 만든 계약서(안)의 금액을 보여 주고, 단추에서 열어 PDF로 저장하거나 의뢰자에게 보낸다.
// 보내기는 확인 대화에서 누른 것이 승인이다. 실행은 서버 보내기 장부가 한 번만 한다(draft → approve → dispatch).
import { ArrowSquareOut, CheckCircle, FileText, WarningCircle } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { approveDanchuAction, draftDanchuAction, readDanchu, type ContractDraftView } from '@/lib/agentClient';
import { DANCHU_URL, openWeb } from '@/lib/danchuLinks';
import { shortDate } from '@/lib/format';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
type Send = { kind: 'idle' | 'confirm' | 'sending' } | { kind: 'sent'; at: string } | { kind: 'error'; message: string };

export function ContractDraftCard({ no, initial }: { no: string; initial?: ContractDraftView }) {
  const [draft, setDraft] = useState<ContractDraftView | null | 'none'>(initial ?? null);
  const [send, setSend] = useState<Send>({ kind: 'idle' });

  useEffect(() => {
    if (initial) return;
    let live = true;
    readDanchu<{ draft: ContractDraftView }>('contract_draft', {}, no)
      .then((r) => live && setDraft(r?.draft ?? 'none'))
      // 선정 전·요금제·연결 문제면 카드를 숨긴다
      .catch(() => live && setDraft('none'));
    return () => {
      live = false;
    };
  }, [no, initial]);

  if (!draft || draft === 'none' || draft.contractStatus === 'signed' || draft.contractStatus === 'not_signed') return null;
  const sentAt = send.kind === 'sent' ? send.at : draft.sentAt;

  const go = async () => {
    setSend({ kind: 'sending' });
    try {
      const d = await draftDanchuAction('cro', 'contract_draft_send', {}, no);
      const r = await approveDanchuAction('cro', d);
      if (r.status === 'sent') return setSend({ kind: 'sent', at: typeof r.result?.sentAt === 'string' ? r.result.sentAt : new Date().toISOString() });
      const reason = typeof r.result?.error === 'string' && /[가-힣]/.test(r.result.error) ? r.result.error : null;
      setSend({ kind: 'error', message: r.status === 'failed' ? (reason ?? '단추가 받지 않았어요. 확인하고 다시 보내 주세요') : '결과를 확인해 주세요' });
    } catch {
      setSend({ kind: 'error', message: '연결이 잠깐 끊겼어요' });
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <FileText size={u(18)} color={tokens.text} />
        <Txt variant="label" style={{ flex: 1, fontFamily: fonts.bold }} accessibilityRole="header">
          계약서(안)
        </Txt>
        <Txt variant="label" tabular style={{ fontFamily: fonts.bold }}>
          {won(draft.total)}
        </Txt>
      </View>
      <Txt variant="caption" color={tokens.muted} tabular>
        {`시험 ${draft.tests}개, 부가세 포함`}
      </Txt>
      {sentAt ? (
        <View style={styles.row} accessibilityLiveRegion="polite">
          <CheckCircle size={u(16)} weight="fill" color={tokens.accent} />
          <Txt variant="caption" color={tokens.accent} style={{ fontFamily: fonts.semibold }}>
            {`${shortDate(sentAt.slice(0, 10))} 의뢰자에게 보냈어요`}
          </Txt>
        </View>
      ) : null}
      {send.kind === 'error' && (
        <View style={styles.row} accessibilityRole="alert">
          <WarningCircle size={u(16)} weight="fill" color={tokens.danger} />
          <Txt variant="caption" color={tokens.danger} style={{ fontFamily: fonts.semibold, flex: 1 }}>
            {send.message}
          </Txt>
        </View>
      )}
      <View style={styles.actions}>
        <Button title={sentAt ? '다시 보내기' : '의뢰자에게 보내기'} kind="soft" disabled={send.kind === 'sending'} loading={send.kind === 'sending'} onPress={() => setSend({ kind: 'confirm' })} />
        <Button title="계약서(안) 보기" kind="text" icon={<ArrowSquareOut size={u(16)} color={tokens.text} />} onPress={() => void openWeb(`${DANCHU_URL}${draft.path}`)} />
      </View>

      <Dialog visible={send.kind === 'confirm'} onClose={() => setSend({ kind: 'idle' })}>
        <View style={{ gap: space.md }}>
          <Txt variant="heading">계약서(안)을 의뢰자에게 보낼까요?</Txt>
          <Txt variant="small" color={tokens.muted} tabular>
            {`${no}, 합계 ${won(draft.total)}`}
          </Txt>
          <Button title="보내기" tall onPress={() => void go()} />
          <Button title="취소" kind="text" onPress={() => setSend({ kind: 'idle' })} />
        </View>
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, paddingHorizontal: space.lg, paddingVertical: u(14), gap: u(6) },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: u(6) },
  actions: { gap: u(2), marginTop: u(6) },
});
