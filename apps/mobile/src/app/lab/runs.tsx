// 실행 기록: 비서가 단추에서 바로 한 일(최근 30건). 7일 안이고 그 뒤 바뀌지 않았으면 되돌릴 수 있다.
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ERROR_LABEL } from '@/components/agent/LiveChat';
import { NavBar } from '@/components/chat/NavBar';
import { NotFound } from '@/components/chat/NotFound';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { AgentHttpError, agentConfigured, listRuns, undoRun, type AssistRunView } from '@/lib/agentClient';

export default function RunsRoute() {
  const live = agentConfigured();
  const { state, reload } = useRemote(listRuns, live);
  if (!live) return <NotFound label="서버 연결 전이에요" reason="잠시 뒤 다시 열어 주세요." />;
  return <RunsView items={state.kind === 'ready' ? state.data : null} error={state.kind === 'error' ? REMOTE_ERROR[state.code] : null} onRetry={() => void reload()} onUndone={() => void reload()} />;
}

const OUTCOME = { done: '완료', failed: '거절됨', unknown: '결과 확인 필요' } as const;
/** "11.20 09:41" (기기 시간) */
const when = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function RunsView({ items, error, onRetry, onUndone }: { items: AssistRunView[] | null; error: string | null; onRetry: () => void; onUndone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const undo = async (id: string) => {
    setBusy(id);
    setFailed(null);
    try {
      await undoRun(id);
      onUndone();
    } catch (e) {
      setFailed(e instanceof AgentHttpError ? ERROR_LABEL[e.code] : ERROR_LABEL.network);
    } finally {
      setBusy(null);
    }
  };
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <NavBar title="실행 기록" />
      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <StateView tone="error" title={error} actions={<Button title="다시 시도" kind="soft" tall onPress={onRetry} />} />
        ) : items === null ? (
          <StateView tone="wait" title="불러오는 중" />
        ) : !items.length ? (
          <StateView tone="empty" title="비서가 한 일 없음" />
        ) : (
          <View style={styles.card}>
            {items.map((r, i) => (
              <View key={r.id} style={[styles.row, i > 0 && styles.line]}>
                <View style={{ flex: 1, gap: u(2) }}>
                  <Txt variant="small" style={{ fontFamily: fonts.semibold }} numberOfLines={1}>
                    {r.label}
                  </Txt>
                  <Txt variant="caption" color={r.outcome === 'failed' ? tokens.danger : tokens.muted} tabular>
                    {[when(r.createdAt), r.undone ? '되돌림' : OUTCOME[r.outcome]].join(', ')}
                  </Txt>
                </View>
                {r.undoable && <Button title="되돌리기" kind="text" loading={busy === r.id} disabled={!!busy} onPress={() => void undo(r.id)} />}
              </View>
            ))}
          </View>
        )}
        {failed && (
          <Txt variant="caption" color={tokens.danger} accessibilityRole="alert">
            {failed}
          </Txt>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  content: { paddingHorizontal: space.xl, paddingTop: u(6), paddingBottom: space.xl, gap: space.md },
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, paddingHorizontal: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: u(60), paddingVertical: u(10) },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
});
