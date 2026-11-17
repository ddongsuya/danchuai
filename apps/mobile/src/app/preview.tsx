// 화면 미리보기. 예시 값만 쓰고 서버를 부르지 않는다. 로그인 없이 열린다(_layout).
// /preview 는 목록, /preview?view=<이름> 은 그 화면 하나. 실제 화면과 같은 컴포넌트를 그대로 쓴다.
// 예시 값은 진단 문서 시안과 같다(사용자 선택 2026-11-17 "시안대로": DC-2026-0142, 가·나·다·라 기관, 후보물질 A). 실제 회사·사람·연락처는 넣지 않는다.
import type { RequestSheet } from '@danchuai/core';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { CaretRight, X } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountView } from '@/app/account/index';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { ConsentBody } from '@/components/auth/ConsentBody';
import { GateState, type GateKind } from '@/components/auth/GateState';
import { LogoutDialog } from '@/components/auth/LogoutDialog';
import { ChatShell } from '@/components/chat/ChatShell';
import { Composer } from '@/components/chat/Composer';
import { DraftCard } from '@/components/chat/DraftCard';
import { AgentText, StepLog, UserMessage } from '@/components/chat/Messages';
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
import { fonts, radius, space, tokens, u } from '@/constants/theme';
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
];
const LAB_FILTERS = [
  { label: '전체', match: null },
  { label: '할 일', match: ['new' as const, 'viewed' as const] },
  { label: '제출', match: ['sent' as const] },
  { label: '선정', match: ['selected' as const] },
];

const md = (n: number) => day(n).slice(5).replace('-', '.');
const REQ_ITEMS: InboxItem[] = [
  { id: 'DC-2026-0142', title: '랫드 4주 반복투여독성', sub: '비교표 열림', status: 'replied', when: md(0), icon: 'flask' },
  { id: 'c:demo', title: '복귀돌연변이시험', sub: '요청서 확인 전', status: 'waiting', when: md(-1), icon: 'dna' },
  { id: 'c:demo2', title: '비글견 단회투여독성', sub: '시험물질 묻는 중', status: 'drafting', when: md(-3), icon: 'flask' },
];
const LAB_ITEMS: InboxItem[] = [
  { id: 'DC-2026-0142', title: 'DC-2026-0142 반복투여독성', sub: '참여할지 정하기', status: 'new', when: '참여 결정', due: `참여 결정 ${md(3)}까지`, icon: 'flask' },
  { id: 'DC-2026-0139', title: 'DC-2026-0139 유전독성', sub: '선정 기다리는 중', status: 'sent', when: md(-2), icon: 'dna' },
];

const REQUEST: DanchuRequest = {
  no: 'DC-2026-0142',
  title: '랫드 4주 반복투여독성',
  categories: ['일반독성'],
  status: 'open',
  createdAt: `${day(-3)}T09:00:00+09:00`,
  joinBy: day(3),
  replyBy: day(9),
  sent: 12,
  joined: 4,
  submitted: 2,
  compareOpen: false,
  selected: false,
};
const WAITING: DanchuCompare = { open: false, joined: 4, submitted: 2, replyBy: day(9) };
const OPEN: DanchuCompare = {
  open: true,
  columns: [
    { lab: '가 기관', total: 48_500_000, weeks: 14, submittedAt: day(4) },
    { lab: '나 기관', total: 51_200_000, weeks: 12, submittedAt: day(5) },
    { lab: '다 기관', total: 49_800_000, weeks: 16, submittedAt: day(7) },
  ],
};

const LAB_TODO: DanchuLabItem = {
  no: 'DC-2026-0142',
  title: '랫드 4주 반복투여독성',
  categories: '반복투여독성',
  client: null,
  clientHint: '의뢰자(선정 전 비공개)',
  group: 'decide',
  stage: '참여 결정',
  next: '참여할지 정하기',
  due: day(3),
  steps: [
    { label: '요청 받음', at: '', state: 'done' },
    { label: '참여 결정', at: '', state: 'now' },
    { label: '견적 제출', at: '', state: 'next' },
  ],
  money: [],
};
const LAB_SENT: DanchuLabItem = {
  ...LAB_TODO,
  no: 'DC-2026-0139',
  title: '마우스 유전독성',
  categories: '유전독성',
  group: 'sent',
  stage: '견적 제출',
  next: '선정 기다리는 중',
  due: day(2),
  steps: [
    { label: '요청 받음', at: '', state: 'done' },
    { label: '견적 제출', at: '', state: 'done' },
    { label: '선정 결과', at: '', state: 'now' },
  ],
  money: [['제출 금액', '12,100,000원']],
};

const SHEET: RequestSheet = {
  modality: null,
  purpose: null,
  clinicalPlan: null,
  priorStudies: null,
  testType: '4주 반복투여 독성',
  substance: '후보물질 A',
  species: '랫드',
  route: '경구',
  duration: '4주, 회복 2주',
  glp: 'GLP',
  dueDate: null,
  notes: null,
};
const BODY = '시험물질 후보물질 A를 랫드에 4주간 경구 투여하고 2주 회복군을 두는 반복투여독성시험 견적을 요청해요. 시험물질은 1주 안에 보낼 수 있어요.';
/** 새 요청 대화 앞부분(시안 A07·A08과 같은 문장) */
const CHAT_HEAD = (
  <>
    <AgentText>어떤 시험 견적이 필요해요?</AgentText>
    <UserMessage text="랫드 4주 반복투여독성, 회복군 포함이요" />
  </>
);
const CHAT_FILLED = <AgentText>요청서를 다 채웠어요.</AgentText>;
const CHOICES: SendChoices = { purpose: null, intent: '비교 견적', confid: '일반', categories: ['일반독성'], replyBy: '', agreed: false };

type View_ = { key: string; label: string; group: string };
const VIEWS: View_[] = [
  { key: 'inbox', label: '요청함(의뢰자)', group: '요청함' },
  { key: 'inbox-lab', label: '요청함(기관)', group: '요청함' },
  { key: 'inbox-empty', label: '요청함, 요청 없음', group: '요청함' },
  { key: 'inbox-error', label: '요청함, 불러오기 실패', group: '요청함' },
  { key: 'chat', label: '새 요청 대화, 질문 카드', group: '새 요청' },
  { key: 'draft', label: '요청 본문 초안', group: '새 요청' },
  { key: 'approve', label: '요청서 확인(승인 카드)', group: '새 요청' },
  { key: 'approve-sending', label: '요청서 확인, 요청하는 중', group: '새 요청' },
  { key: 'done', label: '요청 완료', group: '새 요청' },
  { key: 'request', label: '진행, 회신 받는 중', group: '진행·비교' },
  { key: 'compare', label: '진행, 비교표 열림', group: '진행·비교' },
  { key: 'lab', label: '받은 요청, 할 일 있음', group: '기관' },
  { key: 'lab-sent', label: '받은 요청, 제출 뒤', group: '기관' },
  { key: 'gate-error', label: '계정 불러오기 실패', group: '관문·계정' },
  { key: 'gate-wait', label: '기관 승인 대기', group: '관문·계정' },
  { key: 'gate-other', label: '에이전트를 쓰지 않는 계정', group: '관문·계정' },
  { key: 'consent', label: '국외 이전 동의', group: '관문·계정' },
  { key: 'account', label: '계정', group: '관문·계정' },
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
          <X size={u(22)} color={tokens.text} />
        </IconButton>
        <Txt variant="nav" style={styles.title} accessibilityRole="header">
          화면 미리보기
        </Txt>
        <View style={{ width: u(44) }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Txt variant="caption" color={tokens.muted} style={{ paddingHorizontal: u(4) }}>
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
                  <CaretRight size={u(16)} color={tokens.faint} />
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
      return <InboxScreen role="requester" items={REQ_ITEMS} filters={REQ_FILTERS} hrefOf={() => toView('compare')} switchTo={toView('inbox-lab')} switchLabel="기관 화면으로 바꾸기" />;
    case 'inbox-lab':
      return <InboxScreen role="cro" title="받은 요청" items={LAB_ITEMS} filters={LAB_FILTERS} hrefOf={() => toView('lab')} switchTo={toView('inbox')} switchLabel="의뢰자 화면으로 바꾸기" />;
    case 'inbox-empty':
      return <InboxScreen role="requester" items={[]} filters={REQ_FILTERS} hrefOf={() => toView('compare')} switchTo={toView('inbox-lab')} switchLabel="기관 화면으로 바꾸기" />;
    case 'inbox-error':
      return (
        <InboxScreen
          role="requester"
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
          <StepLog steps={[{ label: '요청서 항목 맞추는 중', state: 'now' }]} />
          <QuestionCard title="투여 경로" questions={[{ id: 'route', label: '어떤 경로로 투여해요?', options: ['경구', '정맥', '피하'] }]} onSubmit={() => router.push(toView('approve'))} onSkip={noop} />
        </ChatShell>
      );
    case 'draft':
      return (
        <ChatShell title="새 요청" bottom={<Composer onSend={noop} />}>
          {CHAT_HEAD}
          {CHAT_FILLED}
          <DraftCard title="요청 본문 초안" body={BODY} action="요청서 확인" onAction={() => router.push(toView('approve'))} />
        </ChatShell>
      );
    case 'approve-sending':
      return (
        <ChatShell title="새 요청" dim bottom={<DanchuApprovalCard sheet={SHEET} body={BODY} choices={{ ...CHOICES, purpose: '허가자료 제출용' }} onChange={noop} sending onClose={noop} onApprove={noop} />}>
          {CHAT_HEAD}
          {CHAT_FILLED}
        </ChatShell>
      );
    case 'account':
      return <AccountView name="바이오랩" role="의뢰자" consent={day(0).slice(5).replace('-', '.')} onManage={noop} onLogout={() => router.push(toView('logout'))} />;
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
            meta="DC-2026-0142"
            rows={[['회신 기한', '11.26(목)']]}
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
          titleVariant="title2"
          gap={u(14)}
          footer={
            <>
              <Button title="필수 동의하고 시작" tall onPress={() => router.back()} />
              <Button title="로그아웃" kind="text" onPress={() => router.back()} />
            </>
          }
        >
          <ConsentBody />
        </AuthScreen>
      );
    case 'logout':
      return (
        <>
          <AccountView name="바이오랩" role="의뢰자" consent={day(0).slice(5).replace('-', '.')} onManage={noop} onLogout={() => setDialog(true)} />
          <LogoutDialog visible={dialog} onClose={() => setDialog(false)} onConfirm={() => setDialog(false)} />
        </>
      );
    case 'notfound':
      return <NotFound label="요청을 찾을 수 없어요" />;
    default:
      return <NotFound label="없는 미리보기예요" reason="목록에 없는 화면이에요." />;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: u(14), paddingTop: u(6), paddingBottom: u(10) },
  title: { flex: 1, textAlign: 'center' },
  body: { paddingHorizontal: space.xl, paddingBottom: space.xxl, paddingTop: space.md, gap: space.sm },
  gh: { fontFamily: fonts.bold, paddingHorizontal: u(4), paddingTop: space.md, paddingBottom: space.sm },
  grp: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' },
  gi: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: u(52) },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
});
