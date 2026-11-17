// 기관: 받은 요청 열기 → 회신 채팅(견적 금액은 사람이 넣고 코드가 합계) → 보낸 회신과 선정 결과(시안 v4 B1).
// 의뢰자 회사명·담당자는 서버가 이 기관이 선정됐을 때만 보내 준다. 앱은 받은 값만 보여 준다.
import { formatWonShort, type QuoteLine } from '@danchuai/core';
import { ArrowClockwise, CaretDown, CaretUp, SealCheck, WarningCircle } from 'phosphor-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LiveChat } from '@/components/agent/LiveChat';
import { ChatShell } from '@/components/chat/ChatShell';
import { AgentText } from '@/components/chat/Messages';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { dayLabel, fetchLabRequest, markViewed, type LabDetail } from '@/lib/marketClient';

import { QuoteEditor } from './QuoteEditor';

const REPLYING: LabDetail['status'][] = ['received', 'viewed'];

export function LabRequest({ requestId }: { requestId: string }) {
  const load = useCallback(() => fetchLabRequest(requestId), [requestId]);
  const { state, reload } = useRemote(load);
  const viewed = useRef(false);

  // 처음 연 때 한 번 "확인"으로 남긴다(의뢰자 진행 화면에 보인다).
  useEffect(() => {
    if (state.kind === 'ready' && state.data.status === 'received' && !viewed.current) {
      viewed.current = true;
      void markViewed(requestId);
    }
  }, [state, requestId]);

  if (state.kind !== 'ready') {
    return (
      <ChatShell title="받은 요청" bottom={null}>
        {state.kind === 'loading' ? (
          <View accessibilityLabel="불러오는 중" accessibilityRole="progressbar" style={{ gap: space.md }}>
            <View style={[styles.card, { height: 120 }]} />
            <View style={[styles.bone, { width: '60%' }]} />
          </View>
        ) : (
          <View style={styles.row} accessibilityRole="alert">
            <WarningCircle size={16} weight="fill" color={tokens.danger} />
            <Txt variant="caption" color={tokens.danger} style={{ fontFamily: fonts.semibold, flex: 1 }}>
              {REMOTE_ERROR[state.code]}
            </Txt>
            {state.code !== 'not_found' && <Button title="다시 시도" kind="soft" icon={<ArrowClockwise size={14} color={tokens.text} />} onPress={() => void reload()} />}
          </View>
        )}
      </ChatShell>
    );
  }

  const d = state.data;
  if (REPLYING.includes(d.status) && !d.myQuote) return <Reply d={d} onSent={() => void reload()} />;
  return <Result d={d} />;
}

function Reply({ d, onSent }: { d: LabDetail; onSent: () => void }) {
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [weeks, setWeeks] = useState<number | undefined>();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <View style={[styles.fill, editing && styles.hidden]}>
        <LiveChat
          role="cro"
          title={d.title}
          requestId={d.requestId}
          conversationId={d.conversationId ?? undefined}
          requestMessage={d.message}
          quoteLines={lines}
          durationWeeks={weeks}
          onEditQuote={() => setEditing(true)}
          onSent={onSent}
        />
      </View>
      {editing && (
        <View style={StyleSheet.absoluteFill}>
          <QuoteEditor
            initial={lines}
            initialWeeks={weeks}
            onClose={() => setEditing(false)}
            onSave={(l, w) => {
              setLines(l);
              setWeeks(w);
              setEditing(false);
            }}
          />
        </View>
      )}
    </>
  );
}

function Result({ d }: { d: LabDetail }) {
  const q = d.myQuote;
  const [open, setOpen] = useState(false);
  return (
    <ChatShell title={d.title} bottom={null}>
      {d.status === 'selected' && d.requester ? (
        <View style={styles.banner}>
          <View style={styles.bh}>
            <SealCheck size={20} weight="fill" color={tokens.accent} />
            <Txt variant="label" color={tokens.accent} style={{ fontFamily: fonts.bold }}>
              선정됐어요
            </Txt>
          </View>
          <Kv k="의뢰자" v={d.requester.orgName} />
          <Kv k="담당자" v={d.requester.name ?? '미등록'} />
          <Kv k="메일" v={d.requester.email ?? '미등록'} />
          <Kv k="선정일" v={dayLabel(d.requester.selectedAt)} />
        </View>
      ) : d.status === 'not_selected' ? (
        <View style={[styles.banner, styles.muteBanner]}>
          <Txt variant="label" color={tokens.muted} style={{ fontFamily: fonts.bold }}>
            미선정
          </Txt>
        </View>
      ) : d.status === 'declined' ? (
        <AgentText>회신하지 않은 요청이에요.</AgentText>
      ) : (
        <AgentText>회신을 보냈어요. 선정 결과를 기다리는 중이에요.</AgentText>
      )}

      {q && (
        <View style={styles.card}>
          <View style={styles.top}>
            <Txt variant="label" style={{ flex: 1, fontFamily: fonts.bold }}>
              보낸 회신
            </Txt>
            <View>
              <Chip label={dayLabel(q.sentAt)} />
            </View>
          </View>
          <View style={styles.sum}>
            <View style={styles.ln}>
              <Txt variant="small" style={{ fontFamily: fonts.bold }}>
                견적 총액
              </Txt>
              <Txt variant="small" tabular style={{ fontFamily: fonts.bold, fontSize: 16 }}>
                {formatWonShort(q.totalWithVatWon)}
              </Txt>
            </View>
            {q.durationWeeks ? (
              <View style={styles.ln}>
                <Txt variant="small" color={tokens.muted}>
                  소요 기간
                </Txt>
                <Txt variant="small" tabular>
                  {`${q.durationWeeks}주`}
                </Txt>
              </View>
            ) : null}
          </View>
          <Press label="회신 본문" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={[styles.top, styles.line]}>
            <Txt variant="small" color={tokens.muted} style={{ flex: 1, fontFamily: fonts.semibold }}>
              회신 본문
            </Txt>
            {open ? <CaretUp size={16} color={tokens.muted} /> : <CaretDown size={16} color={tokens.muted} />}
          </Press>
          {open && (
            <Txt variant="small" style={styles.body}>
              {q.body ?? ''}
            </Txt>
          )}
        </View>
      )}
    </ChatShell>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kv}>
      <Txt variant="small" color={tokens.muted}>
        {k}
      </Txt>
      <Txt variant="small" style={{ fontFamily: fonts.semibold, flexShrink: 1, textAlign: 'right' }} selectable>
        {v}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hidden: { display: 'none' },
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' },
  bone: { height: 16, borderRadius: 8, backgroundColor: tokens.sunken },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  banner: { padding: space.lg, borderRadius: radius.card, backgroundColor: tokens.accentSoft, gap: space.sm },
  muteBanner: { backgroundColor: tokens.sunken },
  bh: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 2 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, minHeight: 52 },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  sum: { marginHorizontal: space.md, marginBottom: space.md, padding: space.md, borderRadius: radius.inner, backgroundColor: tokens.sunken, gap: 6 },
  ln: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  body: { paddingHorizontal: space.lg, paddingBottom: space.lg },
});
