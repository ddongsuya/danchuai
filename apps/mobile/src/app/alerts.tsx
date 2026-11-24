// 알림: 단추가 보낸 알림 최근 30개(의뢰자·기관 공통). 날짜별로 묶고 단추가 준 순서 그대로 보인다.
// 연 뒤 모두 읽음으로 표시한다(읽지 않았던 줄은 이번 화면에서만 점으로 남는다). 요청 번호가 있으면 그 요청 화면으로 간다.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
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
import { agentConfigured, listAlerts, readAllAlerts, type AgentRole } from '@/lib/agentClient';
import { alertHref, groupByDay, unreadCount, type AlertItem } from '@/lib/alerts';
import { DANCHU_URL, openWeb } from '@/lib/danchuLinks';

/** "10:31" (기기 시간) */
const hm = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function AlertsRoute() {
  const { role: raw } = useLocalSearchParams<{ role?: string }>();
  const role: AgentRole = raw === 'cro' ? 'cro' : 'requester';
  const live = agentConfigured();
  const { state, reload } = useRemote(() => listAlerts(role), live);
  const items = state.kind === 'ready' ? state.data : null;
  const unread = items ? unreadCount(items) : 0;
  useEffect(() => {
    if (unread > 0) readAllAlerts(role).catch(() => undefined);
  }, [unread, role]);
  if (!live) return <NotFound label="서버 연결 전이에요" reason="잠시 뒤 다시 열어 주세요." />;
  return <AlertsView role={role} items={items} error={state.kind === 'error' ? REMOTE_ERROR[state.code] : null} onRetry={() => void reload()} />;
}

export function AlertsView({ role, items, error, onRetry, now }: { role: AgentRole; items: AlertItem[] | null; error: string | null; onRetry: () => void; now?: Date }) {
  const open = (a: AlertItem) => {
    const href = alertHref(role, a);
    if (href) router.push(href);
    else if (a.href) void openWeb(`${DANCHU_URL}${a.href}`).catch(() => undefined);
  };
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <NavBar title="알림" />
      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <StateView tone="error" title={error} actions={<Button title="다시 시도" kind="soft" tall onPress={onRetry} />} />
        ) : items === null ? (
          <StateView tone="wait" title="불러오는 중" />
        ) : !items.length ? (
          <StateView tone="empty" title="알림 없음" />
        ) : (
          groupByDay(items, now).map((g) => (
            <View key={g.day} style={{ gap: space.sm }}>
              <Txt variant="caption" color={tokens.muted} style={{ fontFamily: fonts.semibold }} accessibilityRole="header">
                {g.day}
              </Txt>
              <View style={styles.card}>
                {g.items.map((a, i) => (
                  <Press key={a.id} label={`${a.read ? '' : '새 알림, '}${a.title}`} onPress={() => open(a)} disabled={!a.href} style={[styles.row, i > 0 && styles.line]}>
                    <View style={[styles.dot, !a.read && styles.dotOn]} />
                    <View style={{ flex: 1, gap: u(2) }}>
                      <Txt variant="small" style={{ fontFamily: a.read ? fonts.regular : fonts.semibold }} numberOfLines={2}>
                        {a.title}
                      </Txt>
                      {!!a.body && (
                        <Txt variant="caption" color={tokens.muted} numberOfLines={2}>
                          {a.body}
                        </Txt>
                      )}
                      <Txt variant="caption" color={tokens.faint} tabular>
                        {`${a.kind}, ${hm(a.at)}`}
                      </Txt>
                    </View>
                  </Press>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  content: { paddingHorizontal: space.xl, paddingTop: u(6), paddingBottom: space.xl, gap: space.lg },
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, paddingHorizontal: space.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, minHeight: u(60), paddingVertical: u(12) },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  dot: { width: u(8), height: u(8), borderRadius: u(4), marginTop: u(6) },
  dotOn: { backgroundColor: tokens.accent },
});
