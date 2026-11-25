// 비서 프로필(시안 원본 m10·m11). 위 캐릭터 108 + 연필(캐릭터 바꾸기) + 이름 20 + 상태(연결됨 초록 점, 확인 필요 파랑),
// 그림 다섯 칸: 활동·확인·견적서·예약 작업·정체성. 위 막대 캐릭터를 누르면 열린다(확인 필요면 확인 칸부터).
// 활동은 비서가 단추에서 바로 한 일과 허용을 받아 보낸 것, 확인은 결과를 봐야 하는 것과 허용 기록. 본문 원문은 없다(서버가 주지 않는다).
import { characterOf, type AgentCharacterId } from '@danchuai/core';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { CircleButton } from '@/components/shell/AgentHeader';
import { shareInvite } from '@/components/shell/InviteButton';
import { Button } from '@/components/ui/Button';
import { MIcon } from '@/components/ui/MIcon';
import { Group, Li, Seg5 } from '@/components/ui/Muse';
import { Press } from '@/components/ui/Press';
import { StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/Toast';
import { Txt } from '@/components/ui/Txt';
import { fonts, tokens } from '@/constants/theme';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { agentConfigured, listRuns, listSent, type AgentRole, type AssistRunView } from '@/lib/agentClient';
import { dayLabel } from '@/lib/alerts';
import { libraryRows, whenShort } from '@/lib/library';
import { needsLook, sentHref, sentLabel, STATUS_LABEL, type SentItem } from '@/lib/sent';
import { useAuth } from '@/lib/session';

export type ProfileTab = 'activity' | 'check' | 'quotes' | 'scheduled' | 'identity';
const TABS: { key: ProfileTab; label: string; icon: 'list' | 'shield' | 'doc' | 'clock' | 'person' }[] = [
  { key: 'activity', label: '활동', icon: 'list' },
  { key: 'check', label: '확인', icon: 'shield' },
  { key: 'quotes', label: '견적서', icon: 'doc' },
  { key: 'scheduled', label: '예약 작업', icon: 'clock' },
  { key: 'identity', label: '정체성', icon: 'person' },
];

interface ProfileData {
  sent: SentItem[];
  runs: AssistRunView[];
}

export default function AgentRoute() {
  const { role: raw, tab } = useLocalSearchParams<{ role?: string; tab?: string }>();
  const { org, status, character } = useAuth();
  const role: AgentRole = status === 'disabled' ? (raw === 'cro' ? 'cro' : 'requester') : org?.kind === 'cro' ? 'cro' : 'requester';
  const live = agentConfigured();
  const load = useCallback(() => Promise.all([listSent(role), role === 'cro' ? listRuns().catch(() => []) : Promise.resolve([])]).then(([sent, runs]) => ({ sent, runs })), [role]);
  const { state, reload } = useRemote<ProfileData>(load, live);
  return (
    <AgentProfileView
      role={role}
      character={character}
      live={live}
      data={!live ? { sent: [], runs: [] } : state.kind === 'ready' ? state.data : null}
      error={state.kind === 'error' ? REMOTE_ERROR[state.code] : null}
      onRetry={() => void reload()}
      initialTab={tab === 'check' ? 'check' : 'activity'}
    />
  );
}

/** 화면 모양만(미리보기에서도 쓴다) */
export function AgentProfileView({ role, character, live, data, error, onRetry, initialTab = 'activity', now }: { role: AgentRole; character: AgentCharacterId; live: boolean; data: ProfileData | null; error: string | null; onRetry: () => void; initialTab?: ProfileTab; now?: Date }) {
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const { toast } = useToast();
  const name = characterOf(character).name;
  const check = data ? needsLook(data.sent) : 0;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <CircleButton label="닫기" onPress={back}>
          <MIcon name="close" />
        </CircleButton>
        <CircleButton label="공유" onPress={() => void shareInvite(toast)}>
          <MIcon name="share" />
        </CircleButton>
      </View>
      <View style={styles.hero}>
        <Press label="캐릭터 바꾸기" onPress={() => router.push('/account/character' as Href)} style={styles.face}>
          <View style={{ margin: -8 }}>
            <AgentAvatar size={108} character={character} />
          </View>
          <View style={styles.pen}>
            <MIcon name="pencil" size={14} />
          </View>
        </Press>
        <Txt style={styles.name} accessibilityRole="header">
          {name}
        </Txt>
        {!live ? (
          <Txt style={styles.state} color={tokens.muted}>
            연결 전
          </Txt>
        ) : check > 0 ? (
          <View style={styles.stateRow}>
            <MIcon name="info" size={14} width={2.2} color={tokens.primary} />
            <Txt style={styles.state} color={tokens.primary}>
              확인 필요
            </Txt>
          </View>
        ) : (
          <View style={styles.stateRow}>
            <View style={styles.okDot} />
            <Txt style={styles.state}>연결됨</Txt>
          </View>
        )}
      </View>
      <View style={styles.segWrap}>
        <Seg5 items={TABS} value={tab} onChange={setTab} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {error ? (
          <StateView tone="error" title={error} actions={<Button title="다시 시도" kind="soft" tall onPress={onRetry} />} />
        ) : !data ? (
          <View accessibilityLabel="불러오는 중이에요" accessibilityRole="progressbar" style={{ gap: 14 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.bone} />
            ))}
          </View>
        ) : tab === 'activity' ? (
          <Activity role={role} data={data} now={now} />
        ) : tab === 'check' ? (
          <Check role={role} sent={data.sent} now={now} />
        ) : tab === 'quotes' ? (
          <Quotes role={role} data={data} now={now} />
        ) : tab === 'scheduled' ? (
          <StateView tone="empty" title="아직 예약 작업이 없어요" reason="정해 둔 시간에 하는 일이 생기면 여기 모여요" />
        ) : (
          <Identity role={role} name={name} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const hm = (iso: string) => {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')}`;
};

interface LogRow {
  id: string;
  title: string;
  line: string;
  at: string;
  bad: boolean;
  href: Href | null;
}

const RUN_LINE = { done: '다 했어요', failed: '단추가 받지 않았어요', unknown: '결과를 확인해 주세요' } as const;

function logRows(role: AgentRole, data: ProfileData): LogRow[] {
  const a: LogRow[] = data.runs.map((r) => ({ id: `r:${r.id}`, title: r.label, line: r.undone ? '되돌렸어요' : RUN_LINE[r.outcome], at: r.createdAt, bad: r.outcome !== 'done' && !r.undone, href: null }));
  const b: LogRow[] = data.sent.map((s) => ({ id: `s:${s.id}`, title: sentLabel(s.action), line: [s.rfqNo, STATUS_LABEL[s.status]].filter(Boolean).join(', '), at: s.at, bad: s.status === 'failed' || s.status === 'unknown', href: sentHref(role, s) }));
  return [...a, ...b].sort((x, y) => y.at.localeCompare(x.at)).slice(0, 40);
}

function Activity({ role, data, now }: { role: AgentRole; data: ProfileData; now?: Date }) {
  const rows = logRows(role, data);
  if (!rows.length) return <StateView tone="empty" title="아직 한 일이 없어요" reason="제가 단추에서 한 일은 모두 여기 남겨요" />;
  const days: { day: string; rows: LogRow[] }[] = [];
  for (const r of rows) {
    const day = dayLabel(r.at, now);
    if (days.at(-1)?.day === day) days.at(-1)!.rows.push(r);
    else days.push({ day, rows: [r] });
  }
  return (
    <>
      {days.map((d, i) => (
        <View key={d.day} style={i > 0 && { marginTop: 14 }}>
          <Txt style={styles.day} accessibilityRole="header">
            {d.day}
          </Txt>
          {d.rows.map((r) => (
            <Press key={r.id} label={`${r.title}, ${r.line}`} disabled={!r.href} onPress={() => r.href && router.push(r.href)} style={styles.log}>
              <View style={styles.logIc}>
                <MIcon name="library" size={16} color="#ffffff" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt style={styles.logTitle}>{r.title}</Txt>
                <Txt style={styles.logSub} color={tokens.muted}>
                  {r.line}
                </Txt>
                <Txt style={styles.logSub} color={tokens.muted} tabular>
                  {hm(r.at)}
                </Txt>
              </View>
              {r.bad ? <View style={styles.badDot} accessibilityLabel="확인 필요" /> : null}
            </Press>
          ))}
        </View>
      ))}
    </>
  );
}

function Check({ role, sent, now }: { role: AgentRole; sent: SentItem[]; now?: Date }) {
  const look = sent.filter((s) => s.status === 'unknown' || s.status === 'failed');
  const done = sent.filter((s) => s.status === 'sent' || s.status === 'rejected').slice(0, 20);
  const when = (iso: string) => `${dayLabel(iso, now)} ${hm(iso)}`;
  return (
    <>
      <Txt style={[styles.day, { marginBottom: 8 }]} accessibilityRole="header">
        확인할 것
      </Txt>
      {look.length ? (
        look.map((s) => {
          const href = sentHref(role, s);
          return (
            <View key={s.id} style={styles.checkRow}>
              <MIcon name="doc" />
              <View style={{ flex: 1 }}>
                <Txt style={styles.checkTitle}>{[s.rfqNo, sentLabel(s.action)].filter(Boolean).join(' ')}</Txt>
                <Txt style={styles.logSub} color={tokens.muted}>
                  {STATUS_LABEL[s.status]}
                </Txt>
                {href ? (
                  <Press label={`${sentLabel(s.action)} 보기`} onPress={() => router.push(href)} style={styles.see}>
                    <Txt style={styles.seeText} color={tokens.onPrimary}>
                      보기
                    </Txt>
                  </Press>
                ) : null}
              </View>
            </View>
          );
        })
      ) : (
        <Txt style={styles.logSub} color={tokens.muted}>
          지금 확인할 것이 없어요
        </Txt>
      )}
      <Txt style={[styles.day, { marginTop: 24, marginBottom: 8 }]} accessibilityRole="header">
        확인 기록
      </Txt>
      {done.length ? (
        done.map((s) => (
          <View key={s.id} style={[styles.checkRow, { marginBottom: 14 }]}>
            <MIcon name="doc" />
            <View style={{ flex: 1 }}>
              <Txt style={styles.checkTitle}>{sentLabel(s.action)}</Txt>
              {s.rfqNo ? (
                <Txt style={styles.histSub} color={tokens.muted}>
                  {`${s.rfqNo} ${sentLabel(s.action)}`}
                </Txt>
              ) : null}
              <Txt style={styles.logSub} color={tokens.muted} tabular>
                {`${s.status === 'sent' ? '허용했어요' : STATUS_LABEL[s.status]}, ${when(s.at)}`}
              </Txt>
            </View>
          </View>
        ))
      ) : (
        <Txt style={styles.logSub} color={tokens.muted}>
          아직 허용한 일이 없어요
        </Txt>
      )}
    </>
  );
}

function Quotes({ role, data, now }: { role: AgentRole; data: ProfileData; now?: Date }) {
  const rows = useMemo(() => libraryRows(data.sent, data.runs).filter((r) => /견적/.test(r.title)), [data]);
  if (!rows.length) return <StateView tone="empty" title={role === 'cro' ? '아직 만든 견적서가 없어요' : '아직 받은 견적이 없어요'} reason="견적서가 생기면 여기 모여요" />;
  return (
    <>
      {rows.map((r) => (
        <Press
          key={r.id}
          label={r.title}
          disabled={!r.rfqNo}
          onPress={() => r.rfqNo && router.push(role === 'cro' ? { pathname: '/lab/[id]', params: { id: r.rfqNo } } : { pathname: '/requester/[id]', params: { id: r.rfqNo } })}
          style={styles.doc}
        >
          <MIcon name="doc" />
          <View style={{ flex: 1 }}>
            <Txt style={styles.checkTitle}>{r.title}</Txt>
            <Txt style={styles.logSub} color={tokens.muted}>
              {whenShort(r.at, now)}
            </Txt>
          </View>
        </Press>
      ))}
    </>
  );
}

function Identity({ role, name }: { role: AgentRole; name: string }) {
  return (
    <View style={{ gap: 12 }}>
      <Group style={styles.grp}>
        <Li first icon="person" title="이름" value={name} chevron={false} />
        <Li icon="brush" title="캐릭터" value={name} onPress={() => router.push('/account/character' as Href)} />
      </Group>
      <Group style={styles.grp}>
        <Li first icon="doc" title="하는 일" sub={role === 'cro' ? '받은 요청 정리, 견적서 준비, 고객 기록, 계약 보고 준비' : '견적 요청서 채우기, 회신 모으기, 가이드라인 찾기'} chevron={false} />
        <Li icon="shield" title="밖으로 보내는 일" sub="보내기 전에 매번 허용을 받아요" onPress={() => router.push('/account/permissions' as Href)} />
      </Group>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  // 닫기·공유: 좌우 14, 위 20
  top: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 20, height: 62 },
  // 캐릭터 덩어리: 위 44부터, 사이 8
  hero: { alignItems: 'center', gap: 8, marginTop: -18 },
  face: { position: 'relative' },
  pen: { position: 'absolute', right: -2, bottom: 2, width: 26, height: 26, borderRadius: 13, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  name: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 28, color: tokens.text },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  state: { fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 20 },
  okDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: tokens.ok },
  segWrap: { paddingHorizontal: 14, marginTop: 18 },
  body: { paddingHorizontal: 16, paddingBottom: 32 },
  bone: { height: 46, borderRadius: 12, backgroundColor: tokens.sunken },
  day: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, marginBottom: 4 },
  log: { flexDirection: 'row', gap: 12, paddingVertical: 10, alignItems: 'flex-start' },
  logIc: { width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.logIcon, alignItems: 'center', justifyContent: 'center' },
  logTitle: { fontFamily: fonts.semibold, fontSize: 14.5, lineHeight: 21 },
  logSub: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17.5 },
  badDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: tokens.danger, marginTop: 6 },
  checkRow: { flexDirection: 'row', gap: 12 },
  checkTitle: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  histSub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  see: { marginTop: 10, height: 42, borderRadius: 21, backgroundColor: tokens.primary, alignItems: 'center', justifyContent: 'center' },
  seeText: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  doc: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12 },
  grp: { backgroundColor: tokens.group },
});
