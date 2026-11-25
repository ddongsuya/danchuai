// 보낸 것: 우리 조직이 승인해 단추로 보낸 동작(최근 50건, 의뢰자·기관 공통). 결과 확인 필요·받지 않음은 색으로 먼저 보인다.
// 줄을 누르면 그 요청 화면으로 간다. 본문 원문은 요청 화면의 카드에서 본다.
import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NavBar } from '@/components/chat/NavBar';
import { NotFound } from '@/components/chat/NotFound';
import { Button } from '@/components/ui/Button';
import { Press } from '@/components/ui/Press';
import { StateView } from '@/components/ui/StateView';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { agentConfigured, listSent, type AgentRole } from '@/lib/agentClient';
import { STATUS_LABEL, sentHref, sentLabel, sentMeta, type SentItem } from '@/lib/sent';

/** "11.24 10:31" (기기 시간) */
const when = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function SentRoute() {
  const { role: raw } = useLocalSearchParams<{ role?: string }>();
  const role: AgentRole = raw === 'cro' ? 'cro' : 'requester';
  const live = agentConfigured();
  const load = useCallback(() => listSent(role), [role]);
  const { state, reload } = useRemote(load, live);
  if (!live) return <NotFound label="아직 연결하는 중이에요" reason="조금 뒤에 다시 열어 주세요" />;
  return <SentView role={role} items={state.kind === 'ready' ? state.data : null} error={state.kind === 'error' ? REMOTE_ERROR[state.code] : null} onRetry={() => void reload()} />;
}

const TONE: Record<SentItem['status'], string> = { sent: tokens.muted, failed: tokens.danger, unknown: tokens.wait, rejected: tokens.muted };

export function SentView({ role, items, error, onRetry }: { role: AgentRole; items: SentItem[] | null; error: string | null; onRetry: () => void }) {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <NavBar title="보낸 것" />
      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <StateView tone="error" title={error} actions={<Button title="다시 시도" kind="soft" tall onPress={onRetry} />} />
        ) : items === null ? (
          <StateView tone="wait" title="불러오는 중이에요" />
        ) : !items.length ? (
          <StateView tone="empty" title="아직 보낸 게 없어요" reason="허용한 일은 보낸 뒤 여기 남아요" />
        ) : (
          <View style={styles.card}>
            {items.map((it, i) => {
              const href = sentHref(role, it);
              const body = (
                <View style={{ flex: 1, gap: u(2) }}>
                  <View style={styles.top}>
                    <Txt variant="small" style={{ fontFamily: fonts.semibold, flex: 1 }} numberOfLines={1}>
                      {sentLabel(it.action)}
                    </Txt>
                    <Txt variant="caption" color={TONE[it.status]} style={{ fontFamily: fonts.semibold }}>
                      {STATUS_LABEL[it.status]}
                    </Txt>
                  </View>
                  <Txt variant="caption" color={tokens.muted} tabular numberOfLines={1}>
                    {sentMeta(it, when)}
                  </Txt>
                  {it.reason && (
                    <Txt variant="caption" color={tokens.danger} numberOfLines={2}>
                      {it.reason}
                    </Txt>
                  )}
                </View>
              );
              return href ? (
                <Press key={it.id} label={`${sentLabel(it.action)}, ${STATUS_LABEL[it.status]}`} onPress={() => router.push(href)} style={[styles.row, i > 0 && styles.line]}>
                  {body}
                </Press>
              ) : (
                <View key={it.id} style={[styles.row, i > 0 && styles.line]}>
                  {body}
                </View>
              );
            })}
          </View>
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
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
});
