// 화면 미리보기. 예시 값만 쓰고 서버를 부르지 않는다. 로그인 없이 열린다(_layout).
// /preview 는 목록, /preview?view=<이름> 은 그 화면 하나. 실제 화면과 같은 컴포넌트를 그대로 쓴다.
// 예시 값에 실제 회사·사람·연락처는 넣지 않는다(기관 A·B·C, 시험물질 A).
import type { RequestSheet } from '@danchuai/core';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { CaretRight, X } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { ConsentBody } from '@/components/auth/ConsentBody';
import { GateState, type GateKind } from '@/components/auth/GateState';
import { LogoutDialog } from '@/components/auth/LogoutDialog';
import { ChatShell } from '@/components/chat/ChatShell';
import { Composer } from '@/components/chat/Composer';
import { AgentText, UserMessage } from '@/components/chat/Messages';
import { NotFound } from '@/components/chat/NotFound';
import { QuestionCard } from '@/components/chat/QuestionCard';
import { InboxScreen } from '@/components/inbox/InboxScreen';
import { DanchuLabView } from '@/components/lab/DanchuLab';
import { DanchuApprovalCard } from '@/components/request/DanchuApprovalCard';
import { DanchuRequestView } from '@/components/request/DanchuRequest';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Press } from '@/components/ui/Press';
import { ResultBlock } from '@/components/ui/ResultBlock';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';
import { REMOTE_ERROR } from '@/hooks/useRemote';
import type { SendChoices } from '@/lib/danchuRequest';
import type { InboxItem } from '@/lib/inbox';
import type { DanchuCompare, DanchuLabItem, DanchuRequest } from '@/lib/marketClient';

/** 오늘에서 n일 뒤 날짜(YYYY-MM-DD, 기기 날짜). 기한 숫자가 늘 그럴듯하게 보이도록 */
const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const REQ_FILTERS = [
  { label: '전체', match: null },
  { label: '회신 도착', match: ['replied' as const] },
  { label: '승인 대기', match: ['waiting' as const] },
  { label: '작성 중', match: ['drafting' as const] },
];
const LAB_FILTERS = [
  { label: '전체', match: null },
  { label: '할 일', match: ['new' as const, 'viewed' as const] },
  { label: '제출', match: ['sent' as const] },
  { label: '선정', match: ['selected' as const] },
];

const REQ_ITEMS: InboxItem[] = [
  { id: 'RFQ-0003', title: '랫드 4주 반복투여 독성', sub: '3곳 중 3곳 회신, 비교표 열림', status: 'replied', when: '오늘', icon: 'flask' },
  { id: 'RFQ-0002', title: '복귀돌연변이 시험', sub: '4곳 중 1곳 회신', status: 'sent', when: '어제', icon: 'dna' },
  { id: 'c:demo', title: '비글견 단회 투여 PK', sub: '요청서 확인 전', status: 'waiting', when: '11월 12일', icon: 'drop' },
  { id: 'c:demo2', title: '피부 자극 시험', sub: '시험물질 묻는 중', status: 'drafting', when: '11월 10일', icon: 'flask' },
];
const LAB_ITEMS: InboxItem[] = [
  { id: 'RFQ-0005', title: '랫드 13주 반복투여 독성', sub: `참여할지 정하기, ${day(3).slice(5).replace('-', '.')}까지`, status: 'new', when: '참여 결정', icon: 'flask' },
  { id: 'RFQ-0004', title: '소핵 시험', sub: `견적 쓰기, ${day(6).slice(5).replace('-', '.')}까지`, status: 'viewed', when: '견적 작성', icon: 'dna' },
  { id: 'RFQ-0001', title: '마우스 PK', sub: '선정 기다리는 중', status: 'sent', when: '견적 제출', icon: 'drop' },
];

const REQUEST: DanchuRequest = {
  no: 'RFQ-0003',
  title: '랫드 4주 반복투여 독성, 시험물질 A',
  categories: ['일반독성'],
  status: 'open',
  createdAt: `${day(-6)}T09:00:00+09:00`,
  joinBy: day(-3),
  replyBy: day(4),
  sent: 6,
  joined: 3,
  submitted: 2,
  compareOpen: false,
  selected: false,
};
const WAITING: DanchuCompare = { open: false, joined: 3, submitted: 2, replyBy: day(4) };
const OPEN: DanchuCompare = {
  open: true,
  columns: [
    { lab: '기관 A', total: 48_400_000, weeks: 10, submittedAt: day(-4) },
    { lab: '기관 B', total: 52_800_000, weeks: 9, submittedAt: day(-2) },
    { lab: '기관 C', total: null, weeks: 12, submittedAt: day(-1) },
  ],
};

const LAB_TODO: DanchuLabItem = {
  no: 'RFQ-0005',
  title: '랫드 13주 반복투여 독성',
  categories: '일반독성',
  client: null,
  clientHint: '의뢰자(선정 전 비공개)',
  group: 'decide',
  stage: '참여 결정',
  next: '참여할지 정하기',
  due: day(3),
  steps: [
    { label: '요청 받음', at: day(-1).slice(5).replace('-', '.'), state: 'done' },
    { label: '참여 결정', at: `${day(3).slice(5).replace('-', '.')}까지`, state: 'now' },
    { label: '견적 제출', at: '', state: 'next' },
    { label: '비교표 열림', at: '', state: 'next' },
  ],
  money: [],
};
const LAB_SENT: DanchuLabItem = {
  ...LAB_TODO,
  no: 'RFQ-0001',
  title: '마우스 PK',
  group: 'sent',
  stage: '견적 제출',
  next: '선정 기다리는 중',
  due: day(2),
  steps: [
    { label: '요청 받음', at: day(-8).slice(5).replace('-', '.'), state: 'done' },
    { label: '견적 제출', at: day(-2).slice(5).replace('-', '.'), state: 'done' },
    { label: '선정 결과', at: '', state: 'now' },
  ],
  money: [['제출 금액', '12,100,000원']],
};

const SHEET: RequestSheet = {
  testType: '4주 반복투여 독성',
  substance: '시험물질 A (저분자)',
  species: '랫드',
  route: '경구',
  duration: '4주, 회복 2주',
  glp: 'GLP',
  dueDate: null,
  notes: null,
};
const BODY = '시험물질 A(저분자)의 랫드 4주 경구 반복투여 독성시험(회복 2주 포함, GLP) 견적을 요청드려요. 시험물질은 1주 안에 보낼 수 있어요.';
/** 새 요청 대화 앞부분(시안 A와 같은 흐름) */
const CHAT_HEAD = (
  <>
    <AgentText>어떤 시험 견적이 필요해요?</AgentText>
    <UserMessage text="랫드 4주 반복투여 독성, 회복군 2주 포함이요. 시험물질은 시험물질 A예요." />
    <AgentText>요청서에 넣었어요. 투여 경로만 알려 주세요.</AgentText>
  </>
);
const CHAT_FILLED = (
  <>
    <UserMessage text="경구" />
    <AgentText>요청서를 다 채웠어요. 의뢰 목적만 정하면 단추에 보낼 수 있어요.</AgentText>
  </>
);
const CHOICES: SendChoices = { purpose: null, intent: '비교 견적', confid: '일반', categories: ['일반독성'], replyBy: '', agreed: false };

type View_ = { key: string; label: string; group: string };
const VIEWS: View_[] = [
  { key: 'inbox', label: '요청함(의뢰자)', group: '요청함' },
  { key: 'inbox-lab', label: '요청함(기관)', group: '요청함' },
  { key: 'inbox-empty', label: '요청함, 요청 없음', group: '요청함' },
  { key: 'inbox-error', label: '요청함, 불러오기 실패', group: '요청함' },
  { key: 'chat', label: '새 요청 대화, 질문 카드', group: '새 요청' },
  { key: 'approve', label: '요청서 확인(승인 카드)', group: '새 요청' },
  { key: 'done', label: '요청 완료', group: '새 요청' },
  { key: 'request', label: '진행, 회신 받는 중', group: '진행·비교' },
  { key: 'compare', label: '진행, 비교표 열림', group: '진행·비교' },
  { key: 'lab', label: '받은 요청, 할 일 있음', group: '기관' },
  { key: 'lab-sent', label: '받은 요청, 제출 뒤', group: '기관' },
  { key: 'gate-error', label: '계정 불러오기 실패', group: '관문·계정' },
  { key: 'gate-wait', label: '기관 승인 대기', group: '관문·계정' },
  { key: 'gate-other', label: '에이전트를 쓰지 않는 계정', group: '관문·계정' },
  { key: 'consent', label: '국외 이전 동의', group: '관문·계정' },
  { key: 'logout', label: '로그아웃 확인', group: '관문·계정' },
  { key: 'notfound', label: '찾을 수 없는 요청', group: '관문·계정' },
];

const toView = (key: string): Href => ({ pathname: '/preview', params: { view: key } });
const noop = () => undefined;

export default function Preview() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  if (!view) return <PreviewList />;
  return <PreviewView view={view} />;
}

function PreviewList() {
  const groups = useMemo(() => [...new Set(VIEWS.map((v) => v.group))], []);
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.nav}>
        <IconButton label="닫기" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <X size={20} color={tokens.text} />
        </IconButton>
        <Txt variant="nav" style={styles.title} accessibilityRole="header">
          화면 미리보기
        </Txt>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Txt variant="caption" color={tokens.muted} style={{ paddingHorizontal: 4 }}>
          예시 데이터
        </Txt>
        {groups.map((g) => (
          <View key={g}>
            <Txt variant="caption" color={tokens.muted} style={styles.gh}>
              {g}
            </Txt>
            <View style={styles.grp}>
              {VIEWS.filter((v) => v.group === g).map((v, i) => (
                <Press key={v.key} label={v.label} accessibilityRole="link" onPress={() => router.push(toView(v.key))} style={[styles.gi, i > 0 && styles.line]}>
                  <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
                    {v.label}
                  </Txt>
                  <CaretRight size={16} color={tokens.faint} />
                </Press>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function PreviewView({ view }: { view: string }) {
  const [choices, setChoices] = useState<SendChoices>(CHOICES);
  const [dialog, setDialog] = useState(true);

  switch (view) {
    case 'inbox':
      return <InboxScreen role="requester" placeholder="어떤 시험을 맡길까요?" items={REQ_ITEMS} filters={REQ_FILTERS} hrefOf={() => toView('compare')} switchTo={toView('inbox-lab')} switchLabel="기관 화면으로 바꾸기" />;
    case 'inbox-lab':
      return <InboxScreen role="cro" title="받은 요청" placeholder="가이드라인을 물어보세요" items={LAB_ITEMS} filters={LAB_FILTERS} hrefOf={() => toView('lab')} switchTo={toView('inbox')} switchLabel="의뢰자 화면으로 바꾸기" />;
    case 'inbox-empty':
      return <InboxScreen role="requester" placeholder="어떤 시험을 맡길까요?" items={[]} filters={REQ_FILTERS} hrefOf={() => toView('compare')} switchTo={toView('inbox-lab')} switchLabel="기관 화면으로 바꾸기" />;
    case 'inbox-error':
      return (
        <InboxScreen
          role="requester"
          placeholder="어떤 시험을 맡길까요?"
          items={[]}
          load="error"
          errorLabel={REMOTE_ERROR.network}
          onRetry={noop}
          filters={REQ_FILTERS}
          hrefOf={() => toView('compare')}
          switchTo={toView('inbox-lab')}
          switchLabel="기관 화면으로 바꾸기"
        />
      );
    case 'chat':
      return (
        <ChatShell title="새 요청" bottom={<Composer onSend={noop} />}>
          {CHAT_HEAD}
          <QuestionCard title="투여 경로" questions={[{ id: 'route', label: '어떤 경로로 투여해요?', options: ['경구', '정맥', '피하'] }]} onSubmit={() => router.push(toView('approve'))} onSkip={noop} />
        </ChatShell>
      );
    case 'approve':
      return (
        <ChatShell
          title="새 요청"
          dim
          bottom={<DanchuApprovalCard sheet={SHEET} body={BODY} choices={choices} onChange={setChoices} sending={false} onClose={() => router.back()} onApprove={() => router.push(toView('done'))} />}
        >
          {CHAT_HEAD}
          {CHAT_FILLED}
        </ChatShell>
      );
    case 'done':
      return (
        <ChatShell title="새 요청" bottom={<Composer onSend={noop} />}>
          {CHAT_HEAD}
          {CHAT_FILLED}
          <ResultBlock
            title="단추에 요청했어요"
            meta="RFQ-0003"
            rows={[
              ['받는 곳', '분야가 맞는 참여 기관 전체'],
              ['회신 기한', '7영업일 후'],
            ]}
            action={<Button title="진행 보기" tall onPress={() => router.push(toView('request'))} />}
          />
        </ChatShell>
      );
    case 'request':
      return <DanchuRequestView data={{ request: REQUEST, compare: WAITING }} />;
    case 'compare':
      return <DanchuRequestView data={{ request: { ...REQUEST, submitted: 3, compareOpen: true }, compare: OPEN }} />;
    case 'lab':
      return <DanchuLabView it={LAB_TODO} />;
    case 'lab-sent':
      return <DanchuLabView it={LAB_SENT} />;
    case 'gate-error':
    case 'gate-wait':
    case 'gate-other': {
      const kind: GateKind = view === 'gate-error' ? 'error' : view === 'gate-wait' ? 'org_not_ready' : 'unsupported';
      return <GateState kind={kind} onRetry={() => new Promise((r) => setTimeout(r, 1200))} onSignOut={() => router.back()} />;
    }
    case 'consent':
      return (
        <AuthScreen
          title={'에이전트를 쓰려면\n국외 이전 동의가 필요해요'}
          footer={
            <>
              <Button title="동의하고 시작" tall onPress={() => router.back()} />
              <Button title="로그아웃" kind="text" onPress={() => router.back()} />
            </>
          }
        >
          <ConsentBody />
        </AuthScreen>
      );
    case 'logout':
      return (
        <SafeAreaView style={styles.root}>
          <View style={styles.body}>
            <Button title="로그아웃 확인 다시 열기" kind="soft" tall onPress={() => setDialog(true)} />
          </View>
          <LogoutDialog visible={dialog} onClose={() => setDialog(false)} onConfirm={() => setDialog(false)} />
        </SafeAreaView>
      );
    case 'notfound':
      return <NotFound label="요청을 찾을 수 없어요" />;
    default:
      return <NotFound label="없는 미리보기예요" reason="목록에 없는 화면이에요." />;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10 },
  title: { flex: 1, textAlign: 'center' },
  body: { paddingHorizontal: space.xl, paddingBottom: space.xxl, paddingTop: space.md, gap: space.sm },
  gh: { fontFamily: fonts.bold, paddingHorizontal: 4, paddingTop: space.md, paddingBottom: space.sm },
  grp: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' },
  gi: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 52 },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
});
