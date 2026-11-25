// 소식(옛 알림): 단추가 보낸 알림 최근 30개(의뢰자·기관 공통). 단추가 준 순서 그대로 보인다(Muse 소식 카드, 2026-11-25).
// 소식 탭(app/(tabs)/feed.tsx)과 같은 목록을 쓴다. 이 주소는 푸시 알림·옛 링크로 열 때만.
// 연 뒤 모두 읽음으로 표시한다(읽지 않았던 줄은 이번 화면에서만 점으로 남는다). 요청 번호가 있으면 그 요청 화면으로 간다.
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Clock, FileText, Info } from 'phosphor-react-native';
import { useCallback, useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NavBar } from '@/components/chat/NavBar';
import { NotFound } from '@/components/chat/NotFound';
import { Button } from '@/components/ui/Button';
import { Press } from '@/components/ui/Press';
import { StateView } from '@/components/ui/StateView';
import { Txt } from '@/components/ui/Txt';
import { space, tokens } from '@/constants/theme';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { agentConfigured, listAlerts, readAllAlerts, type AgentRole } from '@/lib/agentClient';
import { alertHref, dayLabel, unreadCount, type AlertItem } from '@/lib/alerts';
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
  const load = useCallback(() => listAlerts(role), [role]);
  const { state, reload } = useRemote(load, live);
  const items = state.kind === 'ready' ? state.data : null;
  const unread = items ? unreadCount(items) : 0;
  useEffect(() => {
    if (unread > 0) readAllAlerts(role).catch(() => undefined);
  }, [unread, role]);
  if (!live) return <NotFound label="서버 연결 전이에요" reason="잠시 뒤 다시 열어 주세요." />;
  return <AlertsView role={role} items={items} error={state.kind === 'error' ? REMOTE_ERROR[state.code] : null} onRetry={() => void reload()} />;
}

export function AlertsView({ role, items, error, onRetry, now }: { role: AgentRole; items: AlertItem[] | null; error: string | null; onRetry: () => void; now?: Date }) {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <NavBar title="소식" />
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        <AlertsList role={role} items={items} error={error} onRetry={onRetry} now={now} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** 사건 줄 그림: 기한은 호박 시계, 선정·계약은 초록 체크, 그 밖은 파랑 문서(Muse 소식 카드) */
function kindIcon(a: AlertItem) {
  if (/기한|유효/.test(a.title)) return { Icon: Clock, fg: tokens.wait, bg: tokens.waitSoft };
  if (/선정|계약/.test(a.kind)) return { Icon: Check, fg: tokens.ok, bg: tokens.okSoft };
  if (/기관|시스템/.test(a.kind)) return { Icon: Info, fg: tokens.muted, bg: tokens.sunken };
  return { Icon: FileText, fg: tokens.primary, bg: tokens.accentSoft };
}

/** 소식 목록(소식 탭과 /alerts 가 같이 쓴다). 단추가 준 순서 그대로, 줄마다 언제 왔는지 */
export function AlertsList({ role, items, error, onRetry, now }: { role: AgentRole; items: AlertItem[] | null; error: string | null; onRetry: () => void; now?: Date }) {
  const open = (a: AlertItem) => {
    const href = alertHref(role, a);
    if (href) router.push(href);
    else if (a.href) void openWeb(`${DANCHU_URL}${a.href}`).catch(() => undefined);
  };
  if (error) return <View style={styles.pad}><StateView tone="error" title={error} actions={<Button title="다시 시도" kind="soft" tall onPress={onRetry} />} /></View>;
  if (items === null) return <Skeleton />;
  if (!items.length) return <View style={styles.pad}><StateView tone="empty" title="알림 없음" /></View>;
  return (
    <View>
      {items.map((a, i) => {
        const k = kindIcon(a);
        return (
          <Press key={a.id} label={`${a.read ? '' : '새 소식, '}${a.title}`} onPress={() => open(a)} disabled={!a.href} style={styles.row}>
            {i > 0 && <View style={styles.line} />}
            <View style={[styles.ico, { backgroundColor: k.bg }]}>
              <k.Icon size={17} weight="bold" color={k.fg} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt variant="museRow" numberOfLines={2}>
                {a.title}
              </Txt>
              {!!a.body && (
                <Txt variant="museBody" color={tokens.muted} numberOfLines={3}>
                  {a.body}
                </Txt>
              )}
              <View style={styles.meta}>
                <Txt variant="museSmall" color={tokens.muted}>
                  {a.kind}
                </Txt>
                <View style={{ flex: 1 }} />
                {!a.read && <View style={styles.dotOn} />}
                <Txt variant="museSmall" color={tokens.muted} tabular>
                  {ago(a.at, now)}
                </Txt>
              </View>
            </View>
          </Press>
        );
      })}
    </View>
  );
}

/** 12분, 3시간, 어제, 11월 20일 (기기 시간) */
export function ago(iso: string, now = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const min = Math.max(0, Math.round((now.getTime() - t) / 60000));
  if (min < 1) return '방금';
  if (min < 60) return `${min}분`;
  if (min < 60 * 24 && dayLabel(iso, now) === '오늘') return `${Math.floor(min / 60)}시간`;
  const d = dayLabel(iso, now);
  return d === '어제' ? `어제 ${hm(iso)}` : d;
}

function Skeleton() {
  return (
    <View accessibilityLabel="불러오는 중" accessibilityRole="progressbar">
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.row}>
          {i > 0 && <View style={styles.line} />}
          <View style={[styles.ico, { backgroundColor: tokens.sunken }]} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[styles.bone, { width: '64%' }]} />
            <View style={[styles.bone, { width: '90%' }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  pad: { paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  line: { position: 'absolute', top: 0, left: 18, right: 0, height: 1, backgroundColor: tokens.border },
  ico: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  dotOn: { width: 7, height: 7, borderRadius: 4, backgroundColor: tokens.primary },
  bone: { height: 13, borderRadius: 7, backgroundColor: tokens.sunken },
});
