// 2차 상세 요청 카드(의뢰자·기관). 비교표가 열린 뒤 의뢰자가 1~3곳에 바꾼 조건을 보내고, 기관이 2차로 답한다.
// 보낼 수 있는 때·기관·조건 칸은 단추 detail_view 가 정한다. 시트의 주 버튼을 누른 것이 승인이고, 실행은 보내기 장부가 한 번만 한다.
// 2차 견적 금액은 기관 견적서에서 단추가 채운다(앱·AI가 금액을 만들지 않는다).
import { ArrowsClockwise, ArrowSquareOut, CheckCircle } from 'phosphor-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { Err } from '@/components/contract/ContractCard';
import { Button } from '@/components/ui/Button';
import { CheckMark } from '@/components/ui/Checkbox';
import { Chip } from '@/components/ui/Chip';
import { Field } from '@/components/ui/Field';
import { Press } from '@/components/ui/Press';
import { Sheet, SheetBody } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { readDanchu } from '@/lib/agentClient';
import { CRO_STATUS_LABEL, daysFrom, detailReplyBody, detailRequestBody, type CroDetailView, type DetailField, type DetailLine, type RequesterDetailView } from '@/lib/danchuDetail';
import { DANCHU_URL } from '@/lib/danchuLinks';
import { sendApproved } from '@/lib/danchuSend';
import { shortDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';

const won = (n: number | null) => (n == null ? '미기재' : `${n.toLocaleString('ko-KR')}원`);

function Lines({ lines }: { lines: DetailLine[] }) {
  return (
    <>
      {lines.map((l) => (
        <View key={l.key} style={styles.row}>
          <Txt variant="small" color={tokens.muted} style={styles.k} numberOfLines={2}>
            {l.label}
          </Txt>
          <Txt variant="small" style={{ flex: 1, textAlign: 'right' }}>
            {l.was && l.was !== '미정' ? `${l.was} → ${l.now}` : l.now}
          </Txt>
        </View>
      ))}
    </>
  );
}

function Done({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <View style={styles.note} accessibilityLiveRegion="polite">
      <CheckCircle size={u(16)} weight="fill" color={tokens.accent} />
      <Txt variant="caption" color={tokens.accent} style={{ flex: 1, fontFamily: fonts.semibold }}>
        {text}
      </Txt>
    </View>
  );
}

function Head({ chip, tone }: { chip?: string; tone?: 'accent' | 'wait' | 'mute' }) {
  return (
    <View style={styles.head}>
      <ArrowsClockwise size={u(18)} color={tokens.text} />
      <Txt variant="label" style={{ flex: 1, fontFamily: fonts.bold }} accessibilityRole="header">
        2차 상세 견적
      </Txt>
      {chip && <Chip label={chip} kind={tone} />}
    </View>
  );
}

/* ── 의뢰자 ── */

export function RequesterDetailCard({ no, initial }: { no: string; initial?: RequesterDetailView }) {
  const [v, setV] = useState<RequesterDetailView | null | 'none'>(initial ?? null);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const load = useCallback(() => {
    if (initial) return () => {};
    let live = true;
    readDanchu<RequesterDetailView>('detail_view', {}, no, 'requester')
      .then((r) => live && setV(r ?? 'none'))
      .catch(() => live && setV('none'));
    return () => {
      live = false;
    };
  }, [no, initial]);
  useEffect(() => load(), [load]);

  if (!v || v === 'none' || (!v.sent && !v.canSend)) return null;
  const s = v.sent;
  return (
    <View style={styles.card}>
      <Head chip={s ? `${s.targets.filter((t) => t.status !== 'sent').length}/${s.targets.length} 회신` : undefined} tone="wait" />
      {s ? (
        <>
          <Lines lines={[...s.changed, ...s.added]} />
          {s.targets.map((t, i) => (
            <View key={t.quoteId} style={[styles.row, i === 0 && styles.line]}>
              <Txt variant="small" style={[styles.k, { fontFamily: fonts.semibold }]} numberOfLines={1}>
                {t.lab}
              </Txt>
              <Txt variant="small" tabular color={t.status === 'sent' ? tokens.wait : tokens.text} style={{ flex: 1, textAlign: 'right' }}>
                {t.status === 'submitted' ? `${won(t.total)}${t.weeks ? `, ${t.weeks}주` : ''}` : t.statusLabel}
              </Txt>
            </View>
          ))}
          <Txt variant="caption" color={tokens.muted}>
            {`회신 기한 ${shortDate(s.replyBy)}`}
          </Txt>
        </>
      ) : (
        <Button title="조건 바꿔 2차 견적 받기" kind="soft" onPress={() => setOpen(true)} />
      )}
      <Done text={done} />
      {v.canSend && (
        <RequestSheet
          no={no}
          v={v}
          visible={open}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            setDone('2차 상세 요청을 보냈어요');
            haptic.success();
            load();
          }}
        />
      )}
    </View>
  );
}

function RequestSheet({ no, v, visible, onClose, onDone }: { no: string; v: RequesterDetailView; visible: boolean; onClose: () => void; onDone: () => void }) {
  const [ids, setIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<Record<string, string | string[]>>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [replyBy, setReplyBy] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const b = detailRequestBody(v, { quoteIds: ids, detail, replyBy, note });
    if (!b.ok) return setErr(b.error);
    setBusy(true);
    const e = await sendApproved('requester', 'detail', b.body, no);
    setBusy(false);
    if (e) return setErr(e);
    onDone();
  };
  const show = (f: DetailField) => {
    const x = detail[f.key];
    return (Array.isArray(x) ? x.join(', ') : x) || f.current || '비어 있음';
  };
  const pick = (f: DetailField, o: string) => {
    if (f.type !== 'chips') {
      setDetail((d) => ({ ...d, [f.key]: o }));
      return setOpenKey(null);
    }
    const now = detail[f.key] ?? (f.current ? f.current.split(', ') : []);
    const list = Array.isArray(now) ? now : [now];
    setDetail((d) => ({ ...d, [f.key]: list.includes(o) ? list.filter((x) => x !== o) : [...list, o] }));
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onShow={() => {
        setIds([]);
        setDetail({});
        setOpenKey(null);
        setReplyBy(daysFrom(7));
        setNote('');
        setErr(null);
      }}
    >
      <SheetBody title="어떤 조건으로 다시 받을까요?" onClose={onClose} primary={<Button title="2차 요청 보내기" tall loading={busy} onPress={() => void go()} />}>
        <ScrollView style={{ maxHeight: u(480) }} contentContainerStyle={{ gap: space.lg }} keyboardShouldPersistTaps="handled">
          <View>
            <Txt variant="small" style={styles.label}>
              {`받을 기관(최대 ${v.maxTargets}곳)`}
            </Txt>
            {v.targets.map((t) => {
              const on = ids.includes(t.quoteId);
              return (
                <Press
                  key={t.quoteId}
                  label={t.lab}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={styles.option}
                  onPress={() => setIds((x) => (on ? x.filter((y) => y !== t.quoteId) : x.length < v.maxTargets ? [...x, t.quoteId] : x))}
                >
                  <Txt variant="body" style={{ flex: 1, fontFamily: on ? fonts.semibold : fonts.regular }}>
                    {t.lab}
                  </Txt>
                  <CheckMark on={on} />
                </Press>
              );
            })}
          </View>
          <View>
            <Txt variant="small" style={styles.label}>
              바꿀 조건
            </Txt>
            {v.fields.map((f) => (
              <View key={f.key}>
                <Press label={`${f.group} ${f.label}`} style={styles.option} onPress={() => setOpenKey(openKey === f.key ? null : f.key)}>
                  <Txt variant="small" color={tokens.muted} style={styles.k} numberOfLines={2}>
                    {f.label}
                  </Txt>
                  <Txt variant="small" style={{ flex: 1, textAlign: 'right', fontFamily: detail[f.key] ? fonts.semibold : fonts.regular }} numberOfLines={2}>
                    {show(f)}
                  </Txt>
                </Press>
                {openKey === f.key &&
                  (f.options ? (
                    <View style={styles.opts}>
                      {f.options.map((o) => {
                        const cur = detail[f.key] ?? (f.type === 'chips' ? (f.current ?? '').split(', ') : f.current);
                        const on = Array.isArray(cur) ? cur.includes(o) : cur === o;
                        return (
                          <Press key={o} label={o} accessibilityRole={f.type === 'chips' ? 'checkbox' : 'radio'} accessibilityState={f.type === 'chips' ? { checked: on } : { selected: on }} style={[styles.pill, on && styles.pillOn]} onPress={() => pick(f, o)}>
                            <Txt variant="small" color={on ? tokens.onInk : tokens.text}>
                              {o}
                            </Txt>
                          </Press>
                        );
                      })}
                    </View>
                  ) : (
                    <Field label={f.label} value={typeof detail[f.key] === 'string' ? (detail[f.key] as string) : ''} onChangeText={(t) => setDetail((d) => ({ ...d, [f.key]: t }))} maxLength={300} />
                  ))}
              </View>
            ))}
          </View>
          <Field label="회신 기한" value={replyBy} onChangeText={setReplyBy} keyboardType="numbers-and-punctuation" maxLength={10} />
          <Field label="메모" value={note} onChangeText={setNote} maxLength={2000} multiline style={styles.multi} />
          <Err text={err} />
        </ScrollView>
      </SheetBody>
    </Sheet>
  );
}

/* ── 기관 ── */

export function CroDetailCard({ no, initial }: { no: string; initial?: CroDetailView }) {
  const [v, setV] = useState<CroDetailView | null | 'none'>(initial ?? null);
  const [mode, setMode] = useState<'revise' | 'keep' | 'decline' | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const load = useCallback(() => {
    if (initial) return () => {};
    let live = true;
    readDanchu<{ detail: CroDetailView }>('detail_view', {}, no, 'cro')
      .then((r) => live && setV(r?.detail ?? 'none'))
      .catch(() => live && setV('none'));
    return () => {
      live = false;
    };
  }, [no, initial]);
  useEffect(() => load(), [load]);

  if (!v || v === 'none') return null;
  return (
    <View style={styles.card}>
      <Head chip={v.expired && v.status === 'sent' ? '기한 지남' : CRO_STATUS_LABEL[v.status]} tone={v.status === 'sent' && !v.expired ? 'wait' : 'mute'} />
      <Lines lines={[...v.changed, ...v.added]} />
      <View style={[styles.row, styles.line]}>
        <Txt variant="small" color={tokens.muted} style={styles.k}>
          1차 견적
        </Txt>
        <Txt variant="small" tabular style={{ flex: 1, textAlign: 'right' }}>
          {won(v.first.total)}
        </Txt>
      </View>
      {v.reply?.total != null && (
        <View style={styles.row}>
          <Txt variant="small" color={tokens.muted} style={styles.k}>
            2차 견적
          </Txt>
          <Txt variant="small" tabular style={{ flex: 1, textAlign: 'right', fontFamily: fonts.bold }}>
            {won(v.reply.total)}
          </Txt>
        </View>
      )}
      <Txt variant="caption" color={tokens.muted}>
        {`회신 기한 ${shortDate(v.replyBy)}`}
      </Txt>
      <Done text={done} />
      {v.canReply && (
        <View style={{ gap: u(2) }}>
          <Button title="견적서 고쳐서 2차 견적 보내기" onPress={() => setMode('revise')} />
          <Button title="1차 그대로 진행" kind="text" onPress={() => setMode('keep')} />
          <Button title="이번에는 2차 회신 안 함" kind="text" onPress={() => setMode('decline')} />
        </View>
      )}
      <ReplySheet
        no={no}
        v={v}
        mode={mode}
        onClose={() => setMode(null)}
        onDone={(m) => {
          setMode(null);
          setDone(m);
          haptic.success();
          load();
        }}
      />
    </View>
  );
}

const REPLY_TITLE = { revise: '견적서 금액으로 2차 견적을 보낼까요?', keep: '1차 견적 그대로 진행할까요?', decline: '이번에는 2차 회신을 하지 않을까요?' } as const;
const REPLY_BUTTON = { revise: '2차 견적 보내기', keep: '그대로 진행', decline: '회신 안 함' } as const;

function ReplySheet({ no, v, mode, onClose, onDone }: { no: string; v: CroDetailView; mode: 'revise' | 'keep' | 'decline' | null; onClose: () => void; onDone: (msg: string) => void }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(mode);
  if (mode && mode !== last) setLast(mode);
  const m = mode ?? last;
  const go = async () => {
    if (!m) return;
    const b = detailReplyBody(v, m, note);
    if (!b.ok) return setErr(b.error);
    setBusy(true);
    const e = await sendApproved('cro', 'detail_reply', b.body, no);
    setBusy(false);
    // 견적서가 없거나 금액이 빈 줄이 있으면 단추가 막는다. 견적서 툴에서 2차 조건으로 고친 뒤 다시 보낸다
    if (e) return setErr(e === '단추가 받지 않았어요' && m === 'revise' ? '견적서를 2차 조건으로 고친 뒤 보내 주세요' : e);
    onDone(m === 'revise' ? '2차 견적을 보냈어요' : '답했어요');
  };
  return (
    <Sheet
      visible={mode !== null}
      onClose={onClose}
      onShow={() => {
        setNote('');
        setErr(null);
      }}
    >
      {m && (
        <SheetBody title={REPLY_TITLE[m]} onClose={onClose} primary={<Button title={REPLY_BUTTON[m]} tall loading={busy} onPress={() => void go()} />}>
          <View style={{ gap: space.lg }}>
            {m === 'revise' && <Button title="견적서 툴에서 고치기" kind="text" icon={<ArrowSquareOut size={u(16)} color={tokens.text} />} onPress={() => void Linking.openURL(`${DANCHU_URL}/cro`)} />}
            <Field label="메모" value={note} onChangeText={setNote} maxLength={2000} multiline style={styles.multi} />
            <Err text={err} />
          </View>
        </SheetBody>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, paddingHorizontal: space.lg, paddingVertical: u(14), gap: u(8) },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: u(5), gap: space.md },
  line: { borderTopWidth: 1, borderTopColor: tokens.border, paddingTop: u(9) },
  k: { width: u(96) },
  note: { flexDirection: 'row', alignItems: 'center', gap: u(6) },
  label: { fontFamily: fonts.semibold, marginBottom: space.xs },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: u(52), borderTopWidth: 1, borderTopColor: tokens.border, gap: space.md },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: u(6), paddingBottom: space.md },
  pill: { paddingHorizontal: u(12), paddingVertical: u(7), borderRadius: radius.pill, borderWidth: 1, borderColor: tokens.border },
  pillOn: { backgroundColor: tokens.ink, borderColor: tokens.ink },
  multi: { height: u(96), paddingTop: space.md, textAlignVertical: 'top' },
});
