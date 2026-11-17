// 의뢰자: 보낸 요청의 진행과 회신 비교(시안 v4 A2), 선정 전 승인(A3).
// 회신은 서버가 준 도착 순 그대로 놓는다. 순위·추천·"최저가" 표시는 없다. 금액은 서버(computeTotals) 값만 쓴다.
import { formatWonShort } from '@danchuai/core';
import { ArrowClockwise, Buildings, CaretDown, CaretUp, Check, CheckCircle, EnvelopeSimple, HourglassMedium, LockSimple, SealCheck, WarningCircle } from 'phosphor-react-native';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatShell } from '@/components/chat/ChatShell';
import { AgentText } from '@/components/chat/Messages';
import { Button } from '@/components/ui/Button';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { Press } from '@/components/ui/Press';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { AgentHttpError } from '@/lib/agentClient';
import { dayLabel, fetchRequest, initialOf, selectLab, type RecipientStatus, type RequesterDetail, type RequesterRecipient } from '@/lib/marketClient';

const STATUS: Record<RecipientStatus, { label: string; kind: ChipTone }> = {
  received: { label: '회신 전', kind: 'wait' },
  viewed: { label: '회신 전', kind: 'wait' },
  replied: { label: '회신 도착', kind: 'accent' },
  declined: { label: '회신 안 함', kind: 'mute' },
  selected: { label: '선정', kind: 'accent' },
  not_selected: { label: '미선정', kind: 'mute' },
};

const when = (r: RequesterRecipient) =>
  r.repliedAt ? `${dayLabel(r.repliedAt)} 회신` : r.viewedAt ? `${dayLabel(r.viewedAt)} 확인` : `${dayLabel(r.receivedAt)} 받음`;

const won = (n: number) => `${formatWonShort(n)} 원`;

export function RequestProgress({ requestId }: { requestId: string }) {
  const load = useCallback(() => fetchRequest(requestId), [requestId]);
  const { state, reload } = useRemote(load);
  const [selecting, setSelecting] = useState(false);

  if (state.kind !== 'ready') {
    return (
      <ChatShell title="요청" bottom={null}>
        {state.kind === 'loading' ? (
          <View accessibilityLabel="불러오는 중" accessibilityRole="progressbar" style={{ gap: space.md }}>
            <View style={[styles.bone, { width: '70%' }]} />
            <View style={[styles.card, { height: u(180) }]} />
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

  const d = state.data;
  const replied = d.recipients.filter((r) => r.quote);
  const canSelect = d.status === 'sent' && replied.length > 0;
  const selected = d.recipients.find((r) => r.labId === d.selectedOrgId);

  return (
    <ChatShell
      title={d.title}
      bottom={
        canSelect ? (
          <View style={styles.selbar}>
            <Button title="기관 선정" tall onPress={() => setSelecting(true)} />
          </View>
        ) : null
      }
    >
      {selected ? (
        <View style={styles.banner}>
          <SealCheck size={u(20)} weight="fill" color={tokens.accent} />
          <Txt variant="label" color={tokens.accent} style={{ fontFamily: fonts.bold, flex: 1 }}>
            {`${selected.labName} 선정 완료`}
          </Txt>
        </View>
      ) : (
        <AgentText>
          {replied.length
            ? `${d.recipients.length}곳 중 ${replied.length}곳이 회신했어요. 도착 순으로 정리했어요.`
            : `${d.recipients.length}곳에 보냈어요. 회신을 기다리는 중이에요.`}
        </AgentText>
      )}

      <View style={styles.card}>
        {d.recipients.map((r, i) => {
          const st = STATUS[r.status];
          return (
            <View key={r.labId} style={[styles.trk, i > 0 && styles.line]} accessibilityLabel={`${r.labName}, ${st.label}, ${when(r)}`}>
              <View style={styles.av}>
                <Txt variant="caption" color={tokens.muted} style={{ fontFamily: fonts.bold }}>
                  {initialOf(r.labName)}
                </Txt>
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="label" numberOfLines={1}>
                  {r.labName}
                </Txt>
                <Txt variant="caption" color={tokens.faint} style={{ marginTop: u(2) }} tabular>
                  {when(r)}
                </Txt>
              </View>
              <Chip
                label={st.label}
                kind={st.kind}
                icon={(c) =>
                  st.kind === 'wait' ? <HourglassMedium size={u(13)} weight="bold" color={c} /> : st.kind === 'accent' ? <Check size={u(13)} weight="bold" color={c} /> : null
                }
              />
            </View>
          );
        })}
      </View>

      {replied.length > 0 && <Compare replies={replied} />}
      {replied.map((r) => (
        <ReplyBody key={r.labId} r={r} />
      ))}

      <SelectSheet
        visible={selecting}
        detail={d}
        replied={replied}
        onClose={() => setSelecting(false)}
        onSelected={() => {
          setSelecting(false);
          void reload();
        }}
      />
    </ChatShell>
  );
}

/** 회신 비교표. 열은 도착 순. 기관끼리 값이 다른 조건 행만 청록 점과 굵기로 표시한다(금액은 늘 달라 제외). */
function Compare({ replies }: { replies: RequesterRecipient[] }) {
  const rows = [
    { label: '견적 총액', values: replies.map((r) => formatWonShort(r.quote!.totalWithVatWon)), money: true },
    { label: '소요 기간', values: replies.map((r) => (r.quote!.durationWeeks ? `${r.quote!.durationWeeks}주` : '미기재')) },
    { label: '견적 항목', values: replies.map((r) => `${r.quote!.lines.length}개`) },
  ];
  const colW = 108;
  return (
    <View style={styles.card}>
      <ScrollView horizontal={replies.length > 2} showsHorizontalScrollIndicator={false} scrollEnabled={replies.length > 2}>
        <View style={{ minWidth: '100%' }}>
          <View style={[styles.tr, styles.head]}>
            <View style={styles.k} />
            {replies.map((r) => (
              <Txt key={r.labId} variant="caption" style={[styles.v, { width: colW, fontFamily: fonts.bold }]} numberOfLines={1}>
                {r.labName}
              </Txt>
            ))}
          </View>
          {rows.map((row) => {
            const differs = !row.money && new Set(row.values).size > 1;
            return (
              <View key={row.label} style={[styles.tr, styles.line]} accessibilityLabel={`${row.label}: ${row.values.join(', ')}`}>
                <View style={[styles.k, styles.kRow]}>
                  {differs && <View style={styles.dot} />}
                  <Txt variant="small" color={differs ? tokens.text : tokens.muted} style={differs && { fontFamily: fonts.semibold }}>
                    {row.label}
                  </Txt>
                </View>
                {row.values.map((v, i) => (
                  <Txt
                    key={i}
                    variant="small"
                    tabular
                    style={[styles.v, { width: colW }, row.money && { fontFamily: fonts.bold, fontSize: u(15.5) }, differs && { fontFamily: fonts.bold }]}
                  >
                    {v}
                  </Txt>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View style={[styles.foot, styles.line]}>
        <Txt variant="caption" color={tokens.muted}>
          부가세 포함
        </Txt>
      </View>
    </View>
  );
}

/** 기관이 보낸 회신 원문(승인된 본문 그대로, 금액 줄은 서버 코드가 붙인 것). 접어 두고 펼쳐 본다. */
function ReplyBody({ r }: { r: RequesterRecipient }) {
  const [open, setOpen] = useState(false);
  const q = r.quote!;
  return (
    <View style={styles.card}>
      <Press label={`${r.labName} 회신`} accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={styles.rh}>
        <Txt variant="label" style={{ flex: 1, fontFamily: fonts.bold }} numberOfLines={1}>
          {`${r.labName} 회신`}
        </Txt>
        <Txt variant="caption" color={tokens.muted} tabular>
          {dayLabel(q.sentAt)}
        </Txt>
        {open ? <CaretUp size={u(16)} color={tokens.muted} /> : <CaretDown size={u(16)} color={tokens.muted} />}
      </Press>
      {open && (
        <View style={styles.rb}>
          <Txt variant="small">{q.body ?? ''}</Txt>
        </View>
      )}
    </View>
  );
}

const SELECT_ERROR: Record<string, string> = {
  not_open: '이미 선정했거나 닫힌 요청이에요',
  not_replied: '회신한 기관만 선정할 수 있어요',
  not_found: '요청을 찾을 수 없어요',
};

function SelectSheet({
  visible,
  detail,
  replied,
  onClose,
  onSelected,
}: {
  visible: boolean;
  detail: RequesterDetail;
  replied: RequesterRecipient[];
  onClose: () => void;
  onSelected: () => void;
}) {
  const [pick, setPick] = useState<string | null>(replied.length === 1 ? replied[0]!.labId : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = replied.find((r) => r.labId === pick) ?? null;
  const others = useMemo(() => detail.recipients.filter((r) => r.labId !== pick).map((r) => r.labName), [detail, pick]);

  const approve = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    setError(null);
    try {
      await selectLab(detail.id, chosen.labId);
      onSelected();
    } catch (e) {
      const code = e instanceof AgentHttpError ? e.status : 0;
      setError(code === 0 ? '연결이 끊겼어요' : code === 404 ? SELECT_ERROR.not_found! : code === 409 ? SELECT_ERROR.not_open! : '선정하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
        <SafeAreaView edges={['bottom']} style={styles.sheetWrap}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.grab} />
            <Txt variant="heading" style={{ fontSize: u(20) }} accessibilityRole="header">
              {chosen ? `${chosen.labName} 선정` : '선정할 기관'}
            </Txt>
            {chosen && (
              <Txt variant="body" color={tokens.muted} tabular style={{ marginTop: u(6) }}>
                {`견적 총액 ${won(chosen.quote!.totalWithVatWon)}${chosen.quote!.durationWeeks ? `, ${chosen.quote!.durationWeeks}주` : ''}`}
              </Txt>
            )}

            {replied.length > 1 && (
              <View style={styles.choices} accessibilityRole="radiogroup">
                {replied.map((r) => {
                  const on = r.labId === pick;
                  return (
                    <Press
                      key={r.labId}
                      label={r.labName}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      onPress={() => setPick(r.labId)}
                      style={[styles.choice, on && styles.choiceOn]}
                    >
                      <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>
                        {r.labName}
                      </Txt>
                      <Txt variant="small" color={tokens.muted} tabular>
                        {formatWonShort(r.quote!.totalWithVatWon)}
                      </Txt>
                      <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                    </Press>
                  );
                })}
              </View>
            )}

            {chosen && (
              <View style={styles.facts}>
                <Fact icon={<Buildings size={u(20)} color={tokens.muted} />} title={`${chosen.labName}에 공개`} sub="회사명, 담당자 이름·메일" />
                {others.length > 0 && <Fact icon={<EnvelopeSimple size={u(20)} color={tokens.muted} />} title={others.join('·')} sub="미선정 표시" line />}
                <Fact icon={<LockSimple size={u(20)} color={tokens.muted} />} title="선정 취소 불가" sub="요청은 선정 완료로 바뀌어요" line />
              </View>
            )}

            {error && (
              <View style={[styles.err, { marginTop: space.md }]} accessibilityRole="alert">
                <WarningCircle size={u(16)} weight="fill" color={tokens.danger} />
                <Txt variant="caption" color={tokens.danger} style={{ fontFamily: fonts.semibold, flex: 1 }}>
                  {error}
                </Txt>
              </View>
            )}

            <View style={styles.acts}>
              <Button title="취소" kind="soft" tall flex={1} onPress={onClose} />
              <Button
                title="승인하고 선정"
                tall
                flex={1.7}
                disabled={!chosen}
                loading={busy}
                icon={<CheckCircle size={u(16)} weight="bold" color={tokens.onInk} />}
                onPress={() => void approve()}
              />
            </View>
          </View>
        </SafeAreaView>
    </Sheet>
  );
}

function Fact({ icon, title, sub, line }: { icon: ReactNode; title: string; sub: string; line?: boolean }) {
  return (
    <View style={[styles.fact, line && styles.line]}>
      {icon}
      <View style={{ flex: 1 }}>
        <Txt variant="body" style={{ fontFamily: fonts.semibold }}>
          {title}
        </Txt>
        <Txt variant="small" color={tokens.muted}>
          {sub}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' },
  bone: { height: u(16), borderRadius: u(8), backgroundColor: tokens.sunken },
  err: { flexDirection: 'row', alignItems: 'center', gap: u(8) },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.lg, borderRadius: radius.card, backgroundColor: tokens.accentSoft },
  trk: { flexDirection: 'row', alignItems: 'center', gap: u(10), paddingVertical: space.md, paddingHorizontal: u(14) },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  av: { width: u(32), height: u(32), borderRadius: u(16), backgroundColor: tokens.sunken, alignItems: 'center', justifyContent: 'center' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: u(11), paddingHorizontal: u(14) },
  head: { backgroundColor: tokens.sunken },
  k: { flex: 1, minWidth: u(84) },
  kRow: { flexDirection: 'row', alignItems: 'center', gap: u(7) },
  v: { textAlign: 'right' },
  dot: { width: u(7), height: u(7), borderRadius: u(4), backgroundColor: tokens.accent },
  foot: { paddingHorizontal: u(14), paddingVertical: u(10) },
  rh: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, minHeight: u(52) },
  rb: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
  selbar: { paddingHorizontal: space.md, paddingTop: space.sm },
  sheetWrap: { paddingHorizontal: space.sm, paddingBottom: space.sm },
  sheet: { backgroundColor: tokens.surface, borderRadius: u(32), paddingTop: u(10), paddingHorizontal: space.xl, paddingBottom: u(22) },
  grab: { width: u(40), height: u(5), borderRadius: u(3), backgroundColor: tokens.border, alignSelf: 'center', marginBottom: u(18) },
  choices: { marginTop: space.lg, gap: space.sm },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: u(52), paddingHorizontal: space.lg, borderRadius: radius.inner, borderWidth: 1, borderColor: tokens.border },
  choiceOn: { borderColor: tokens.ink, borderWidth: 2, paddingHorizontal: space.lg - 1 },
  radio: { width: u(22), height: u(22), borderRadius: u(11), borderWidth: 1.5, borderColor: tokens.borderInput, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: tokens.ink },
  radioDot: { width: u(12), height: u(12), borderRadius: u(6), backgroundColor: tokens.ink },
  facts: { marginTop: u(18) },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: u(11) },
  acts: { flexDirection: 'row', gap: space.sm, marginTop: u(18) },
});
