// 선정 뒤 계약 카드(의뢰자·기관 공통). 계약 체결 보고 → 의뢰자 확인(또는 7일 뒤 자동 확정)까지 앱에서 끝낸다.
// 상태와 할 수 있는 동작은 단추 contract_status 가 정한다. 시트의 주 버튼을 누른 것이 승인이고, 실행은 서버 보내기 장부가 한 번만 한다.
import { CheckCircle, HourglassMedium, Signature, WarningCircle } from 'phosphor-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { CheckMark } from '@/components/ui/Checkbox';
import { Chip } from '@/components/ui/Chip';
import { Field } from '@/components/ui/Field';
import { Press } from '@/components/ui/Press';
import { Sheet, SheetBody } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { readDanchu, type AgentRole } from '@/lib/agentClient';
import { sendApproved as send } from '@/lib/danchuSend';
import {
  RESULT_OPTIONS,
  confirmBody,
  digitsOnly,
  gapLine,
  needsGapReason,
  reportBody,
  resultBody,
  stateLabel,
  type ContractView,
  type ResultStatus,
} from '@/lib/danchuContract';
import { shortDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';

const won = (n: number | null) => (n == null ? '미기재' : `${n.toLocaleString('ko-KR')}원`);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type Open = null | 'report' | 'dispute' | 'confirm' | 'result';

export function ContractCard({ role, no, initial }: { role: AgentRole; no: string; initial?: ContractView }) {
  const [v, setV] = useState<ContractView | null | 'none'>(initial ?? null);
  const [open, setOpen] = useState<Open>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    if (initial) return () => {};
    let live = true;
    readDanchu<{ contract: ContractView }>('contract_status', {}, no, role)
      .then((r) => live && setV(r?.contract ?? 'none'))
      // 선정 전·연결 문제면 카드를 숨긴다(요청 화면이 따로 알린다)
      .catch(() => live && setV('none'));
    return () => {
      live = false;
    };
  }, [no, role, initial]);
  useEffect(() => load(), [load]);

  if (!v || v === 'none') return null;
  const gap = gapLine(v);
  const tone = v.state === 'confirmed' ? 'accent' : v.state === 'disputed' || v.state === 'not_signed' ? 'mute' : 'wait';
  const finish = (msg: string) => {
    setOpen(null);
    setDone(msg);
    haptic.success();
    load();
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Signature size={u(18)} color={tokens.text} />
        <Txt variant="label" style={{ flex: 1, fontFamily: fonts.bold }} accessibilityRole="header">
          계약
        </Txt>
        <Chip label={stateLabel(role, v.state)} kind={tone} />
      </View>

      <View>
        {role === 'requester' && <Row k="선정 기관" v={v.lab} />}
        <Row k="선정 견적" v={won(v.quoteAmount)} />
        {v.report && (
          <>
            <Row k="체결일" v={shortDate(v.report.date)} />
            <Row k="계약 금액" v={won(v.report.amount)} strong />
            {gap && <Row k="차이" v={gap} />}
            {v.report.gapReasonLabel && <Row k="차이 사유" v={[v.report.gapReasonLabel, v.report.note].filter(Boolean).join(', ')} />}
          </>
        )}
        {v.confirmDueAt && <Row k="자동 확정" v={shortDate(v.confirmDueAt.slice(0, 10))} />}
        {v.confirmedAt && <Row k="확정" v={`${shortDate(v.confirmedAt.slice(0, 10))}${v.confirmedVia === 'auto' ? ', 7일 뒤 자동' : v.confirmedVia === 'operator' ? ', 단추 확인 뒤' : ''}`} />}
        {v.sponsor && <Row k="내가 알린 결과" v={[v.sponsor.label, v.sponsor.amount ? won(v.sponsor.amount) : '', v.sponsor.date ? shortDate(v.sponsor.date) : ''].filter(Boolean).join(', ')} />}
      </View>

      {v.sponsorSaysSigned && (
        <View style={styles.note} accessibilityRole="alert">
          <HourglassMedium size={u(16)} color={tokens.wait} />
          <Txt variant="caption" color={tokens.wait} style={{ flex: 1, fontFamily: fonts.semibold }}>
            의뢰자가 계약했다고 알려 왔어요
          </Txt>
        </View>
      )}
      {done && (
        <View style={styles.note} accessibilityLiveRegion="polite">
          <CheckCircle size={u(16)} weight="fill" color={tokens.accent} />
          <Txt variant="caption" color={tokens.accent} style={{ flex: 1, fontFamily: fonts.semibold }}>
            {done}
          </Txt>
        </View>
      )}

      <View style={styles.actions}>
        {v.can.report && <Button title="계약 체결 보고" onPress={() => setOpen('report')} />}
        {v.can.correct && <Button title="보고 정정" kind="text" onPress={() => setOpen('report')} />}
        {v.can.confirm && (
          <>
            <Button title="맞아요" onPress={() => setOpen('confirm')} />
            <Button title="실제와 달라요" kind="text" onPress={() => setOpen('dispute')} />
          </>
        )}
        {v.can.tellResult && <Button title="계약 결과 알리기" kind="soft" onPress={() => setOpen('result')} />}
      </View>

      {role === 'cro' && <ReportSheet no={no} v={v} visible={open === 'report'} onClose={() => setOpen(null)} onDone={() => finish(v.can.correct ? '정정했어요. 의뢰자가 다시 확인해요' : '보고했어요. 의뢰자가 확인해요')} />}
      {role === 'requester' && (
        <>
          <ConfirmSheet no={no} v={v} mode={open === 'dispute' ? 'dispute' : 'confirm'} visible={open === 'confirm' || open === 'dispute'} onClose={() => setOpen(null)} onDone={(m) => finish(m)} />
          <ResultSheet no={no} visible={open === 'result'} onClose={() => setOpen(null)} onDone={() => finish('알렸어요')} />
        </>
      )}
    </View>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Txt variant="small" color={tokens.muted} style={styles.k}>
        {k}
      </Txt>
      <Txt variant="small" tabular style={[{ flex: 1, textAlign: 'right' }, strong && { fontFamily: fonts.bold }]}>
        {v}
      </Txt>
    </View>
  );
}

export function Err({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <View style={styles.note} accessibilityRole="alert">
      <WarningCircle size={u(16)} weight="fill" color={tokens.danger} />
      <Txt variant="caption" color={tokens.danger} style={{ flex: 1, fontFamily: fonts.semibold }}>
        {text}
      </Txt>
    </View>
  );
}

/** 기관: 계약 체결 보고(정정 포함). 선정 견적과 10% 이상 다르면 차이 사유를 고른다 */
function ReportSheet({ no, v, visible, onClose, onDone }: { no: string; v: ContractView; visible: boolean; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const n = digitsOnly(amount);
  const need = needsGapReason(v.quoteAmount, n ? Number(n) : null);
  const go = async () => {
    const b = reportBody(v, { date, amount, gapReason: reason, note });
    if (!b.ok) return setErr(b.error);
    setBusy(true);
    const e = await send('cro', 'contract_report', b.body, no);
    setBusy(false);
    if (e) return setErr(e);
    onDone();
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onShow={() => {
        setDate(v.report?.date ?? today());
        setAmount(v.report ? String(v.report.amount) : '');
        setReason(v.report?.gapReason ?? null);
        setNote(v.report?.note ?? '');
        setErr(null);
      }}
    >
      <SheetBody title={v.can.correct ? '보고를 고칠까요?' : '계약을 체결했나요?'} onClose={onClose} primary={<Button title={v.can.correct ? '정정하기' : '보고하기'} tall loading={busy} onPress={() => void go()} />}>
        <ScrollView style={{ maxHeight: u(440) }} contentContainerStyle={{ gap: space.lg }} keyboardShouldPersistTaps="handled">
          <Field label="체결일" value={date} onChangeText={setDate} placeholder="2026-11-21" keyboardType="numbers-and-punctuation" maxLength={10} />
          <Field
            label="계약 금액(부가세 별도)"
            value={n ? Number(n).toLocaleString('ko-KR') : ''}
            onChangeText={(t) => setAmount(digitsOnly(t))}
            keyboardType="number-pad"
            help={v.quoteAmount ? `선정 견적 ${won(v.quoteAmount)}` : undefined}
          />
          {need && (
            <View style={{ gap: space.xs }}>
              <Txt variant="small" style={{ fontFamily: fonts.semibold }}>
                차이 사유
              </Txt>
              {v.gapRule.reasons.map((r) => (
                <Press key={r.id} label={r.label} accessibilityRole="radio" accessibilityState={{ selected: reason === r.id }} style={styles.option} onPress={() => setReason(r.id)}>
                  <Txt variant="body" style={{ flex: 1, fontFamily: reason === r.id ? fonts.semibold : fonts.regular }}>
                    {r.label}
                  </Txt>
                  <CheckMark on={reason === r.id} />
                </Press>
              ))}
            </View>
          )}
          <Field label="비고" value={note} onChangeText={setNote} maxLength={300} />
          <Err text={err} />
        </ScrollView>
      </SheetBody>
    </Sheet>
  );
}

/** 의뢰자: 기관 보고가 맞는지. 맞으면 확정, 다르면 단추가 기관과 확인한다(정산 멈춤) */
function ConfirmSheet({ no, v, mode, visible, onClose, onDone }: { no: string; v: ContractView; mode: 'confirm' | 'dispute'; visible: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const b = confirmBody(mode, note);
    if (!b.ok) return setErr(b.error);
    setBusy(true);
    const e = await send('requester', 'contract_confirm', b.body, no);
    setBusy(false);
    if (e) return setErr(e);
    onDone(mode === 'confirm' ? '확인했어요. 계약이 확정됐어요' : '알렸어요. 단추가 기관과 확인해요');
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onShow={() => {
        setNote('');
        setErr(null);
      }}
    >
      <SheetBody
        title={mode === 'confirm' ? '계약 내용이 맞나요?' : '어떤 점이 달라요?'}
        onClose={onClose}
        primary={<Button title={mode === 'confirm' ? '맞아요, 확정하기' : '단추에 알리기'} tall loading={busy} onPress={() => void go()} />}
      >
        <View style={{ gap: space.lg }}>
          {v.report && (
            <Txt variant="body" tabular>
              {`${v.lab}, 체결일 ${shortDate(v.report.date)}, ${won(v.report.amount)}`}
            </Txt>
          )}
          {mode === 'dispute' && <Field label="실제와 다른 점" value={note} onChangeText={setNote} maxLength={500} multiline style={{ height: u(96), paddingTop: space.md, textAlignVertical: 'top' }} />}
          <Err text={err} />
        </View>
      </SheetBody>
    </Sheet>
  );
}

/** 의뢰자: 기관 보고 전에 계약 결과를 알린다(기관 보고와 따로 남고, 다르면 단추가 확인한다) */
function ResultSheet({ no, visible, onClose, onDone }: { no: string; visible: boolean; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState<ResultStatus | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!status) return setErr('결과를 골라 주세요');
    const b = resultBody(status, amount, date, '');
    if (!b.ok) return setErr(b.error);
    setBusy(true);
    const e = await send('requester', 'contract_result', b.body, no);
    setBusy(false);
    if (e) return setErr(e);
    onDone();
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onShow={() => {
        setStatus(null);
        setAmount('');
        setDate('');
        setErr(null);
      }}
    >
      <SheetBody title="계약은 어떻게 됐어요?" onClose={onClose} primary={<Button title={status ? '알리기' : '고르기 전'} tall disabled={!status} loading={busy} onPress={() => void go()} />}>
        <ScrollView style={{ maxHeight: u(440) }} contentContainerStyle={{ gap: space.lg }} keyboardShouldPersistTaps="handled">
          <View>
            {RESULT_OPTIONS.map((o) => (
              <Press key={o.id} label={o.label} accessibilityRole="radio" accessibilityState={{ selected: status === o.id }} style={styles.option} onPress={() => setStatus(o.id)}>
                <Txt variant="body" style={{ flex: 1, fontFamily: status === o.id ? fonts.semibold : fonts.regular }}>
                  {o.label}
                </Txt>
                <CheckMark on={status === o.id} />
              </Press>
            ))}
          </View>
          {status === 'signed' && (
            <>
              <Field label="계약 금액(아는 경우)" value={digitsOnly(amount) ? Number(digitsOnly(amount)).toLocaleString('ko-KR') : ''} onChangeText={(t) => setAmount(digitsOnly(t))} keyboardType="number-pad" />
              <Field label="계약일(아는 경우)" value={date} onChangeText={setDate} placeholder="2026-11-21" keyboardType="numbers-and-punctuation" maxLength={10} />
            </>
          )}
          <Err text={err} />
        </ScrollView>
      </SheetBody>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, paddingHorizontal: space.lg, paddingVertical: u(14), gap: u(8) },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: u(5), gap: space.md },
  k: { width: u(88) },
  note: { flexDirection: 'row', alignItems: 'center', gap: u(6) },
  actions: { gap: u(2), marginTop: u(4) },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: u(52), borderTopWidth: 1, borderTopColor: tokens.border },
});
