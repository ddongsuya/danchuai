// 질의응답 카드(의뢰자·기관 공통). 견적 중에 서로 묻고 답하는 것을 앱에서 끝낸다.
// 목록·가림·질의할 수 있는 때는 단추 qna_view 가 정한다. 시트의 주 버튼을 누른 것이 승인이고, 실행은 보내기 장부가 한 번만 한다.
// 의뢰자는 비교표가 열린 뒤 견적을 낸 기관에, 기관은 참여 뒤 비교표가 열리기 전까지 의뢰자에게 질의한다(단추 규칙).
import { ChatCircleText, CheckCircle } from 'phosphor-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Err } from '@/components/contract/ContractCard';
import { Button } from '@/components/ui/Button';
import { CheckMark } from '@/components/ui/Checkbox';
import { Chip } from '@/components/ui/Chip';
import { Field } from '@/components/ui/Field';
import { Press } from '@/components/ui/Press';
import { Sheet, SheetBody } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { readDanchu, type AgentRole } from '@/lib/agentClient';
import { answerBody, askBody, qnaItems, QNA_MAX, type QnaItem, type QnaView } from '@/lib/danchuQna';
import { sendApproved } from '@/lib/danchuSend';
import { monthDay } from '@/lib/format';
import { haptic } from '@/lib/haptics';

/** 보이는 줄 수. 더 있으면 "더 보기" */
const SHOW = 4;

export function QnaCard({ role, no, initial }: { role: AgentRole; no: string; initial?: QnaView }) {
  const [v, setV] = useState<QnaView | null | 'none'>(initial ?? null);
  const [asking, setAsking] = useState(false);
  const [answering, setAnswering] = useState<QnaItem | null>(null);
  const [all, setAll] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    if (initial) return () => {};
    let live = true;
    readDanchu<QnaView>('qna_view', {}, no, role)
      .then((r) => live && setV(r ?? 'none'))
      // 참여 전·단추에 입구가 없으면 카드를 숨긴다
      .catch(() => live && setV('none'));
    return () => {
      live = false;
    };
  }, [no, role, initial]);
  useEffect(() => load(), [load]);

  if (!v || v === 'none') return null;
  const items = qnaItems(v);
  if (!items.length && !v.qna.canAsk) return null;
  const shown = all ? items : items.slice(0, SHOW);
  const finish = (msg: string) => {
    setAsking(false);
    setAnswering(null);
    setDone(msg);
    haptic.success();
    load();
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <ChatCircleText size={u(18)} color={tokens.text} />
        <Txt variant="label" style={{ flex: 1, fontFamily: fonts.bold }} accessibilityRole="header">
          질의응답
        </Txt>
        {v.qna.pending > 0 && <Chip label={`답할 질의 ${v.qna.pending}`} kind="wait" />}
      </View>

      {shown.map((q, i) => (
        <View key={q.id} style={[styles.item, i > 0 && styles.line]}>
          <Txt variant="caption" color={tokens.muted} numberOfLines={1}>
            {[q.direction === (role === 'requester' ? 'sponsor' : 'cro') ? '보낸 질의' : '받은 질의', q.party, q.topic, q.test, monthDay(q.at)].filter(Boolean).join(', ')}
          </Txt>
          <Txt variant="small">{q.body}</Txt>
          {q.answer != null ? (
            <Txt variant="small" color={tokens.muted}>
              {`답변: ${q.answer}`}
            </Txt>
          ) : q.toAnswer && v.qna.canAnswer ? (
            <Button title="답하기" kind="soft" onPress={() => setAnswering(q)} />
          ) : (
            <Txt variant="caption" color={tokens.wait}>
              답변 기다리는 중
            </Txt>
          )}
        </View>
      ))}
      {items.length > SHOW && !all && <Button title={`${items.length - SHOW}개 더 보기`} kind="text" onPress={() => setAll(true)} />}

      {done && (
        <View style={styles.note} accessibilityLiveRegion="polite">
          <CheckCircle size={u(16)} weight="fill" color={tokens.accent} />
          <Txt variant="caption" color={tokens.accent} style={{ flex: 1, fontFamily: fonts.semibold }}>
            {done}
          </Txt>
        </View>
      )}

      {v.qna.canAsk && <Button title={role === 'requester' ? '기관에 질의' : '의뢰자에게 질의'} kind="text" onPress={() => setAsking(true)} />}

      <AskSheet role={role} no={no} v={v} visible={asking} onClose={() => setAsking(false)} onDone={() => finish('질의를 보냈어요')} />
      <AnswerSheet role={role} no={no} q={answering} onClose={() => setAnswering(null)} onDone={() => finish('답변을 보냈어요')} />
    </View>
  );
}

function Pick<T extends string | number>({ label, options, value, onPick }: { label: string; options: { id: T; label: string }[]; value: T | null; onPick: (id: T) => void }) {
  return (
    <View>
      <Txt variant="small" style={{ fontFamily: fonts.semibold, marginBottom: space.xs }}>
        {label}
      </Txt>
      {options.map((o) => (
        <Press key={String(o.id)} label={o.label} accessibilityRole="radio" accessibilityState={{ selected: value === o.id }} style={styles.option} onPress={() => onPick(o.id)}>
          <Txt variant="body" style={{ flex: 1, fontFamily: value === o.id ? fonts.semibold : fonts.regular }}>
            {o.label}
          </Txt>
          <CheckMark on={value === o.id} />
        </Press>
      ))}
    </View>
  );
}

function AskSheet({ role, no, v, visible, onClose, onDone }: { role: AgentRole; no: string; v: QnaView; visible: boolean; onClose: () => void; onDone: () => void }) {
  const [inviteId, setInviteId] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [testSeq, setTestSeq] = useState<number>(0);
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const targets = v.qna.targets ?? [];
  const go = async () => {
    const b = askBody(role, { inviteId, topic, testSeq: testSeq || null, body });
    if (!b.ok) return setErr(b.error);
    setBusy(true);
    const e = await sendApproved(role, 'ask', b.body, no);
    setBusy(false);
    if (e) return setErr(e);
    onDone();
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onShow={() => {
        setInviteId(targets.length === 1 ? targets[0].inviteId : null);
        setTopic(null);
        setTestSeq(0);
        setBody('');
        setErr(null);
      }}
    >
      <SheetBody title={role === 'requester' ? '어느 기관에 물어볼까요?' : '의뢰자에게 무엇을 물어볼까요?'} onClose={onClose} primary={<Button title="질의 보내기" tall loading={busy} onPress={() => void go()} />}>
        <ScrollView style={{ maxHeight: u(460) }} contentContainerStyle={{ gap: space.lg }} keyboardShouldPersistTaps="handled">
          {role === 'requester' && targets.length > 1 && <Pick label="기관" options={targets.map((t) => ({ id: t.inviteId, label: t.label }))} value={inviteId} onPick={setInviteId} />}
          <Pick label="주제" options={v.topics} value={topic} onPick={setTopic} />
          {v.qna.tests.length > 1 && <Pick<number> label="시험" options={[{ id: 0, label: '요청 전체' }, ...v.qna.tests.map((t) => ({ id: t.seq, label: t.name }))]} value={testSeq} onPick={setTestSeq} />}
          <Field label="질의 내용" value={body} onChangeText={setBody} maxLength={QNA_MAX} multiline style={styles.multi} />
          <Err text={err} />
        </ScrollView>
      </SheetBody>
    </Sheet>
  );
}

function AnswerSheet({ role, no, q, onClose, onDone }: { role: AgentRole; no: string; q: QnaItem | null; onClose: () => void; onDone: () => void }) {
  const [answer, setAnswer] = useState('');
  const [scope, setScope] = useState<'private' | 'all' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 닫히는 동안에도 마지막 질의를 그대로 보여 준다
  const [last, setLast] = useState<QnaItem | null>(q);
  if (q && q !== last) setLast(q);
  const cur = q ?? last;
  const go = async () => {
    if (!cur) return;
    const b = answerBody(role, { questionId: cur.id, answer, scope });
    if (!b.ok) return setErr(b.error);
    setBusy(true);
    const e = await sendApproved(role, 'answer', b.body, no);
    setBusy(false);
    if (e) return setErr(e);
    onDone();
  };
  return (
    <Sheet
      visible={q !== null}
      onClose={onClose}
      onShow={() => {
        setAnswer('');
        setScope(null);
        setErr(null);
      }}
    >
      {cur && (
        <SheetBody title="어떻게 답할까요?" onClose={onClose} primary={<Button title="답변 보내기" tall loading={busy} onPress={() => void go()} />}>
          <ScrollView style={{ maxHeight: u(460) }} contentContainerStyle={{ gap: space.lg }} keyboardShouldPersistTaps="handled">
            <Txt variant="small" color={tokens.muted}>
              {[cur.party, cur.topic, cur.test].filter(Boolean).join(', ')}
            </Txt>
            <Txt variant="body">{cur.body}</Txt>
            <Field label="답변" value={answer} onChangeText={setAnswer} maxLength={QNA_MAX} multiline style={styles.multi} />
            {role === 'requester' && (
              <Pick
                label="공개 범위"
                options={[
                  { id: 'private', label: '질의한 기관만' },
                  { id: 'all', label: '참여 기관 전체' },
                ]}
                value={scope}
                onPick={setScope}
              />
            )}
            <Err text={err} />
          </ScrollView>
        </SheetBody>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, paddingHorizontal: space.lg, paddingVertical: u(14), gap: u(8) },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  item: { gap: u(4), paddingVertical: u(8) },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  note: { flexDirection: 'row', alignItems: 'center', gap: u(6) },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: u(52), borderTopWidth: 1, borderTopColor: tokens.border },
  multi: { height: u(112), paddingTop: space.md, textAlignVertical: 'top' },
});
