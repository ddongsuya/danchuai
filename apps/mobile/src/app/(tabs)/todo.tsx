// 할 일 탭(시안 원본 m07). "지켜보는 중"(초록 점)과 "목표"(파란 점, 기관만) 두 묶음, 체크칸 + 설명 + 점 세 개,
// 맨 아래 "+ 할 일 만들기"(기관: 비서에게 단추 할 일을 만들어 달라고 넘긴다). 체크는 기기 안에만 둔다.
// 목표는 이번 달 수주 건수. 숫자는 단추 기간 보고(코드 계산) 그대로 쓴다.
import { router, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { requesterHref } from '@/components/agent/RequesterHome';
import { CircleButton } from '@/components/shell/AgentHeader';
import { useShell } from '@/components/shell/ShellContext';
import { TabPage } from '@/components/shell/TabPage';
import { Button } from '@/components/ui/Button';
import { MIcon } from '@/components/ui/MIcon';
import { BottomSheet, Chk, Group, Item, Li, Sec } from '@/components/ui/Muse';
import { Press } from '@/components/ui/Press';
import { StateView } from '@/components/ui/StateView';
import { Txt } from '@/components/ui/Txt';
import { fonts, tokens } from '@/constants/theme';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { agentConfigured, readDanchu } from '@/lib/agentClient';
import { requesterItem } from '@/lib/inbox';
import { useLocalSet } from '@/lib/localSet';
import { fetchDanchuLabInbox, fetchRequests } from '@/lib/marketClient';
import { useAuth } from '@/lib/session';
import { goalSub, labWatch, monthRange, requesterWatch, type ReportView, type WatchRow } from '@/lib/todo';

const loadLab = () => fetchDanchuLabInbox().then(labWatch);
const loadReq = () => fetchRequests().then((r) => requesterWatch(r.map((x) => requesterItem(x))));

export default function TodoTab() {
  const { role, handoff } = useShell();
  const { prefs, setPrefs } = useAuth();
  const live = agentConfigured();
  const { state, reload } = useRemote<WatchRow[]>(role === 'cro' ? loadLab : loadReq, live);
  const loadReport = useCallback(() => {
    const r = monthRange();
    return readDanchu<{ report: ReportView }>('report', { from: r.from, to: r.to }).then((x) => x.report);
  }, []);
  const report = useRemote<ReportView>(loadReport, live && role === 'cro' && prefs.winGoal != null);
  return (
    <TodoView
      cro={role === 'cro'}
      rows={!live ? [] : state.kind === 'ready' ? state.data : null}
      error={!live ? '아직 연결하는 중이에요' : state.kind === 'error' ? REMOTE_ERROR[state.code] : null}
      onRetry={() => void reload()}
      goal={prefs.winGoal}
      report={report.state.kind === 'ready' ? report.state.data : null}
      onGoal={(n) => setPrefs({ winGoal: n })}
      onOpen={(id) => router.push(role === 'cro' ? { pathname: '/lab/[id]', params: { id } } : requesterHref(id))}
      onCreate={(text) => {
        handoff({ kind: 'send', text: `할 일 만들어 줘: ${text}` });
        router.navigate('/' as Href);
      }}
    />
  );
}

export interface TodoViewProps {
  cro: boolean;
  rows: WatchRow[] | null;
  error: string | null;
  onRetry: () => void;
  goal: number | null;
  report: ReportView | null;
  onGoal: (n: number | null) => Promise<void> | void;
  onOpen: (id: string) => void;
  onCreate: (text: string) => void;
  /** 미리보기에서 체크해 둘 줄 */
  initialDone?: string[];
  now?: Date;
}

/** 화면 모양만(미리보기에서도 쓴다) */
export function TodoView({ cro, rows, error, onRetry, goal, report, onGoal, onOpen, onCreate, initialDone, now }: TodoViewProps) {
  const [done, toggle] = useLocalSet('danchuai.todo.done', initialDone);
  const [sheet, setSheet] = useState<null | 'more' | 'goal' | 'new'>(null);
  const [text, setText] = useState('');
  const month = monthRange(now).month;
  const shown = useMemo(() => rows ?? [], [rows]);
  return (
    <TabPage
      title="할 일"
      right={
        <CircleButton label="더보기" onPress={() => setSheet('more')}>
          <MIcon name="more" />
        </CircleButton>
      }
    >
      <Sec color={tokens.ok} first>
        지켜보는 중
      </Sec>
      {error ? (
        <StateView tone="error" title={error} actions={<Button title="다시 시도" kind="soft" tall onPress={onRetry} />} />
      ) : rows === null ? (
        <View accessibilityLabel="불러오는 중이에요" accessibilityRole="progressbar" style={{ gap: 14, paddingVertical: 10 }}>
          {[0, 1].map((i) => (
            <View key={i} style={styles.bone} />
          ))}
        </View>
      ) : !shown.length ? (
        <Txt variant="mItemSub" color={tokens.muted} style={styles.none}>
          지금 지켜볼 요청이 없어요. 새 요청이 오면 여기 올려 둘게요.
        </Txt>
      ) : (
        shown.map((r) => <Item key={r.id} lead={<Chk on={done.has(r.id)} onPress={() => toggle(r.id)} label={`${r.title} 다 봤어요`} />} title={r.title} sub={r.sub} onPress={() => onOpen(r.id)} onMore={() => onOpen(r.id)} />)
      )}
      {cro && (
        <>
          <Sec color={tokens.primary}>목표</Sec>
          <Item
            lead={
              <View style={styles.lead}>
                <MIcon name="chevron" size={18} color={tokens.muted} />
              </View>
            }
            title={goal ? `${month}월 수주 ${goal}건` : `${month}월 수주 목표`}
            sub={goal ? goalSub(report) : '목표를 정하면 이번 달 수주를 단추 보고로 세어 드려요.'}
            onPress={() => setSheet('goal')}
            onMore={() => setSheet('goal')}
          />
          <Press label="할 일 만들기" onPress={() => setSheet('new')} style={styles.add}>
            <MIcon name="plus" size={18} />
            <Txt style={styles.addText}>할 일 만들기</Txt>
          </Press>
        </>
      )}
      <BottomSheet visible={sheet === 'more'} onClose={() => setSheet(null)} label="더보기">
        <Group style={{ backgroundColor: tokens.group }}>
          {cro && <Li first icon="pin" title="목표 정하기" onPress={() => setSheet('goal')} />}
          <Li
            first={!cro}
            icon="check"
            title="체크한 것 풀기"
            onPress={() => {
              [...done].forEach((id) => toggle(id));
              setSheet(null);
            }}
          />
        </Group>
      </BottomSheet>
      <GoalSheet visible={sheet === 'goal'} goal={goal} month={month} onClose={() => setSheet(null)} onSave={onGoal} />
      <BottomSheet visible={sheet === 'new'} onClose={() => setSheet(null)} label="할 일 만들기">
        <Txt variant="mSheet">무엇을 할까요?</Txt>
        <TextInput value={text} onChangeText={setText} placeholder="할 일" placeholderTextColor={tokens.muted} accessibilityLabel="할 일" style={styles.input} selectionColor={tokens.primary} />
        <Button
          title="만들어 주세요"
          tall
          disabled={!text.trim()}
          onPress={() => {
            const t = text.trim();
            setText('');
            setSheet(null);
            onCreate(t);
          }}
        />
      </BottomSheet>
    </TabPage>
  );
}

function GoalSheet({ visible, goal, month, onClose, onSave }: { visible: boolean; goal: number | null; month: number; onClose: () => void; onSave: (n: number | null) => Promise<void> | void }) {
  const [v, setV] = useState(goal ? String(goal) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const n = Number(v);
  const ok = Number.isInteger(n) && n >= 1 && n <= 999;
  const save = async (x: number | null) => {
    setBusy(true);
    setErr(false);
    try {
      await onSave(x);
      onClose();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} label="목표 정하기">
      <Txt variant="mSheet">{month}월에 몇 건 수주할까요?</Txt>
      <TextInput value={v} onChangeText={(t) => setV(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="5" placeholderTextColor={tokens.muted} accessibilityLabel="수주 목표 건수" style={styles.input} selectionColor={tokens.primary} />
      {err ? (
        <Txt variant="mSmall" color={tokens.danger}>
          저장하지 못했어요. 한 번 더 해 볼까요?
        </Txt>
      ) : null}
      <Button title="이 목표로 할게요" tall disabled={!ok} loading={busy} onPress={() => void save(n)} />
      {goal ? <Button title="목표 지우기" kind="soft" tall disabled={busy} onPress={() => void save(null)} /> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  bone: { height: 44, borderRadius: 10, backgroundColor: tokens.sunken },
  none: { paddingHorizontal: 2, paddingVertical: 10 },
  lead: { width: 20, alignItems: 'center', paddingTop: 2 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: tokens.line, marginTop: 8, paddingVertical: 12, paddingHorizontal: 2 },
  addText: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  input: { height: 48, borderRadius: 14, backgroundColor: tokens.group, paddingHorizontal: 14, fontFamily: fonts.regular, fontSize: 15, color: tokens.text },
});
